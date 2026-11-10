import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { Open } from 'unzipper';

// Leer por directorio ZIP evita el orden de entradas del lector secuencial 4.4.
// Las hojas se descomprimen como streams, en el orden lógico del libro.
export async function* orderedXlsxSheets(buffer: Buffer): AsyncGenerator<ExcelJS.stream.xlsx.WorksheetReader> {
  const directory = await Open.buffer(buffer);
  const files = new Map<string, (typeof directory.files)[number]>();
  for (const file of directory.files) {
    if (files.has(file.path)) throw new Error('XLSX con entradas ZIP duplicadas.');
    files.set(file.path, file);
  }
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([]), {
    worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore', entries: 'ignore',
  });
  // Adaptador acotado a ExcelJS 4.4 fijado en package-lock.json.
  const internal = reader as unknown as {
    model?: { sheets?: Array<{ rId: string }> };
    workbookRels?: Array<{ Id: string; Target: string }>;
    _parseWorkbook(entry: Readable): Promise<void>;
    _parseRels(entry: Readable): Promise<void>;
    _parseSharedStrings(entry: Readable): AsyncGenerator<unknown>;
    _parseWorksheet(iterator: AsyncIterable<Buffer>, id: number): Generator<{ eventType: string; value: ExcelJS.stream.xlsx.WorksheetReader }>;
  };
  const metadata = async (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error('XLSX sin metadatos obligatorios.');
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream()) chunks.push(Buffer.from(chunk));
    return Readable.from([Buffer.concat(chunks)]);
  };
  await internal._parseWorkbook(await metadata('xl/workbook.xml'));
  await internal._parseRels(await metadata('xl/_rels/workbook.xml.rels'));
  if (!internal.model?.sheets?.length || !internal.workbookRels) throw new Error('XLSX sin hojas o relaciones válidas.');
  const strings = files.get('xl/sharedStrings.xml');
  if (strings) for await (const _event of internal._parseSharedStrings(strings.stream())) { /* caché del lector */ }
  for (const [index, sheet] of internal.model.sheets.entries()) {
    const relation = internal.workbookRels.find(r => r.Id === sheet.rId);
    if (!relation) throw new Error('XLSX con relación de hoja ausente.');
    const path = relation.Target.startsWith('/xl/') ? relation.Target.slice(1) : `xl/${relation.Target}`;
    if (path.startsWith('xl/chartsheets/')) continue;
    const file = files.get(path);
    if (!file) throw new Error('XLSX con hoja ausente.');
    const stream = file.stream();
    try {
      for (const event of internal._parseWorksheet(stream, index + 1)) if (event.eventType === 'worksheet') yield event.value;
    } finally { stream.destroy(); }
  }
}
