import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { parseUpload, parseExpenses } from '../src/parser.js';

function archiveWithLateWorkbook(reverseSheets = false) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{ 'Nombre Con': 'Empresa', PERIODO: '2026-01',
    'Desc.Plan': 'Salud', 'Clasif.Cob': 'Consultas', Reembolso: 12.34, Poliza: '001' }]), 'Datos');
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{ auxiliar: 'No importar' }]), 'Auxiliar');
  const buffer: Buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx', bookSST: true });
  // Reordenar bloques ZIP sin cambiar XML, compresión ni CRC. El escritor CFB
  // vuelve a ordenar entradas, por eso el fixture ajusta offsets del directorio.
  const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const centralOffset = buffer.readUInt32LE(endOffset + 16), count = buffer.readUInt16LE(endOffset + 10);
  const entries: Array<{ name: string; central: Buffer; localOffset: number; local?: Buffer }> = [];
  let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const size = 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
    entries.push({ name: buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString(),
      central: Buffer.from(buffer.subarray(cursor, cursor + size)), localOffset: buffer.readUInt32LE(cursor + 42) });
    cursor += size;
  }
  const localOrder = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  localOrder.forEach((entry, i) => { entry.local = buffer.subarray(entry.localOffset, localOrder[i + 1]?.localOffset ?? centralOffset); });
  const priority = ['xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', `xl/worksheets/sheet${reverseSheets ? 2 : 1}.xml`, 'xl/workbook.xml', `xl/worksheets/sheet${reverseSheets ? 1 : 2}.xml`];
  const rank = (name: string) => priority.includes(name) ? priority.indexOf(name) : 100;
  entries.sort((a, b) => rank(a.name) - rank(b.name));
  let offset = 0;
  for (const entry of entries) { entry.central.writeUInt32LE(offset, 42); offset += entry.local!.length; }
  const end = Buffer.from(buffer.subarray(endOffset)); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries.map(e => e.local!), ...entries.map(e => e.central), end]);
}

test('ExcelJS 4.4: reproduce falta de model con rels/strings/hoja antes de workbook.xml', async () => {
  const buffer = archiveWithLateWorkbook();
  const originalReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buffer]), {
    worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore', entries: 'ignore',
  });
  await assert.rejects(async () => { for await (const sheet of originalReader) for await (const _row of sheet) { /* consumir */ } }, /sheets/);
});
test('XLSX con metadatos tardíos conserva la primera hoja y los valores sin fallback de memoria', async () => {
  const buffer = archiveWithLateWorkbook();
  const expected = parseExpenses(buffer);
  for (let i = 0; i < 5; i++) assert.deepEqual(await parseUpload(buffer, 'gastos', 'orden.xlsx'), expected);
  assert.equal(expected.length, 1); assert.equal(expected[0].reembolsoUf, 12.34); assert.equal(expected[0].policy, '001');
});
test('XLSX importa la primera hoja lógica aunque el ZIP entregue primero una hoja auxiliar', async () => {
  const buffer = archiveWithLateWorkbook(true);
  assert.deepEqual(await parseUpload(buffer, 'gastos', 'orden-inverso.xlsx'), parseExpenses(buffer));
});
test('XLSX con ZIP no convencional conserva resultados en lecturas paralelas independientes', async () => {
  const buffer=archiveWithLateWorkbook(true),expected=parseExpenses(buffer);
  const results=await Promise.all(Array.from({length:6},()=>parseUpload(buffer,'gastos','paralelo.xlsx')));
  for(const rows of results)assert.deepEqual(rows,expected);
});
