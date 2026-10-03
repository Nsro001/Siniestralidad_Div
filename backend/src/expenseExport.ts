import ExcelJS from 'exceljs';
import type { ExpenseRow } from './types.js';
import { HttpError } from './supabase.js';

export async function buildExpenseExport(rows: ExpenseRow[], client: string, periods: string, coverages: string) {
  const months = [...new Set(periods.split(',').map(p => p.trim()).filter(Boolean))].sort();
  const selected = new Set(coverages.split(',').map(c => c.trim()).filter(Boolean));
  if (!months.length || months.some(p => !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) || !selected.size) {
    throw new HttpError(400, 'Selecciona meses y coberturas válidos para descargar la sábana.');
  }
  if (selected.delete('Consolidado S+D+C')) ['Salud', 'Dental', 'Catastrófico'].forEach(c => selected.add(c));
  const filtered = rows.filter(r => r.clientName === client && months.includes(r.period) && selected.has(r.coverage));
  if (!filtered.length) throw new HttpError(404, 'No hay registros de gastos para la selección.');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Gastos');
  const columns: Array<[keyof ExpenseRow, string, number]> = [
    ['clientName', 'Cliente', 32], ['period', 'Período', 12], ['coverage', 'Cobertura', 20],
    ['descCober', 'Prestación', 45], ['reembolsoUf', 'Reembolso UF', 18], ['provider', 'Prestador', 35],
    ['insuredRut', 'RUT asegurado', 18], ['patientRut', 'RUT paciente', 18], ['relation', 'Parentesco', 14],
    ['isapre', 'Previsión', 25], ['valPrest', 'Valor prestación', 20], ['valBonif', 'Valor bonificación', 20],
    ['mtoReclam', 'Monto reclamado', 20],
  ];
  sheet.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  for (const row of filtered) sheet.addRow(columns.map(([key]) => row[key] ?? ''));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'M1' };
  for (const key of ['reembolsoUf', 'valPrest', 'valBonif', 'mtoReclam']) sheet.getColumn(key).numFmt = '#,##0.00';
  const selection = workbook.addWorksheet('Selección');
  selection.addRows([
    ['Cliente', client], ['Meses seleccionados', months.join(', ')],
    ['Coberturas', [...selected].join(', ')], ['Registros', filtered.length],
    ['Origen', 'Detalle procesado de la sábana de gastos cargada.'],
  ]);
  selection.getColumn(1).width = 24;
  selection.getColumn(2).width = 90;
  return workbook.xlsx.writeBuffer();
}
