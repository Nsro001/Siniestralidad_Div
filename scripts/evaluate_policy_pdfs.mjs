// Desde la raíz: node --import ./backend/node_modules/tsx/dist/loader.mjs scripts/evaluate_policy_pdfs.mjs PDF1 PDF2 PDF3
// Orden: Consorcio; Vida Cámara Vida; Vida Cámara Salud. Solo imprime métricas, sin identidades ni citas.
import {readFile} from 'node:fs/promises';
import {extractPdf} from '../backend/src/policyPdf.ts';
import {extractionReview,expectedDocumentFields} from '../backend/src/policyInterpretation.ts';
const expected=[['Vida','Salud','Dental'],['Vida'],['Salud','Dental']];
if(process.argv.length!==5) throw new Error('Se requieren tres rutas PDF, en el orden indicado en el script.');
for(const [i,path] of process.argv.slice(2).entries()) {
  const {pages,fields}=await extractPdf(await readFile(path));
  const review=extractionReview(fields);
  const correct=review.coverageCandidates.filter(c=>expected[i].includes(c)).length;
  console.log(JSON.stringify({case:i+1,pages:pages.length,ocrPages:pages.filter(p=>p.method==='ocr').length,coveragePrecision:review.coverageCandidates.length?correct/review.coverageCandidates.length:null,coverageRecall:correct/expected[i].length,coverageCandidates:review.coverageCandidates,fields:expectedDocumentFields.map(key=>({key,detected:fields.some(f=>f.key===key),conflict:review.conflicts.includes(key)})),missing:review.missing}));
}
