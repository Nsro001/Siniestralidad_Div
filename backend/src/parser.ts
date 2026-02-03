import xlsx from "xlsx";
import { ExpenseRow, PremiumRow } from "./types.js";

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const parseWorkbook = (buffer: Buffer) => {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No se encontro hoja en el archivo.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (rows.length === 0) {
    throw new Error("Hoja sin datos.");
  }
  return rows;
};

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
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const toPeriod = (value: unknown): string | null => {
  const date = parseExcelDate(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const withoutLabel = value.replace(/uf/gi, "").replace(/\s/g, "");
    const hasComma = withoutLabel.includes(",");
    const hasDot = withoutLabel.includes(".");
    let normalized = withoutLabel;
    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      normalized = normalized.replace(",", ".");
    }
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

export const parsePremiums = (buffer: Buffer): PremiumRow[] => {
  const rows = parseWorkbook(buffer);
  const headers = Object.keys(rows[0]);
  const clientNameKey = findHeaderKey(headers, ["Nombre Cliente", "Nombe Cliente"]);
  const clientRutKey = findHeaderKey(headers, ["Rut Cliente"]);
  const periodKey = findHeaderKey(headers, ["Periodo"]);
  const coverageKey = findHeaderKey(headers, ["Cobertura"]);
  const premiumKey = findHeaderKey(headers, ["Prima UF"]);
  const spendKey = findHeaderKey(headers, ["Gasto UF"]);

  if (!clientNameKey || !periodKey || !coverageKey || !premiumKey || !spendKey) {
    throw new Error("Headers de primas no coinciden con el formato esperado.");
  }

  return rows
    .map((row) => {
      const clientName = String(row[clientNameKey] ?? "").trim();
      const period = toPeriod(row[periodKey]);
      if (!clientName || !period) return null;
      return {
        clientName,
        clientRut: clientRutKey ? String(row[clientRutKey] ?? "").trim() : undefined,
        period,
        coverage: String(row[coverageKey] ?? "").trim(),
        premiumUf: parseNumber(row[premiumKey]),
        spendUf: parseNumber(row[spendKey]),
      };
    })
    .filter((row): row is PremiumRow => row !== null);
};

export const parseExpenses = (buffer: Buffer): ExpenseRow[] => {
  const rows = parseWorkbook(buffer);
  const headers = Object.keys(rows[0]);
  const clientNameKey = findHeaderKey(headers, ["Nombre Con", "Nombre Cliente", "Nombe Cliente"]);
  const periodKey = findHeaderKey(headers, ["PERIODO", "Periodo"]);
  const descKey = findHeaderKey(headers, ["Clasif.Cob"]);
  const reembolsoKey = findHeaderKey(headers, ["Reembolso"]);
  const planKey = findHeaderKey(headers, ["Desc.Plan"]);
  const providerKey = findHeaderKey(headers, ["Desc.Insti"]);
  const insuredRutKey = findHeaderKey(headers, ["Rut"]);
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
      return {
        clientName,
        period,
        coverage: coverageFromPlan(planKey ? row[planKey] : ""),
        descCober: descCoberRaw || "(Sin descripción)",
        reembolsoUf: parseNumber(row[reembolsoKey]),
        provider: providerKey ? String(row[providerKey] ?? "").trim() || "(Sin prestador)" : "(Sin prestador)",
        insuredRut: insuredRutKey ? String(row[insuredRutKey] ?? "").trim() || "(Sin rut)" : "(Sin rut)",
        isapre: isapreKey ? String(row[isapreKey] ?? "").trim() || "(Sin isapre)" : "(Sin isapre)",
        valPrest: valPrestKey ? parseNumber(row[valPrestKey]) : 0,
        valBonif: valBonifKey ? parseNumber(row[valBonifKey]) : 0,
        mtoReclam: mtoReclamKey ? parseNumber(row[mtoReclamKey]) : 0,
      };
    })
    .filter((row): row is ExpenseRow => row !== null);
};
