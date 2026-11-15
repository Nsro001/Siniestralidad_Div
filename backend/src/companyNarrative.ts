import {createHash} from 'node:crypto';
import {readFile,stat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
import type {PremiumRow,ExpenseRow} from './types.js';
import type {CompanyNarrative,NarrativeBundle,NarrativeKind,NarrativeMetric} from '../../shared/companyNarrative.js';
import {EXCLUDED_PRESTATIONS} from './report.js';
import {buildMonthlyDetail} from './monthly.js';
import {HttpError} from './supabase.js';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const n=(v:number|null)=>v===null?'no disponible':v.toLocaleString('es-CL',{maximumFractionDigits:2});
const finite=(v:number|null)=>v!==null&&Number.isFinite(v)?v:null;
export function companyNarrative(premiums:PremiumRow[],expenses:ExpenseRow[],client:string,periodText:string,coverageText:string,kind:NarrativeKind,clientId=client):CompanyNarrative{
 const periods=[...new Set(periodText.split(',').filter(Boolean))].sort();
 if(!periods.length||periods.length>120||periods.some(p=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)))throw new HttpError(400,'Selecciona períodos válidos.');
 const expanded=[...new Set(coverageText.split(',').flatMap(c=>c==='Consolidado S+D+C'?['Salud','Dental','Catastrófico']:[c]).filter(Boolean))].sort();
 if(!expanded.length||expanded.length>20||expanded.some(c=>c.length>120))throw new HttpError(400,'Selecciona coberturas válidas.');
 const present=expanded.filter(c=>premiums.some(r=>r.clientName===client&&r.coverage===c)||expenses.some(r=>r.clientName===client&&r.coverage===c));
 const coverages=present.length?present:expanded;
 const month=periods.at(-1)!,chosen=kind==='monthly'?[month]:periods;
 const selected=premiums.filter(r=>r.clientName===client&&chosen.includes(r.period)&&coverages.includes(r.coverage));
 const complete=chosen.every(p=>coverages.every(c=>selected.some(r=>r.period===p&&r.coverage===c)));
 const valid=complete&&selected.every(r=>Number.isFinite(r.premiumUf)&&r.premiumUf>=0&&Number.isFinite(r.spendUf)&&r.spendUf>=0);
 const premium=valid?finite(selected.reduce((s,r)=>s+r.premiumUf,0)):null,spend=valid?finite(selected.reduce((s,r)=>s+r.spendUf,0)):null;
 const details=coverages.map(c=>buildMonthlyDetail(premiums,expenses,client,c,month));
 const metrics:NarrativeMetric[]=[{id:'loss_ratio',label:'Siniestralidad declarada',value:premium!==null&&premium>0&&spend!==null?finite(spend/premium*100):null,unit:'%',reference:chosen.join(', ')}];
 // Existing monthly engine defines the baseline; never equate detail reimbursements with technical spend.
 const comparable=details.every(d=>d.analyzedUf!==null&&d.averageExpenseUf!==null&&d.baselinePeriods.length&&d.baselinePeriods.join(',')===details[0].baselinePeriods.join(','));
 if(comparable){const current=finite(details.reduce((s,d)=>s+d.analyzedUf!,0)),previous=finite(details.reduce((s,d)=>s+d.averageExpenseUf!,0));
  if(current!==null&&previous!==null)metrics.push({id:'expense_change',label:'Variación del reembolso analizado',value:finite(current-previous),unit:'UF',reference:`${month} frente al promedio ${details[0].baselinePeriods.join(', ')}${previous>0?`; ${n((current/previous-1)*100)} %`:''}`});
 }
 const coverageTotals=coverages.map(c=>({coverage:c,value:valid?finite(selected.filter(r=>r.coverage===c).reduce((s,r)=>s+r.spendUf,0)):null})).sort((a,b)=>(b.value??-1)-(a.value??-1));
 const top=coverageTotals[0];
 metrics.push({id:'coverage_focus',label:top?`Gasto declarado · ${top.coverage}`:'Distribución por cobertura',value:top?.value??null,unit:'UF',reference:chosen.join(', ')});
 if(metrics.length<3)metrics.push({id:'premium',label:'Prima declarada',value:premium,unit:'UF',reference:chosen.join(', ')});
 const focus=metrics.find(m=>m.id==='expense_change')??metrics[0];
 const ratio=metrics[0].value;
 let conclusion=[ratio!==null?`La siniestralidad es ${n(ratio)} %: ${n(spend)} UF de gasto / ${n(premium)} UF de primas.`:'Faltan primas o gastos completos para medir la siniestralidad.',
  top?.value!==null&&spend!==null&&spend>0?`${top.coverage} concentra ${n(top.value!/spend*100)} % del gasto declarado (${n(top.value)} UF).`:'Falta una distribución completa para identificar la concentración del gasto.',
  comparable&&metrics.some(m=>m.id==='expense_change')?`En ${month}, el reembolso varió ${n(metrics.find(m=>m.id==='expense_change')!.value)} UF frente al promedio comparable; es una base distinta del gasto declarado.`:'Sin detalle comparable suficiente para explicar la variación; se debe conciliar antes de atribuir causas.'];
 const consecutive=chosen.every((p,i)=>i===0||Number(p.slice(0,4))*12+Number(p.slice(5))-Number(chosen[i-1].slice(0,4))*12-Number(chosen[i-1].slice(5))===1);
 const eligible=kind==='conclusions'&&chosen.length===12&&consecutive&&premium!==null&&premium>0&&spend!==null&&spend>0;
 const projected=eligible?finite(spend!/.75):null;
 const projection={available:projected!==null,currentPremiumUf:premium,projectedPremiumUf:projected,variationPercent:projected!==null?finite((projected/premium!-1)*100):null,variationUf:projected!==null?finite(projected-premium!):null,coverageBudgetUf:eligible?finite(Math.max(0,.75*premium!-spend!)):null,reason:eligible?'Escenario técnico al 75 % con gasto y exposición constantes, sobre 12 meses completos; no es una cotización ni una predicción de la aseguradora. Requiere validar vigencia, desarrollo de siniestros, tendencia y costos.':'Proyección no disponible: se requieren 12 meses consecutivos completos, primas y gasto positivos del mismo alcance; además, validar vigencia y supuestos de renovación.'};
 let actions=[{id:'reconcile',evidenceId:focus.id,title:'Conciliar el gasto y sus diferencias.',measure:'Revisar el 100 % del período y registrar diferencias pendientes.',deadline:'5 días hábiles'},
 {id:'focus',evidenceId:'coverage_focus',title:top?.value!==null?`Revisar el gasto de ${top.coverage}.`:'Completar el desglose por cobertura.',measure:'Identificar las tres partidas de mayor gasto y documentar medidas y responsables, sin ahorro supuesto.',deadline:'10 días hábiles'},
 {id:'renewal',evidenceId:'loss_ratio',title:kind==='conclusions'&&eligible&&ratio!==null&&ratio<75?'Evaluar una mejora contractual de cobertura.':'Definir un plan de control de siniestralidad.',measure:kind==='conclusions'&&eligible&&ratio!==null&&ratio<75?`Solicitar una evaluación contractual y de costo: gasto adicional máximo ${n(projection.coverageBudgetUf)} UF en el período, manteniendo la prima actual y sin superar 75 %. Es alternativa a reducir la prima, no acumulable; no se garantiza una mejora sin cotización.`:'Acordar responsables y seguimiento mensual del gasto y la prima frente al objetivo técnico de 75 %; verificar condiciones antes de cambiar coberturas.',deadline:'Antes de la renovación'}];
 // Rank actual prestation changes on a common reference, never allocate the declared spend to detail rows.
 const grouped=new Map<string,{name:string;current:number;previous:number;lines:number}>();
 const reference=comparable?details[0].baselinePeriods:[];
 const detailScope=kind==='monthly'?[month]:chosen;
 const eligibleExpense=(r:ExpenseRow)=>r.clientName===client&&coverages.includes(r.coverage)&&r.reembolsoUf>0&&!EXCLUDED_PRESTATIONS.has(r.descCober);
 for(const r of expenses.filter(eligibleExpense)){
  const name=r.descCober.trim()||'Prestación sin clasificar',g=grouped.get(name)??{name,current:0,previous:0,lines:0};
  if(detailScope.includes(r.period)){g.current+=r.reembolsoUf;g.lines++;}
  if(kind==='monthly'&&reference.includes(r.period))g.previous+=r.reembolsoUf/reference.length;
  grouped.set(name,g);
 }
 const totalDetail=[...grouped.values()].reduce((sum,g)=>sum+g.current,0);
 const drivers=[...grouped.values()].filter(g=>Number.isFinite(g.current)&&Number.isFinite(g.previous)&&(g.current>0||g.previous>0)).map(g=>({...g,delta:kind==='monthly'&&reference.length?g.current-g.previous:null}));
 const net=drivers.reduce((sum,g)=>sum+(g.delta??0),0);
 drivers.sort((a,b)=>kind==='monthly'&&reference.length?(net>0?(b.delta!>0?1:0)-(a.delta!>0?1:0):net<0?(b.delta!<0?1:0)-(a.delta!<0?1:0):0)||Math.abs(b.delta!)-Math.abs(a.delta!):b.current-a.current);
 const chosenDrivers=drivers.slice(0,kind==='monthly'?3:2);
 const driverMetrics=chosenDrivers.map((g,i)=>({id:`prestation_${i+1}`,label:kind==='monthly'&&reference.length?`${g.name} · variación del reembolso`:`${g.name} · reembolso del período`,value:kind==='monthly'&&reference.length?g.delta:g.current,unit:'UF',reference:kind==='monthly'&&reference.length?`${month}: ${n(g.current)} UF vs promedio ${reference.join(', ')}: ${n(g.previous)} UF; ${g.previous>0?`${n(g.delta!/g.previous*100)} %`:g.current>0?'sin base positiva para calcular %':'sin actividad actual'}`:`${chosen[0]} a ${chosen.at(-1)}; ${totalDetail>0?n(g.current/totalDetail*100):'0'} % del detalle analizado` }));
 const actionFor=(g:typeof drivers[number],i:number)=>{
  const name=g.name,lower=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const lever=/medicament|farmac/.test(lower)?'Comparar precios y condiciones de compra o dispensación, preservando las indicaciones clínicas.':/examen|laborator|imagen|radiolog/.test(lower)?'Revisar repetición de líneas y tarifas comparables; validar pertinencia con el responsable clínico, sin restringir prestaciones automáticamente.':/consulta|ambulator/.test(lower)?'Separar cambio de volumen y costo por línea; comparar tarifas y disponibilidad de la red convenida.':/hospital|cirug/.test(lower)?'Desglosar cuentas y tarifas comparables; evaluar convenios y gestión de cuentas con el responsable técnico.':'Separar volumen y costo por línea; revisar tarifas comparables y diferencias de registro.';
  return {id:`review_prestation_${i+1}`,evidenceId:`prestation_${i+1}`,title:`${g.delta!==null&&g.delta<0?'Verificar el descenso de':'Actuar sobre'} ${name}.`,measure:`${g.delta!==null&&g.delta<0?'Confirmar completitud y rezagos antes de considerar sostenible la baja. ':''}${lever} Revisar las ${g.lines} líneas del alcance y registrar una medida, responsable y resultado UF al próximo cierre; no se presume ahorro.`,deadline:'10 días hábiles'};
 };
 if(driverMetrics.length){
  if(kind==='monthly'){
   metrics.splice(0,metrics.length,...driverMetrics);
   actions=chosenDrivers.map(actionFor);
   // Missing categories are verification tasks, never invented prestations or impacts.
   while(metrics.length<3){const fallback={id:`missing_${metrics.length+1}`,label:'Sin otra prestación cuantificable',value:null,unit:'',reference:'Verificar clasificación y completitud del detalle.'};metrics.push(fallback);actions.push({id:fallback.id,evidenceId:fallback.id,title:'Completar la evidencia del mes.',measure:'Verificar clasificación, conciliación y carga antes de atribuir otro impacto.',deadline:'5 días hábiles'});}
  }else{
   metrics.splice(1,metrics.length-1,...driverMetrics);
   while(metrics.length<3)metrics.push({id:'coverage_focus',label:top?`Gasto declarado · ${top.coverage}`:'Distribución por cobertura',value:top?.value??null,unit:'UF',reference:chosen.join(', ')});
   conclusion=[conclusion[0],...chosenDrivers.map(g=>`${g.name} concentra ${n(g.current)} UF (${totalDetail>0?n(g.current/totalDetail*100):'0'} %) del detalle analizado; no equivale al gasto declarado.`)];
   while(conclusion.length<3)conclusion.push('Falta otra prestación cuantificable; verificar clasificación y completitud antes de atribuir causas.');
   const renewal=actions[2];actions=[...chosenDrivers.map(actionFor),renewal];
   if(actions.length<3)actions.splice(1,0,{id:'verify_detail',evidenceId:'coverage_focus',title:'Completar el desglose de prestaciones.',measure:'Conciliar todas las líneas y documentar categorías faltantes.',deadline:'5 días hábiles'});
  }
 }
 const limitations=['El gasto declarado en primas y los reembolsos positivos del detalle son bases distintas.','Las variaciones son descriptivas; no prueban causalidad ni atenciones únicas.',...(!valid?['Hay períodos o coberturas sin datos completos.']:[])];
 const contextHash=hash({kind,client,clientId,periods,coverages,premium,spend,metrics,actions,conclusion,details:details.map(d=>({period:d.period,baseline:d.baselinePeriods,analyzed:d.analyzedUf,average:d.averageExpenseUf})),version:'prestation-actions-v3'});
 const value:CompanyNarrative={id:'',contextHash,kind,source:'deterministic',model:null,periods:chosen,month,projection,metrics,conclusion,actions,limitations,fallbackReason:null};value.id=hash(value);return value;
}
export function narrativeCatalog(b:CompanyNarrative){
 // Names, dates, absolute UF, provider identities and clinical text never leave NOERGON.
 // Gemini prioritizes only anonymous, normalized indicators; all displayed text remains backend-controlled.
 const scale=Math.max(...b.metrics.filter(m=>m.unit==='UF').map(m=>Math.abs(m.value??0)),1);
 return {kind:b.kind,metrics:b.metrics.filter(m=>m.value!==null&&Number.isFinite(m.value)).map(m=>({id:m.id,value:Math.round((m.unit==='UF'?m.value!/scale*100:m.value!)*10)/10,unit:m.unit==='UF'?'relative_index':'%',meaning:m.id==='loss_ratio'?'declared_loss_ratio':b.kind==='monthly'?'prestation_change_or_concentration':'prestation_concentration'})),projection:{available:b.projection.available},conclusionIds:b.conclusion.map((_,i)=>`c${i}`),actions:b.actions.map(a=>({id:a.id,evidenceId:a.evidenceId}))};
}
export type NarrativeSelection={metricIds:string[];conclusionIds:string[];actionIds:string[];projection:'backend'};
export function selectNarrative(b:CompanyNarrative,value:unknown):CompanyNarrative{
 const v=value as NarrativeSelection;
 const valid=(xs:unknown,count:number,ids:string[])=>Array.isArray(xs)&&xs.length===count&&new Set(xs).size===xs.length&&xs.every(x=>typeof x==='string'&&ids.includes(x));
 if(!v||Object.keys(v).sort().join(',')!=='actionIds,conclusionIds,metricIds,projection'||v.projection!=='backend'||!Array.isArray(v.metricIds)||v.metricIds.length!==3||!valid(v.metricIds,v.metricIds.length,b.metrics.filter(m=>m.value!==null).map(m=>m.id))||!valid(v.conclusionIds,3,['c0','c1','c2'])||!valid(v.actionIds,3,b.actions.map(a=>a.id))||b.actions.some(a=>!v.metricIds.includes(a.evidenceId)))throw new HttpError(422,'Respuesta de Gemini sin respaldo verificable.');
 const result:CompanyNarrative={...b,id:'',source:'gemini',model:'gemini-3.1-flash-lite',metrics:v.metricIds.map(id=>b.metrics.find(m=>m.id===id)!),conclusion:v.conclusionIds.map(id=>b.conclusion[Number(id.slice(1))]),actions:v.actionIds.map(id=>b.actions.find(a=>a.id===id)!)};result.id=hash(result);return result;
}
export interface NarrativeProvider{available():Promise<{available:boolean;reason:string;remaining:number}>;generate(b:CompanyNarrative):Promise<CompanyNarrative>}
export class NativeNarrativeProvider implements NarrativeProvider{
 private calls=new Map<string,number[]>();
 constructor(private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
 private async key(){
  if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY.trim();
  const path=process.env.NOERGON_GEMINI_KEY_FILE;if(!path||!isAbsolute(path))throw Error('private_key_missing');
  const actual=await realpath(path),s=await stat(actual),rel=relative(repositoryRoot,actual);if(!s.isFile()||(s.mode&0o077)||s.size>10000||(!rel.startsWith('..')&&!isAbsolute(rel)))throw Error('private_key_required');return (await readFile(actual,'utf8')).trim();
 }
 async available(){
  const cap=Number(process.env.NOERGON_GEMINI_DAILY_LIMIT??0);
  if(process.env.NOERGON_GEMINI_REAL_ENABLED!=='true'||process.env.NOERGON_GEMINI_BILLING_DISABLED_CONFIRMED!=='true'||!Number.isSafeInteger(cap)||cap<1||cap>500)return {available:false,reason:'Gemini requiere habilitación y un cupo autorizado; el análisis sin IA está disponible.',remaining:0};
  try{const key=await this.key();if(key.length<20||key.length>2048||!/^[\x21-\x7e]+$/.test(key))throw Error();const day=new Date(this.now()).toISOString().slice(0,10),all=this.calls.get(day)??[],remaining=Math.max(0,cap-all.length);return {available:remaining>0&&all.filter(t=>this.now()-t<60000).length<15,reason:remaining?'Disponible bajo demanda.':'Límite local alcanzado; sin reintentos.',remaining};}catch{return {available:false,reason:'La clave del backend no está configurada.',remaining:0};}
 }
 async generate(b:CompanyNarrative){
  const catalog=narrativeCatalog(b);if(catalog.metrics.length<3||catalog.actions.some(a=>!catalog.metrics.some(m=>m.id===a.evidenceId)))throw new HttpError(422,'Faltan indicadores agregados válidos.');
  const availability=await this.available();if(!availability.available)throw new HttpError(429,availability.reason);
  const key=await this.key(),day=new Date(this.now()).toISOString().slice(0,10),cap=Number(process.env.NOERGON_GEMINI_DAILY_LIMIT),times=this.calls.get(day)??[];
  // No await between the final check and reservation: concurrent local requests cannot overspend.
  if(times.length>=cap||times.filter(t=>this.now()-t<60000).length>=15)throw new HttpError(429,'Límite local alcanzado.');
  const schema={type:'object',additionalProperties:false,required:['projection','metricIds','conclusionIds','actionIds'],properties:{projection:{type:'string',enum:['backend']},metricIds:{type:'array',minItems:3,maxItems:3,items:{type:'string',enum:catalog.metrics.map(m=>m.id)}},conclusionIds:{type:'array',minItems:3,maxItems:3,items:{type:'string',enum:catalog.conclusionIds}},actionIds:{type:'array',minItems:3,maxItems:3,items:{type:'string',enum:catalog.actions.map(a=>a.id)}}}};
  const body=JSON.stringify({systemInstruction:{parts:[{text:'Prioriza los indicadores agregados calculados. Devuelve solo referencias del catálogo: exactamente tres metricIds, las tres conclusionIds, exactamente tres actionIds distintos y projection=backend. Incluye los evidenceId de las tres acciones entre metricIds. No inventes cifras, causas, ahorros ni cotizaciones. Las frases finales y los importes son del backend. Solo JSON.'}]},contents:[{role:'user',parts:[{text:JSON.stringify(catalog)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:1024,temperature:0.1}});
  if(Buffer.byteLength(body)>16000)throw new HttpError(413,'Catálogo demasiado grande.');
  times.push(this.now());this.calls.set(day,times);for(const d of this.calls.keys())if(d!==day)this.calls.delete(d);
  try{
   const r=await this.fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body,signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!r.ok)throw Error('provider_rejected');
   const reader=r.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>64000)throw Error('response_limit');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
   const raw=JSON.parse(Buffer.concat(chunks).toString('utf8')),candidate=raw.candidates?.[0];
   if(raw.candidates?.length!==1||candidate.finishReason!=='STOP'||!Array.isArray(candidate.content?.parts)||candidate.content.parts.some((p:any)=>typeof p.text!=='string'))throw Error('invalid_response');
   return selectNarrative(b,JSON.parse(candidate.content.parts.map((p:any)=>p.text).join('')));
  }catch{throw new HttpError(502,'Gemini no completó un resultado válido; se conserva el análisis sin IA.');}
 }
}
export class CompanyNarrativeService{
 private cache=new Map<string,{value:CompanyNarrative;expires:number}>();private pending=new Set<string>();
 constructor(private provider:NarrativeProvider=new NativeNarrativeProvider()){}
 async resolve(owner:string,base:CompanyNarrative,generate=false,approvedId?:string):Promise<NarrativeBundle>{
  const key=owner+':'+base.contextHash,entry=this.cache.get(key);let analysis=entry&&entry.expires>Date.now()?entry.value:base;
  if(approvedId&&approvedId!==analysis.id)throw new HttpError(409,'El análisis cambió o expiró. Actualiza antes de exportar.');
  if(generate&&analysis.source!=='gemini'){
   if(this.pending.has(key))throw new HttpError(409,'Ya hay una generación en curso.');this.pending.add(key);
   try{analysis=await this.provider.generate(base);this.cache.set(key,{value:analysis,expires:Date.now()+1800000});if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value!);}
   catch{analysis={...analysis,fallbackReason:'Gemini no disponible; se conserva el resultado determinístico.'};}finally{this.pending.delete(key);}
  }
  const availability=await this.provider.available(),catalog=narrativeCatalog(base);
  const enough=catalog.metrics.length>=3&&catalog.actions.every(a=>catalog.metrics.some(m=>m.id===a.evidenceId));
  return {analysis,gemini:enough?availability:{available:false,remaining:0,reason:'Faltan indicadores completos y respaldados para solicitar Gemini.'}};
 }
}
