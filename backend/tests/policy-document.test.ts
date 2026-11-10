import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates, extractPdf } from '../src/policyPdf.js';
import { extractionReview, interpretLocally } from '../src/policyInterpretation.js';
const pdf = Buffer.from('%PDF-1.7\nsynthetic');
test('restricciones de copia: usa render permitido y OCR; nunca extrae texto restringido', async () => {
  const commands: string[] = [];
  const result = await extractPdf(pdf, async command => {
    commands.push(command);
    if(command === 'pdfinfo') return 'Pages: 1\nEncrypted: yes (print:yes copy:no change:no)';
    if(command === 'pdftotext') throw new Error('No debe ejecutarse');
    if(command === 'tesseract') return 'Seguro de vida\nSeguro complementario de salud\nPlan dental';
    return '';
  });
  assert.ok(!commands.includes('pdftotext'));
  assert.deepEqual(extractionReview(result.fields).coverageCandidates, ['Vida','Salud','Dental']);
});
test('contraseña se entrega al lector solo en memoria; formato y límite se validan', async () => {
  await extractPdf(pdf, async (command,args) => {
    if(command === 'pdfinfo') {assert.deepEqual(args.slice(0,2),['-upw','synthetic-secret']);return 'Pages: 1\nEncrypted: yes (copy:yes)';}
    return 'Texto digital suficiente para la lectura directa de un contrato sintético de prueba.';
  }, false, 'synthetic-secret');
  await assert.rejects(extractPdf(pdf, async () => '', false, 'bad\npassword'), /Contraseña inválida/);
  await assert.rejects(extractPdf(pdf, async () => 'Pages: 81'), /80 páginas/);
});
test('separa primas y conserva ausencias/conflictos con evidencia', () => {
  const fields=extractCandidates([{page:2,method:'text',text:'Prima total: 12,5 UF\nPrima por asegurado: 0,5 UF\nPóliza: 001\nPóliza: 002\nFecha de Vigencia: Desde 01 de Julio 2026 hasta 30 de Junio 2027'}]);
  assert.equal(fields.some(f=>f.key==='premium'),false);
  assert.equal(fields.find(f=>f.key==='premiumPerInsured')?.value,'0,5 UF');
  assert.equal(fields.find(f=>f.key==='endsOn')?.value,'2027-06-30');
  assert.ok(extractionReview(fields).conflicts.includes('number'));
  assert.ok(extractionReview(fields).missing.includes('insurer'));
});
test('intérprete local descarta citas inventadas',async()=>{
  const fields=await interpretLocally({mode:'local',async interpret(){return [{key:'number',value:'123',page:1,quote:'inventada',confidence:'candidate'}];}},[{page:1,text:'Póliza: 123',method:'text'}],new AbortController().signal);
  assert.deepEqual(fields,[]);
});
test('documento incompleto no inventa campos y clasifica encabezados', async () => {
  const result=await extractPdf(pdf, async command => {
    if(command==='pdfinfo') return 'Pages: 1\nEncrypted: no';
    return 'CONDICIONES PARTICULARES\nANEXO\nDocumento incompleto sin datos de identificación contractual.';
  });
  assert.ok(extractionReview(result.fields).missing.includes('number'));
  assert.ok(result.pages[0].sections?.includes('Condiciones particulares'));
  assert.ok(result.pages[0].sections?.includes('Anexo'));
});
