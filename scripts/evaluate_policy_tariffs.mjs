// Ejecutar desde la raíz con loader tsx: REFERENCIA_PRIVADA.json CONSORCIO.pdf VIDA.pdf SALUD.pdf
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extractPdf} from '../backend/src/policyPdf.ts';
import {extractionReview} from '../backend/src/policyInterpretation.ts';
const args=process.argv.slice(2);if(args.length!==4)throw new Error('Referencia privada y tres PDF requeridos.');
const reference=JSON.parse(await readFile(args[0],'utf8')),results={};
for(const [i,name] of ['consorcio','vida','salud'].entries())results[name]=await extractPdf(await readFile(args[i+1]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'');
const metrics={},details=[],excludedAggregates=[];
const measured=['value','currency','periodicity','rateUnit'];
for(const gold of reference.annotations){
 const candidates=results[gold.case].pages.flatMap(p=>p.contractCandidates??[]).filter(c=>c.page===gold.page&&c.kind===gold.kind&&norm(c.benefit)===norm(gold.benefit)&&c.tariff?.component===gold.component&&norm(c.tariff?.category)===norm(gold.category)&&norm(c.tariff?.incomeBand)===norm(gold.incomeBand));
 if(gold.subtotal){if(candidates.length)throw new Error('Se incorporó una fila agregada prohibida.');excludedAggregates.push({case:gold.case,page:gold.page});continue;}
 const statuses={};
 for(const key of measured){
  const values=[...new Set(candidates.map(c=>norm(key==='value'?c.value:c.tariff?.[key])))];
  const status=!values.length?'missing':values.length>1?'ambiguous':values[0]===norm(gold[key])?'correct':'wrong';statuses[key]=status;
  const metric=metrics[key]??={correct:0,wrong:0,missing:0,ambiguous:0,total:0};metric[status]++;metric.total++;
 }
 const first=candidates[0];
 if(first&&!results[gold.case].pages.find(p=>p.page===first.page)?.text.includes(first.quote))throw new Error('Cita de tarifa ausente en su página');
 details.push({expected:gold,statuses,observed:candidates.map(c=>({value:c.value,tariff:c.tariff,warnings:c.warnings,coverage:c.coverage,plan:c.plan})),evidence:first?{page:first.page,quote:first.quote,region:first.region}:null});
}
for(const metric of Object.values(metrics)){metric.precision=metric.correct+metric.wrong?metric.correct/(metric.correct+metric.wrong):null;metric.recall=metric.correct/metric.total;}
const summary={method:reference.method,sampleSize:reference.annotations.length-excludedAggregates.length,excludedAggregates:excludedAggregates.length,metrics,documents:Object.fromEntries(Object.entries(results).map(([name,r])=>{const c=r.pages.flatMap(p=>p.contractCandidates??[]);return [name,{pages:r.pages.length,tariffCells:c.filter(c=>c.kind==='tariff').length,rateCells:c.filter(c=>c.kind==='rate'&&c.tariff).length,capitalCells:c.filter(c=>c.kind==='capital'&&c.tariff).length,missingRequired:extractionReview(r.fields).missing}];}))};
await mkdir('/tmp/noergon-phase2-private',{recursive:true,mode:0o700});
await writeFile('/tmp/noergon-phase2-private/tariff-evaluation-no-totals.json',JSON.stringify({summary,details},null,2),{mode:0o600});
console.log(JSON.stringify(summary,null,2));
