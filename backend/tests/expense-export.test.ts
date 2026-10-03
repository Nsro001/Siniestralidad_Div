import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildExpenseExport } from '../src/expenseExport.js';
import type { ExpenseRow } from '../src/types.js';

const row: ExpenseRow = { clientName: 'A', period: '2025-01', coverage: 'Salud', descCober: '=1+1',
  reembolsoUf: 12.34, provider: 'Clínica', insuredRut: '001-9', patientRut: '002-7', relation: 'T',
  isapre: 'Previsión', valPrest: 20000, valBonif: 10000, mtoReclam: 10000 };

test('Excel respeta cliente, meses discontinuos y coberturas sin excluir ni duplicar registros', async () => {
  const rows = [row, {...row,period:'2025-03',coverage:'Dental',reembolsoUf:-2},
    {...row,coverage:'Catastrófico',reembolsoUf:0}, {...row,clientName:'B'}, {...row,period:'2025-02'},
    {...row,coverage:'Vida'}];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildExpenseExport(rows,'A','2025-01,2025-03','Consolidado S+D+C,Salud'));
  const sheet = workbook.getWorksheet('Gastos')!;
  assert.equal(sheet.rowCount,4);
  assert.equal(sheet.getCell('E2').value,12.34);
  assert.equal(sheet.getCell('E3').value,-2);
  assert.equal(sheet.getCell('E4').value,0);
  assert.equal(sheet.getCell('D2').value,'=1+1', 'texto no se convierte en fórmula');
  assert.equal(sheet.getCell('G2').value,'001-9');
  assert.equal(workbook.getWorksheet('Selección')!.getCell('B2').value,'2025-01, 2025-03');
});

test('no permite descarga sin filtros ni entrega otras filas si la selección está vacía', async () => {
  for (const [periods, coverages] of [['','Salud'], ['2025-13','Salud'], ['2025-01','']]) {
    await assert.rejects(buildExpenseExport([row],'A',periods,coverages), /Selecciona/);
  }
  await assert.rejects(buildExpenseExport([row],'B','2025-01','Salud'), /No hay registros/);
  await assert.rejects(buildExpenseExport([row],'A','2025-02','Salud'), /No hay registros/);
});
