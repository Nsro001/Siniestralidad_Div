import {test} from 'node:test';import assert from 'node:assert/strict';import express from 'express';import ExcelJS from 'exceljs';
import {companyNarrative,narrativeCatalog,selectNarrative,NativeNarrativeProvider,CompanyNarrativeService} from '../src/companyNarrative.js';
import {companyNarrativeRouter,narrativeWorkbook} from '../src/companyNarrativeRoute.js';import {buildExpenseExport} from '../src/expenseExport.js';
const premiums=['2026-01','2026-02'].map((period,i)=>({clientName:'Empresa PRIVADA',clientRut:'RUT PRIVADO',period,coverage:'Salud',premiumUf:100,spendUf:60+i*20}));
const expenses=['2026-01','2026-02'].map((period,i)=>({clientName:'Empresa PRIVADA',period,coverage:'Salud',descCober:'Consulta',reembolsoUf:60+i*20,provider:'PRESTADOR PRIVADO',patientRut:'RUT PRIVADO'} as any));
const base=()=>companyNarrative(premiums,expenses,'Empresa PRIVADA','2026-01,2026-02','Salud','monthly');
const selection=(b=base())=>({projection:'backend' as const,metricIds:b.metrics.map(m=>m.id),conclusionIds:['c0','c1','c2'],actionIds:b.actions.map(a=>a.id)});
test('mensual y privacidad: siniestralidad, comparación, acciones y proyección verificadas',()=>{
 const combined=companyNarrative(premiums,expenses,'Empresa PRIVADA','2026-01,2026-02','Salud,Consolidado S+D+C','monthly');assert.equal(combined.metrics[0].value,80);
 const b=base();assert.equal(b.metrics[0].value,80);assert.equal(b.metrics.find(m=>m.id==='expense_change')!.value,20);assert.equal(b.projection.currentPremiumUf,100);assert.equal(b.projection.available,false);assert.equal(b.conclusion.length,3);assert.equal(b.actions.length,3);
 const json=JSON.stringify(narrativeCatalog(b));for(const s of ['PRIVAD','RUT','patient','client','Empresa'])assert.ok(!json.includes(s));
 assert.deepEqual(selectNarrative(b,selection()).projection,b.projection);assert.throws(()=>selectNarrative(b,{...selection(),premium:999}));assert.throws(()=>selectNarrative(b,{...selection(),actionIds:['inventado']}));assert.throws(()=>selectNarrative(b,{...selection(),metricIds:['loss_ratio','coverage_focus']}));
 const missing=companyNarrative([],[],'A','2026-02','Salud','conclusions');assert.ok(missing.metrics.every(m=>m.value===null));assert.equal(missing.actions.length,3);
 const invalid=companyNarrative(premiums.map(p=>({...p,premiumUf:Infinity})),expenses,'Empresa PRIVADA','2026-02','Salud','monthly');assert.equal(invalid.metrics[0].value,null);
});
test('REST simulado: salida estructurada, cuota concurrente y fallo sin reintentos',async()=>{
 const keys=['NOERGON_GEMINI_REAL_ENABLED','NOERGON_GEMINI_BILLING_DISABLED_CONFIRMED','NOERGON_GEMINI_DAILY_LIMIT','GEMINI_API_KEY'];const prior=keys.map(k=>process.env[k]);Object.assign(process.env,{NOERGON_GEMINI_REAL_ENABLED:'true',NOERGON_GEMINI_BILLING_DISABLED_CONFIRMED:'true',NOERGON_GEMINI_DAILY_LIMIT:'1',GEMINI_API_KEY:'AIza'+'synthetic_only_key_'.repeat(3)});let calls=0;
 try{const provider=new NativeNarrativeProvider((async(url,init)=>{calls++;assert.ok(String(url).endsWith('gemini-3.1-flash-lite:generateContent'));assert.equal(init!.redirect,'error');const body=JSON.parse(String(init!.body));assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(!String(init!.body).includes('PRIVAD'));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(selection())}]}}]});}) as typeof fetch);
 const settled=await Promise.allSettled([provider.generate(base()),provider.generate(base())]);assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal((await provider.available()).remaining,0);
 let fails=0;const failed=new NativeNarrativeProvider((async()=>{fails++;throw Error('network');}) as typeof fetch);await assert.rejects(failed.generate(base()));assert.equal(fails,1);assert.equal((await failed.available()).remaining,0);
 }finally{keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});}
});
test('resultado aprobado aislado por actor y contexto; Excel conserva el detalle financiero',async()=>{
 let calls=0;const service=new CompanyNarrativeService({available:async()=>({available:true,reason:'simulado',remaining:1}),generate:async b=>{calls++;return selectNarrative(b,selection(b));}});
 await service.resolve('one',base());assert.equal(calls,0);const approved=await service.resolve('one',base(),true);await service.resolve('one',base(),true);assert.equal(calls,1);assert.equal((await service.resolve('two',base())).analysis.source,'deterministic');await assert.rejects(service.resolve('two',base(),false,approved.analysis.id));
 const otherTenant=companyNarrative(premiums,expenses,'Empresa PRIVADA','2026-01,2026-02','Salud','monthly','another-client-id');await assert.rejects(service.resolve('one',otherTenant,false,approved.analysis.id));
 const changed=companyNarrative(premiums.map(p=>({...p,spendUf:1})),expenses,'Empresa PRIVADA','2026-01,2026-02','Salud','monthly');await assert.rejects(service.resolve('one',changed,false,approved.analysis.id));
 const book=new ExcelJS.Workbook(),old=new ExcelJS.Workbook();await book.xlsx.load(await narrativeWorkbook([approved.analysis],expenses,'Empresa PRIVADA','2026-01,2026-02','Salud'));await old.xlsx.load(await buildExpenseExport(expenses,'Empresa PRIVADA','2026-01,2026-02','Salud'));assert.equal(book.worksheets[0].name,'Análisis mensual');assert.deepEqual(book.getWorksheet('Gastos')!.getSheetValues(),old.getWorksheet('Gastos')!.getSheetValues());for(const s of approved.analysis.conclusion)assert.ok(JSON.stringify(book.worksheets[0].getSheetValues()).includes(s));
});
test('API: autenticación, ámbito por cliente y cifras del navegador ignoradas',async()=>{
 let calls=0;const service=new CompanyNarrativeService({available:async()=>({available:true,reason:'simulado',remaining:1}),generate:async b=>{calls++;return selectNarrative(b,selection(b));}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.sendStatus(401);res.locals.auth={profile:{id:'owner'},db:{from(table:string){const state:any={},chain:any={select(){return chain;},eq(k:string,v:string){state[k]=v;return chain;},async maybeSingle(){return {error:null,data:table==='clients'?(state.name==='Empresa PRIVADA'?{id:'allowed'}:null):{rows:state.kind==='primas'?premiums:expenses}};}};return chain;}}};next();});app.use('/report/analysis',companyNarrativeRouter(service));app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status??500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url=`http://127.0.0.1:${(server.address() as any).port}/report/analysis/monthly?`,params=new URLSearchParams({client:'Empresa PRIVADA',periods:'2026-01,2026-02',coverages:'Salud'}),headers={Authorization:'Bearer synthetic','Content-Type':'application/json'};
 try{assert.equal((await fetch(url+params)).status,401);assert.equal((await fetch(url+new URLSearchParams({...Object.fromEntries(params),client:'Otro'}),{headers})).status,403);const result=await fetch(url+params,{method:'POST',headers,body:JSON.stringify({premium:999})});assert.equal(result.status,200);assert.equal((await result.json()).analysis.projection.currentPremiumUf,100);assert.equal(calls,1);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('escenario 75 %: incremento, decremento y mejora alternativa sin superar objetivo',()=>{
 const periods=Array.from({length:12},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`);
 const build=(cost:number,ps=periods)=>companyNarrative(ps.map(period=>({clientName:'QA',coverage:'Salud',period,premiumUf:100,spendUf:cost})),[],'QA',ps.join(','),'Salud','conclusions');
 const high=build(90);assert.equal(high.projection.projectedPremiumUf,1440);assert.ok(Math.abs(high.projection.variationPercent!-20)<1e-10);assert.equal(high.projection.variationUf,240);assert.equal(high.projection.coverageBudgetUf,0);assert.ok(!high.actions[2].title.includes('mejora'));
 const low=build(60);assert.equal(low.projection.projectedPremiumUf,960);assert.ok(Math.abs(low.projection.variationPercent!+20)<1e-10);assert.equal(low.projection.coverageBudgetUf,180);assert.equal((720+180)/1200,.75);assert.match(low.actions[2].measure,/alternativa.*no acumulable/);assert.match(low.actions[2].measure,/180 UF/);
 const equal=build(75);assert.equal(equal.projection.variationPercent,0);assert.equal(equal.projection.coverageBudgetUf,0);
 for(const b of [build(0),build(-1),build(90,periods.slice(1)),build(90,[...periods.slice(0,11),'2026-01'])])assert.equal(b.projection.available,false);
 const missing=companyNarrative(periods.map(period=>({clientName:'QA',coverage:'Salud',period,premiumUf:100,spendUf:60})).concat([{clientName:'QA',coverage:'Dental',period:'2025-01',premiumUf:10,spendUf:2}]),[],'QA',periods.join(','),'Salud,Dental','conclusions');assert.equal(missing.projection.available,false);
});
test('Excel ejecutivo replica el escenario, tres conclusiones y tres acciones sin cambiar el detalle',async()=>{
 const periods=Array.from({length:12},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`),rows=periods.map(period=>({clientName:'QA',coverage:'Salud',period,premiumUf:100,spendUf:60}));
 const a=companyNarrative(rows,[],'QA',periods.join(','),'Salud','conclusions'),book=new ExcelJS.Workbook();await book.xlsx.load(await narrativeWorkbook([a],[],'QA',periods.join(','),'Salud'));
 const sheet=book.worksheets[0],values=sheet.getSheetValues() as any[];const row=(key:string)=>values.find(r=>r?.[1]===key);
 assert.equal(row('Prima del escenario UF')[2],960);assert.equal(row('Variación UF')[2],-240);for(const line of a.conclusion)assert.ok(row(line));for(const action of a.actions)assert.equal(row(action.title)[2],action.measure);assert.equal(sheet.name,'Conclusiones ejecutivas');
});
