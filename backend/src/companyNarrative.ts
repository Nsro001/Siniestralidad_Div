import {createHash} from 'node:crypto';
import {readFile,stat,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import type {PremiumRow,ExpenseRow} from './types.js';
import type {CompanyNarrative,NarrativeBundle,NarrativeKind,NarrativeMetric} from '../../shared/companyNarrative.js';
import {buildMonthlyDetail} from './monthly.js';
import {HttpError} from './supabase.js';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const n=(v:number|null)=>v===null?'no disponible':v.toLocaleString('es-CL',{maximumFractionDigits:2});
const finite=(v:number|null)=>v!==null&&Number.isFinite(v)?v:null;
export function companyNarrative(premiums:PremiumRow[],expenses:ExpenseRow[],client:string,periodText:string,coverageText:string,kind:NarrativeKind):CompanyNarrative{
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
 const conclusion=[premium!==null&&spend!==null?`El período registra ${n(premium)} UF de primas y ${n(spend)} UF de gasto declarado.`:'Faltan primas o gastos completos para calcular el resultado del período.',
  comparable&&metrics.some(m=>m.id==='expense_change')?`En ${month}, el reembolso analizado varió ${n(metrics.find(m=>m.id==='expense_change')!.value)} UF frente al promedio comparable.`:'No hay una base completa comparable para atribuir una variación mensual.',
  'La renovación requiere validar las condiciones y los supuestos antes de estimar una prima.'];
 const projection={available:false as const,currentPremiumUf:premium,projectedPremiumUf:null,variationPercent:null,reason:'Proyección no disponible: faltan una vigencia contractual vinculada, completitud revisada y supuestos de renovación validados; no es una cotización de aseguradora.'};
 const actions=[{id:'reconcile',evidenceId:focus.id,title:'Conciliar los importes y las diferencias del período.',measure:'Revisar el 100 % de los importes del alcance y documentar cada diferencia.',deadline:'En 5 días hábiles'},
 {id:'focus',evidenceId:'coverage_focus',title:top?.value!==null?'Revisar la cobertura de mayor gasto declarado.':'Completar la distribución de gasto por cobertura.',measure:'Registrar los importes revisados y una decisión respaldada, sin ahorro supuesto.',deadline:'En 10 días hábiles'},
 {id:'renewal',evidenceId:'loss_ratio',title:'Validar los antecedentes necesarios para la renovación.',measure:'Documentar vigencia, conciliación, completitud y supuestos o dejar constancia de cada faltante.',deadline:'Antes de negociar la renovación'}];
 const limitations=['El gasto declarado en primas y los reembolsos positivos del detalle son bases distintas.','Las variaciones son descriptivas; no prueban causalidad ni atenciones únicas.',...(!valid?['Hay períodos o coberturas sin datos completos.']:[])];
 const contextHash=hash({kind,client,periods,coverages,premium,spend,metrics,details:details.map(d=>({period:d.period,baseline:d.baselinePeriods,analyzed:d.analyzedUf,average:d.averageExpenseUf})),version:'original-narrative-v1'});
 const value:CompanyNarrative={id:'',contextHash,kind,source:'deterministic',model:null,periods:chosen,month,projection,metrics,conclusion,actions,limitations,fallbackReason:null};value.id=hash(value);return value;
}
export function narrativeCatalog(b:CompanyNarrative){return {kind:b.kind,metrics:b.metrics.filter(m=>m.value!==null&&Number.isFinite(m.value)).map(m=>({id:m.id,value:m.value,unit:m.unit})),projection:{available:false},conclusionIds:b.conclusion.map((_,i)=>`c${i}`),actions:b.actions.map(a=>({id:a.id,evidenceId:a.evidenceId}))};}
export type NarrativeSelection={metricIds:string[];conclusionIds:string[];actionIds:string[];projection:'backend'};
export function selectNarrative(b:CompanyNarrative,value:unknown):CompanyNarrative{
 const v=value as NarrativeSelection;
 const valid=(xs:unknown,count:number,ids:string[])=>Array.isArray(xs)&&xs.length===count&&new Set(xs).size===xs.length&&xs.every(x=>typeof x==='string'&&ids.includes(x));
 if(!v||Object.keys(v).sort().join(',')!=='actionIds,conclusionIds,metricIds,projection'||v.projection!=='backend'||!Array.isArray(v.metricIds)||v.metricIds.length<2||v.metricIds.length>3||!valid(v.metricIds,v.metricIds.length,b.metrics.filter(m=>m.value!==null).map(m=>m.id))||!valid(v.conclusionIds,3,['c0','c1','c2'])||!valid(v.actionIds,3,b.actions.map(a=>a.id))||b.actions.some(a=>!v.metricIds.includes(a.evidenceId)))throw new HttpError(422,'Respuesta de Gemini sin respaldo verificable.');
 const result:CompanyNarrative={...b,id:'',source:'gemini',model:'gemini-3.1-flash-lite',metrics:v.metricIds.map(id=>b.metrics.find(m=>m.id===id)!),conclusion:v.conclusionIds.map(id=>b.conclusion[Number(id.slice(1))]),actions:v.actionIds.map(id=>b.actions.find(a=>a.id===id)!)};result.id=hash(result);return result;
}
export interface NarrativeProvider{available():Promise<{available:boolean;reason:string;remaining:number}>;generate(b:CompanyNarrative):Promise<CompanyNarrative>}
export class NativeNarrativeProvider implements NarrativeProvider{
 private calls=new Map<string,number[]>();
 constructor(private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
 private async key(){
  if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY.trim();
  const path=process.env.NOERGON_GEMINI_KEY_FILE;if(!path||!isAbsolute(path))throw Error('private_key_missing');
  const actual=await realpath(path),s=await stat(actual),rel=relative(resolve('.'),actual);if(!s.isFile()||(s.mode&0o077)||s.size>10000||(!rel.startsWith('..')&&!isAbsolute(rel)))throw Error('private_key_required');return (await readFile(actual,'utf8')).trim();
 }
 async available(){
  const cap=Number(process.env.NOERGON_GEMINI_DAILY_LIMIT??0);
  if(process.env.NOERGON_GEMINI_REAL_ENABLED!=='true'||process.env.NOERGON_GEMINI_BILLING_DISABLED_CONFIRMED!=='true'||!Number.isSafeInteger(cap)||cap<1||cap>500)return {available:false,reason:'Gemini requiere habilitación y un cupo autorizado; el análisis sin IA está disponible.',remaining:0};
  try{const key=await this.key();if(!/^AIza[\w-]{20,}$/.test(key))throw Error();const day=new Date(this.now()).toISOString().slice(0,10),all=this.calls.get(day)??[],remaining=Math.max(0,cap-all.length);return {available:remaining>0&&all.filter(t=>this.now()-t<60000).length<15,reason:remaining?'Disponible bajo demanda.':'Límite local alcanzado; sin reintentos.',remaining};}catch{return {available:false,reason:'La clave del backend no está configurada.',remaining:0};}
 }
 async generate(b:CompanyNarrative){
  const catalog=narrativeCatalog(b);if(catalog.metrics.length<2||catalog.actions.some(a=>!catalog.metrics.some(m=>m.id===a.evidenceId)))throw new HttpError(422,'Faltan indicadores agregados válidos.');
  const availability=await this.available();if(!availability.available)throw new HttpError(429,availability.reason);
  const key=await this.key(),day=new Date(this.now()).toISOString().slice(0,10),cap=Number(process.env.NOERGON_GEMINI_DAILY_LIMIT),times=this.calls.get(day)??[];
  // No await between the final check and reservation: concurrent local requests cannot overspend.
  if(times.length>=cap||times.filter(t=>this.now()-t<60000).length>=15)throw new HttpError(429,'Límite local alcanzado.');
  const schema={type:'object',additionalProperties:false,required:['projection','metricIds','conclusionIds','actionIds'],properties:{projection:{type:'string',enum:['backend']},metricIds:{type:'array',minItems:2,maxItems:3,items:{type:'string',enum:catalog.metrics.map(m=>m.id)}},conclusionIds:{type:'array',minItems:3,maxItems:3,items:{type:'string',enum:catalog.conclusionIds}},actionIds:{type:'array',minItems:3,maxItems:3,items:{type:'string',enum:catalog.actions.map(a=>a.id)}}}};
  const body=JSON.stringify({systemInstruction:{parts:[{text:'Prioriza los indicadores agregados calculados. Devuelve solo referencias del catálogo: 2 o 3 metricIds, las tres conclusionIds, exactamente tres actionIds distintos y projection=backend. Incluye los evidenceId de las tres acciones entre metricIds. No inventes cifras, causas, ahorros ni cotizaciones. Las frases finales y los importes son del backend. Solo JSON.'}]},contents:[{role:'user',parts:[{text:JSON.stringify(catalog)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:1024,temperature:0.1}});
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
  const enough=catalog.metrics.length>=2&&catalog.actions.every(a=>catalog.metrics.some(m=>m.id===a.evidenceId));
  return {analysis,gemini:enough?availability:{available:false,remaining:0,reason:'Faltan indicadores completos y respaldados para solicitar Gemini.'}};
 }
}
