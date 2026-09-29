import xlsx from "xlsx";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { ExpenseRow, PremiumRow } from "./types.js";

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const parseWorkbook = (buffer: Buffer) => {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No se encontro hoja en el archivo.");
  const sheet = workbook.Sheets[sheetName];
  // Excel puede declarar filas vacías con formato hasta el final de la hoja.
  // Recorrer únicamente el rango que contiene valores reales.
  let lastRow = 0;
  let lastColumn = 0;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!") || sheet[address]?.v == null) continue;
    const cell = xlsx.utils.decode_cell(address);
    lastRow = Math.max(lastRow, cell.r);
    lastColumn = Math.max(lastColumn, cell.c);
  }
  sheet["!ref"] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } });
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (rows.length === 0) throw new Error("Hoja sin datos.");
  return rows;
};

// CSV UTF-8 estricto, con BOM opcional y campos RFC 4180 (incluidos saltos de línea).
function* parseCsv(buffer: Buffer): Generator<Record<string, unknown>> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  let quoted = false;
  let commas = 0, semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (char === ",") commas++;
      if (char === ";") semicolons++;
    }
  }
  const delimiter = semicolons > commas ? ";" : ",";
  let keys: string[] | undefined;
  let record: string[] = [], parts: string[] = [], closed = false, fieldStart = 0;
  quoted = false;
  // Cortar segmentos evita crear cadenas enlazadas carácter a carácter por cada celda.
  const endField = (index: number) => {
    if (!closed) parts.push(text.slice(fieldStart, index));
    record.push(parts.join(""));
    parts = []; closed = false; fieldStart = index + 1;
  };
  const endRecord = (index: number) => {
    endField(index);
    const values = record;
    record = [];
    if (!values.some(value => value.trim() !== "")) return;
    if (!keys) {
      const used = new Set<string>();
      keys = values.map(header => {
        const base = header || "__EMPTY";
        let key = base;
        for (let suffix = 1; used.has(key); suffix++) key = `${base}_${suffix}`;
        used.add(key);
        return key;
      });
      return;
    }
    if (values.length !== keys.length) throw new Error("Número de columnas CSV inconsistente.");
    const result: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < keys.length; index++) result[keys[index]] = values[index];
    return result;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        parts.push(text.slice(fieldStart, i));
        if (text[i + 1] === '"') { parts.push('"'); i++; fieldStart = i + 1; }
        else { quoted = false; closed = true; }
      }
    } else if (char === delimiter) endField(i);
    else if (char === "\r" || char === "\n") {
      const completed = endRecord(i);
      if (char === "\r" && text[i + 1] === "\n") i++;
      fieldStart = i + 1;
      if (completed) yield completed;
    } else if (char === '"' && i === fieldStart && !closed) {
      quoted = true; fieldStart = i + 1;
    } else if (closed || char === '"') throw new Error("Comillas CSV inválidas.");
  }
  if (quoted) throw new Error("Campo CSV sin cierre de comillas.");
  const completed = endRecord(text.length);
  if (completed) yield completed;
}

const parseExcelDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Exportaciones CSV de Excel: seriales y fechas locales día/mes/año.
    if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) return parseExcelDate(Number(trimmed));
    const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/.exec(trimmed);
    if (local) {
      const day = Number(local[1]), month = Number(local[2]);
      const rawYear = Number(local[3]);
      // CSV local dd/mm/aa: 00–49 = 2000–2049; 50–99 = 1950–1999.
      // No delegar fechas ambiguas a Date, que interpreta mes/día/año.
      const year = local[3].length === 2 ? rawYear + (rawYear < 50 ? 2000 : 1900) : rawYear;
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const toPeriod = (value: unknown): string | null => {
  const date = parseExcelDate(value);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const parseNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const withoutLabel = value.replace(/uf/gi, "").replace(/\s/g, "");
    const hasComma = withoutLabel.includes(",");
    const hasDot = withoutLabel.includes(".");
    let normalized = withoutLabel;
    if (hasComma && hasDot) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else if (hasComma) normalized = normalized.replace(",", ".");
    normalized = normalized.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const findHeaderKey = (headers: string[], candidates: string[]) => {
  const normalized = new Map(headers.map((header) => [normalizeKey(header), header]));
  for (const candidate of candidates) {
    const key = normalized.get(normalizeKey(candidate));
    if (key) return key;
  }
  return null;
};

const coverageFromPlan = (raw: unknown) => {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("dental")) return "Dental";
  if (value.includes("catastr")) return "Catastrófico";
  if (value.includes("vida")) return "Vida";
  if (value.includes("salud")) return "Salud";
  return "Salud";
};

export const parsePremiums = (buffer: Buffer): PremiumRow[] => parsePremiumRows(parseWorkbook(buffer));

const parsePremiumRows = (rows: Record<string, unknown>[]): PremiumRow[] => {
  const headers = Object.keys(rows[0]);
  const clientNameKey = findHeaderKey(headers, ["Nombre Cliente", "Nombe Cliente"]);
  const clientRutKey = findHeaderKey(headers, ["Rut Cliente"]);
  const periodKey = findHeaderKey(headers, ["Periodo"]);
  const coverageKey = findHeaderKey(headers, ["Cobertura"]);
  const premiumKey = findHeaderKey(headers, ["Prima UF"]);
  const spendKey = findHeaderKey(headers, ["Gasto UF"]);

  const policyKey = findHeaderKey(headers, ["Póliza"]);
  const holdersKey = findHeaderKey(headers, ["N.º titulares", "Titulares"]);
  const dependentsKey = findHeaderKey(headers, ["N.º carga", "N.º cargas", "Cargas"]);
  const kamKey = findHeaderKey(headers, ["KAM", "AKM"]);
  const managerKey = findHeaderKey(headers, ["Jefe"]);
  const renewalKey = findHeaderKey(headers, ["Fecha renovación", "Renovación"]);
  const count = (value: unknown): number | null => {
    if (value === "" || value == null) return null;
    const number = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isSafeInteger(number) || number < 0) throw new Error("Cantidad de asegurados inválida.");
    return number;
  };

  if (!clientNameKey || !periodKey || !coverageKey || !premiumKey || !spendKey) {
    throw new Error("Headers de primas no coinciden con el formato esperado.");
  }

  return rows
    .map((row): PremiumRow | null => {
      const clientName = String(row[clientNameKey] ?? "").trim();
      const period = toPeriod(row[periodKey]);
      if (!clientName || !period) return null;
      return {
        clientName,
        clientRut: clientRutKey ? String(row[clientRutKey] ?? "").trim() : undefined,
        period,
        coverage: String(row[coverageKey] ?? "").trim(),
        policy: policyKey ? String(row[policyKey] ?? "").trim() : "",
        holders: holdersKey ? count(row[holdersKey]) : null,
        dependents: dependentsKey ? count(row[dependentsKey]) : null,
        kam: kamKey ? String(row[kamKey] ?? "").trim() : "",
        manager: managerKey ? String(row[managerKey] ?? "").trim() : "",
        renewalDate: renewalKey ? parseExcelDate(row[renewalKey])?.toISOString().slice(0, 10) ?? null : null,
        premiumUf: parseNumber(row[premiumKey]),
        spendUf: parseNumber(row[spendKey]),
      };
    })
    .filter((row): row is PremiumRow => row !== null);
};

export const parseExpenses = (buffer: Buffer): ExpenseRow[] => parseExpenseRows(parseWorkbook(buffer));

const parseExpenseRows = (rows: Record<string, unknown>[]): ExpenseRow[] => {
  const headers = Object.keys(rows[0]);
  const clientNameKey = findHeaderKey(headers, ["Nombre Con", "Nombre Cliente", "Nombe Cliente"]);
  const periodKey = findHeaderKey(headers, ["PERIODO", "Periodo"]);
  const descKey = findHeaderKey(headers, ["Clasif.Cob"]);
  const reembolsoKey = findHeaderKey(headers, ["Reembolso"]);
  const planKey = findHeaderKey(headers, ["Desc.Plan"]);
  const providerKey = findHeaderKey(headers, ["Desc.Insti"]);
  const insuredRutKey = findHeaderKey(headers, ["Rut"]);
  const patientRutKey = findHeaderKey(headers, ["Paciente"]);
  const patientDvKey = findHeaderKey(headers, ["dvg", "DV Paciente"]);
  const relationKey = findHeaderKey(headers, ["Parentesco"]);
  const isapreKey = findHeaderKey(headers, ["Dsc.Isapre"]);
  const valPrestKey = findHeaderKey(headers, ["Val.Prest."]);
  const valBonifKey = findHeaderKey(headers, ["Val.Bonif."]);
  const mtoReclamKey = findHeaderKey(headers, ["Mto.Reclam"]);

  if (!clientNameKey || !periodKey || !descKey || !reembolsoKey) {
    throw new Error("Headers de gastos no coinciden con el formato esperado (Clasif.Cob requerido).");
  }

  return rows
    .map((row) => {
      const clientName = String(row[clientNameKey] ?? "").trim();
      const period = toPeriod(row[periodKey]);
      if (!clientName || !period) return null;
      const descCoberRaw = String(row[descKey] ?? "").trim();
      const patientBase = patientRutKey ? String(row[patientRutKey] ?? "").trim() : "";
      const patientDv = patientDvKey ? String(row[patientDvKey] ?? "").trim() : "";
      return {
        clientName,
        period,
        coverage: coverageFromPlan(planKey ? row[planKey] : ""),
        descCober: descCoberRaw || "(Sin descripción)",
        reembolsoUf: parseNumber(row[reembolsoKey]),
        provider: providerKey ? String(row[providerKey] ?? "").trim() || "(Sin prestador)" : "(Sin prestador)",
        insuredRut: insuredRutKey ? String(row[insuredRutKey] ?? "").trim() || "(Sin rut)" : "(Sin rut)",
        patientRut: patientBase ? `${patientBase}${patientDv ? `-${patientDv}` : ""}` : "(Sin rut paciente)",
        relation: relationKey ? String(row[relationKey] ?? "").trim().toUpperCase() : "",
        isapre: isapreKey ? String(row[isapreKey] ?? "").trim() || "(Sin isapre)" : "(Sin isapre)",
        valPrest: valPrestKey ? parseNumber(row[valPrestKey]) : 0,
        valBonif: valBonifKey ? parseNumber(row[valBonifKey]) : 0,
        mtoReclam: mtoReclamKey ? parseNumber(row[mtoReclamKey]) : 0,
      };
    })
    .filter((row): row is ExpenseRow => row !== null);
};

// La carga HTTP usa streaming: no materializar todas las celdas y hojas del ZIP.
export function parseUpload(buffer: Buffer, kind: "primas", filename?: string): Promise<PremiumRow[]>;
export function parseUpload(buffer: Buffer, kind: "gastos", filename?: string): Promise<ExpenseRow[]>;
export async function parseUpload(buffer: Buffer, kind: "primas" | "gastos", filename?: string) {
  if (filename?.toLowerCase().endsWith(".csv")) {
    // Solo retener 250 registros con todas las columnas. Las filas finales contienen
    // únicamente los campos utilizados por los reportes, igual que en XLSX.
    const rows: (PremiumRow | ExpenseRow)[] = [];
    let batch: Record<string, unknown>[] = [];
    const flush = () => {
      if (!batch.length) return;
      rows.push(...(kind === "primas" ? parsePremiumRows(batch) : parseExpenseRows(batch)));
      batch = [];
    };
    for (const record of parseCsv(buffer)) {
      batch.push(record);
      if (batch.length >= 250) {
        flush();
        // Dar paso a las consultas de sesión/salud mientras se procesa un CSV grande.
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
    flush();
    if (!rows.length) throw new Error("CSV sin datos.");
    return rows;
  }
  if (buffer.length < 2 || buffer.readUInt16LE(0) !== 0x4b50) {
    return kind === "primas" ? parsePremiums(buffer) : parseExpenses(buffer);
  }
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buffer]), {
    worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", entries: "ignore",
  });
  const rows: (PremiumRow | ExpenseRow)[] = [];
  let batch: Record<string, unknown>[] = [];
  const flush = () => {
    if (!batch.length) return;
    rows.push(...(kind === "primas" ? parsePremiumRows(batch) : parseExpenseRows(batch)));
    batch = [];
  };
  let firstSheet = true;
  const valueOf = (value: ExcelJS.CellValue): unknown => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("result" in value) return value.result ?? "";
      if ("richText" in value) return value.richText.map(part => part.text).join("");
      if ("text" in value) return value.text;
      return "";
    }
    return value ?? "";
  };
  for await (const sheet of workbook) {
    const headers: string[] = [];
    for await (const row of sheet) {
      if (!firstSheet) continue;
      if (row.number === 1) {
        const used = new Set<string>();
        for (let column = 1; column <= row.cellCount; column++) {
          const base = String(valueOf(row.getCell(column).value) || "__EMPTY");
          let header = base;
          for (let suffix = 1; used.has(header); suffix++) header = `${base}_${suffix}`;
          used.add(header);
          headers.push(header);
        }
      } else if (row.hasValues) {
        const record: Record<string, unknown> = Object.create(null);
        headers.forEach((header, index) => { record[header] = valueOf(row.getCell(index + 1).value); });
        batch.push(record);
        if (batch.length >= 250) flush();
      }
    }
    // Consumir también las hojas restantes permite al lector liberar sus temporales.
    firstSheet = false;
  }
  flush();
  if (!rows.length) throw new Error("Hoja sin datos.");
  return rows;
}
