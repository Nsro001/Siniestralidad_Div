// node --import ./backend/node_modules/tsx/dist/loader.mjs scripts/evaluate_contract_conditions.mjs REFERENCIA_PRIVADA.json CONSORCIO.pdf VIDA.pdf SALUD.pdf
// Salida estándar: solo agregados. Evidencia y anotaciones permanecen en /tmp/noergon-phase2-private, fuera del repositorio.
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {extractPdf,extractCandidates} from '../backend/src/policyPdf.ts';
const args=process.argv.slice(2);if(args.length!==4)throw new Error('Se requieren referencia privada y tres PDF: Consorcio, Vida, Salud.');
const reference=JSON.parse(await readFile(args[0],'utf8'));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const valueNorm=s=>norm(s).replace(/\s/g,'');
const results={},baseline={};
for(const [i,name] of ['consorcio','vida','salud'].entries()){
 const result=await extractPdf(await readFile(args[i+1]));results[name]=result;
 baseline[name]=extractCandidates(result.pages).length; // Fase 1: fragmentos candidatos, sin relación prestación/campo/plan.
}
const metrics={},examples=[],details=[];
for(const gold of reference.annotations){
 const candidates=results[gold.case].pages.flatMap(p=>p.contractCandidates??[]).filter(c=>c.page===gold.page&&c.coverage===gold.coverage&&norm(c.plan).includes(norm(gold.plan))&&norm(c.benefit)===norm(gold.benefit)&&c.kind===gold.kind&&c.eligibility!=='reference');
 let selected=candidates;
 if(candidates.length>1&&gold.period!==undefined)selected=selected.filter(c=>norm(c.period)===norm(gold.period));
 if(selected.length>1&&gold.scope!==undefined)selected=selected.filter(c=>norm(c.scope)===norm(gold.scope));
 const alternatives=[...new Set(selected.map(c=>valueNorm(c.value)))];
 const status=!selected.length?'missing':alternatives.length!==1?'ambiguous':alternatives[0]===valueNorm(gold.value)?'correct':'wrong';
 const metric=metrics[gold.kind]??={total:0,correct:0,wrong:0,missing:0,ambiguous:0,unitCorrect:0,periodCorrect:0};
 metric.total++;metric[status]++;
 if(selected.length&&new Set(selected.map(c=>c.unit)).size===1&&norm(selected[0].unit)===norm(gold.unit))metric.unitCorrect++;
 if(selected.length&&new Set(selected.map(c=>c.period)).size===1&&norm(selected[0].period)===norm(gold.period))metric.periodCorrect++;
 const proof=selected[0];
 const supported=proof&&results[gold.case].pages.find(p=>p.page===proof.page)?.text.includes(proof.quote);
 if(status==='correct'&&!supported)throw new Error('Evidencia ausente en una coincidencia evaluada.');
 details.push({expected:gold,status,observed:selected.map(c=>({value:c.value,unit:c.unit,scope:c.scope,period:c.period,warnings:c.warnings})),evidence:proof?{page:proof.page,quote:proof.quote,region:proof.region}:null});
 if(status==='correct'&&examples.length<12)examples.push(details.at(-1));
}
for(const m of Object.values(metrics)){m.precision=m.correct+m.wrong?m.correct/(m.correct+m.wrong):null;m.recall=m.correct/m.total;}
const summary={sampleSize:reference.annotations.length,method:reference.method,metrics,baseline:{scopedConditions:0,reason:'Fase 1 devolvía fragmentos condition sin prestación/campo/plan; no había predicciones en este esquema.',rawCandidates:baseline},documents:Object.fromEntries(Object.entries(results).map(([name,r])=>[name,{pages:r.pages.length,gridTables:r.pages.reduce((n,p)=>n+(p.benefitTables?.filter(t=>t.method==='grid').length??0),0),retainedLayouts:r.pages.filter(p=>p.benefitTables?.some(t=>t.method==='layout')).length,structuredConditions:r.pages.reduce((n,p)=>n+(p.contractCandidates?.length??0),0)}]))};
await mkdir('/tmp/noergon-phase2-private',{recursive:true,mode:0o700});await chmod('/tmp/noergon-phase2-private',0o700);
await writeFile('/tmp/noergon-phase2-private/evaluation.json',JSON.stringify({summary,details,examples},null,2),{mode:0o600});
await writeFile('/tmp/noergon-phase2-private/extracted.json',JSON.stringify(results),{mode:0o600});
console.log(JSON.stringify(summary,null,2));
