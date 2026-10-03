import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import xlsx from 'xlsx';
import { parseUpload } from '../src/parser.js';
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

test('CSV, XLS y XLSX conservan póliza, detalle y clasificación hasta la descarga', async () => {
  const source = {
    'Nombre Con': 'A', PERIODO: '01/01/2025', 'Desc.Plan ': 'Salud',
    'Clasif.Cob': 'Consultas', Reembolso: 12.34,
    'Poliza   .': '000123-04', 'Desc.Cober': 'CONSULTA ESPECIALISTA',
    'Val.Prest.': 25000,
  };
  const book = xlsx.utils.book_new();
  const sheet = xlsx.utils.json_to_sheet([source]);
  xlsx.utils.book_append_sheet(book, sheet, 'Datos');
  for (const format of ['csv', 'xls', 'xlsx'] as const) {
    const input = format === 'csv' ? Buffer.from(xlsx.utils.sheet_to_csv(sheet, { FS: ';' }))
      : xlsx.write(book, { type: 'buffer', bookType: format });
    const rows = await parseUpload(input, 'gastos', `gastos.${format}`);
    assert.equal(rows[0].policy, '000123-04');
    assert.equal(rows[0].prestation, 'CONSULTA ESPECIALISTA');
    assert.equal(rows[0].descCober, 'Consultas');
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(await buildExpenseExport(rows, 'A', '2025-01', 'Salud'));
    const exported = output.getWorksheet('Gastos')!;
    const headers = exported.getRow(1).values as string[];
    const value = (header: string) => exported.getRow(2).getCell(headers.indexOf(header)).value;
    assert.equal(value('Número de póliza'), '000123-04');
    assert.equal(value('Prestación'), 'CONSULTA ESPECIALISTA');
    assert.equal(value('Clasificación de prestación'), 'Consultas');
    assert.equal(value('Valor prestación'), 25000);
  }
});

test('descarga histórica indica recarga sin inventar póliza ni detalle', async () => {
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(await buildExpenseExport([row], 'A', '2025-01', 'Salud'));
  assert.equal(output.getWorksheet('Gastos')!.getCell('N2').value, '');
  assert.equal(output.getWorksheet('Gastos')!.getCell('O2').value, '');
  assert.match(String(output.getWorksheet('Selección')!.getCell('B6').value), /Vuelve a cargar/);
});
