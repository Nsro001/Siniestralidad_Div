
import * as XLSX from 'xlsx';
import { PrimasRecord, GastosRecord } from '../store/memoryStore';
import { normalizeClientName, normalizeDate, normalizeCoverage, normalizeCurrency } from './dataNormalizer';

// Helper to find column name ignoring case/spaces
const findHeader = (headers: string[], target: string): string | undefined => {
    if (!headers || !headers.length) return undefined;
    const normalizedTarget = target.toLowerCase().replace(/\s/g, '');
    return headers.find(h => h && String(h).toLowerCase().replace(/\s/g, '') === normalizedTarget);
};

// Helper: Find Header Row Index and Headers
const findHeaderRow = (rows: any[][], possibleHeaders: string[]): { index: number, headers: string[] } | null => {
    for (let i = 0; i < Math.min(rows.length, 20); i++) { // Search top 20 rows
        const row = rows[i].map(c => String(c)); // Cast to string
        // Check if this row contains at least one of our key headers
        const match = possibleHeaders.some(ph => findHeader(row, ph));
        if (match) {
            console.log(`[Parser] Found header row at index ${i}:`, row);
            return { index: i, headers: row };
        }
    }
    return null;
};

export const parsePrimas = (buffer: Buffer): PrimasRecord[] => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read as array of arrays to find header
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const headerInfo = findHeaderRow(rawRows, ["Nombre Cliente", "Rut Cliente", "Poliza", "Periodo"]);

    if (!headerInfo) {
        console.error("[Primas] No valid header row found.");
        return [];
    }

    // Parse again using found header range
    const rawData = XLSX.utils.sheet_to_json<any>(sheet, { range: headerInfo.index, defval: "" });

    // Headers are in headerInfo.headers
    const headers = headerInfo.headers;
    const colMap = {
        client: findHeader(headers, "Nombre Cliente"),
        rut: findHeader(headers, "Rut Cliente"),
        poliza: findHeader(headers, "Póliza") || findHeader(headers, "Poliza"),
        period: findHeader(headers, "Periodo"),
        coverage: findHeader(headers, "Cobertura"),
        prima: findHeader(headers, "Prima UF"),
        gasto: findHeader(headers, "Gasto UF")
    };

    console.log("[Primas] Column Mapping:", JSON.stringify(colMap));

    const records: PrimasRecord[] = [];

    rawData.forEach((row, idx) => {
        if (!colMap.client || !row[colMap.client]) return;

        records.push({
            clientName: normalizeClientName(row[colMap.client]),
            rut: String(colMap.rut ? row[colMap.rut] : ""),
            poliza: String(colMap.poliza ? row[colMap.poliza] : ""),
            period: normalizeDate(colMap.period ? row[colMap.period] : ""),
            coverage: normalizeCoverage(colMap.coverage ? row[colMap.coverage] : ""),
            primaUF: normalizeCurrency(colMap.prima ? row[colMap.prima] : 0),
            gastoUF: normalizeCurrency(colMap.gasto ? row[colMap.gasto] : 0)
        });
    });

    console.log(`[Primas] Parsed ${records.length} valid records from row ${headerInfo.index}.`);
    return records;
};

export const parseGastos = (buffer: Buffer): GastosRecord[] => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    // Look for "Nombre Con" or "Reembolso"
    const headerInfo = findHeaderRow(rawRows, ["Nombre Con", "Nombre Contratante", "Reembolso", "Desc.Cober"]);

    if (!headerInfo) {
        console.error("[Gastos] No valid header row found.");
        return [];
    }

    const rawData = XLSX.utils.sheet_to_json<any>(sheet, { range: headerInfo.index, defval: "" });
    const headers = headerInfo.headers;

    const colMap = {
        client: findHeader(headers, "Nombre Con") || findHeader(headers, "Nombre Contratante"),
        code: findHeader(headers, "Cobertura"),
        desc: findHeader(headers, "Desc.Cober") || findHeader(headers, "Desc Cober") || findHeader(headers, "Descripción Prestación"),
        reembolso: findHeader(headers, "Reembolso"),
        period: findHeader(headers, "PERIODO") || findHeader(headers, "Periodo")
    };

    console.log("[Gastos] Column Mapping:", JSON.stringify(colMap));

    const records: GastosRecord[] = [];

    rawData.forEach((row, idx) => {
        if (!colMap.client || !row[colMap.client]) return;

        const code = colMap.code ? row[colMap.code] : "";

        records.push({
            clientName: normalizeClientName(row[colMap.client]),
            coverageCode: code,
            coverageName: normalizeCoverage(code),
            description: colMap.desc ? (row[colMap.desc] || "Sin descripción") : "Sin descripción",
            reembolsoUF: normalizeCurrency(colMap.reembolso ? row[colMap.reembolso] : 0),
            period: normalizeDate(colMap.period ? row[colMap.period] : "")
        });
    });

    console.log(`[Gastos] Parsed ${records.length} valid records from row ${headerInfo.index}.`);
    return records;
};
