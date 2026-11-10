import { HttpError } from './supabase.js';
import type { prepareAnalysis, AnalysisKind } from './analysisPrivacy.js';

type Prepared = Extract<ReturnType<typeof prepareAnalysis>, {status:'prepared'}>;
export type Catalog = Record<string, { value:number; coverage?:string; expenseBasis?:string; unit:'UF'|'ratio'|'percent'|'pp' }>;
export type GroundedResult = {schemaVersion:'analysis-result-v2';kind:AnalysisKind;sections:Array<{code:string;findings:Array<{ref:string;value:number}>}>;recommendations:Array<{code:'review_benefits';evidenceRef:string}>};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateGroundedShape(value:unknown): asserts value is GroundedResult {
  const fail=()=>{throw new HttpError(400,'analysis_unsafe_result');};
  if(!exact(value,['schemaVersion','kind','sections','recommendations']) || value.schemaVersion!=='analysis-result-v2' || !['monthly','conclusions'].includes(String(value.kind)) || !Array.isArray(value.sections) || !Array.isArray(value.recommendations)) return fail();
  const codes=value.kind==='monthly'?['monthly_result']:['technical_result','renewal_projection','action_plan'];
  if(value.sections.length!==codes.length || value.recommendations.length>3) return fail();
  for(const [i,s] of value.sections.entries()) {
    if(!exact(s,['code','findings']) || s.code!==codes[i] || !Array.isArray(s.findings) || s.findings.length>8) return fail();
    const seen=new Set();
    for(const f of s.findings) {if(!exact(f,['ref','value']) || typeof f.ref!=='string' || !/^(m\d{1,3}(\.c\d{1,2})?|r\d{1,2})\.[a-zA-Z]{1,40}$/.test(f.ref) || typeof f.value!=='number' || !Number.isFinite(f.value) || seen.has(f.ref)) return fail();seen.add(f.ref);}
  }
  const seen=new Set();
  for(const r of value.recommendations) {if(!exact(r,['code','evidenceRef']) || r.code!=='review_benefits' || typeof r.evidenceRef!=='string' || !/^m\d{1,3}\.c\d{1,2}\.differenceUf$/.test(r.evidenceRef) || seen.has(r.evidenceRef)) return fail();seen.add(r.evidenceRef);}
  if(JSON.stringify(value).length>8192) return fail();
}
export function buildCatalog(payload:Prepared['payload']):Catalog {
  const catalog:Catalog={};
  const add=(prefix:string,values:object,coverage?:string)=>{for(const [key,value] of Object.entries(values)) if(typeof value==='number' && Number.isFinite(value)) catalog[`${prefix}.${key}`]={value,...(coverage?{coverage}:{}),unit:key.endsWith('Uf')?'UF':key.endsWith('Pp')?'pp':key==='lossRatio'?'ratio':'percent'};};
  payload.months.forEach((m,i)=>{add(`m${i}`,m.current);if(m.effects)add(`m${i}`,m.effects);m.coverages.forEach((c,j)=>{add(`m${i}.c${j}`,c,c.type);for(const [ref,item] of Object.entries(catalog))if(ref.startsWith(`m${i}.c${j}.`))item.expenseBasis=c.expenseBasis;});const bases=[...new Set(m.coverages.map(c=>c.expenseBasis))];for(const [ref,item] of Object.entries(catalog))if(ref.startsWith(`m${i}.`)&&!item.coverage)item.expenseBasis=bases.length===1?bases[0]:'mixed';});
  payload.renewal.forEach((r,i)=>add(`r${i}`,r));return catalog;
}
export function validateGroundedResult(value:unknown,kind:AnalysisKind,catalog:Catalog):asserts value is GroundedResult {
  validateGroundedShape(value);
  if(value.kind!==kind) throw new HttpError(400,'analysis_wrong_operation');
  for(const s of value.sections) for(const f of s.findings) {
    if(!catalog[f.ref] || catalog[f.ref].value!==f.value || (s.code==='renewal_projection' && !f.ref.startsWith('r')) || (s.code!=='renewal_projection' && f.ref.startsWith('r'))) throw new HttpError(400,'analysis_unverified_figure');
  }
  if(!value.sections[0].findings.length) throw new HttpError(400,'analysis_missing_evidence');
  for(const r of value.recommendations) if(!catalog[r.evidenceRef]?.coverage || catalog[r.evidenceRef].value<=0 || !value.sections.some(s=>s.findings.some(f=>f.ref===r.evidenceRef))) throw new HttpError(400,'analysis_unfounded_action');
}
export function deterministicAnalysis(kind:AnalysisKind,catalog:Catalog):GroundedResult {
  const first=Object.keys(catalog).filter(k=>/^m0\.(premiumUf|technicalSpendUf|lossRatio)$/.test(k));
  const sections=(kind==='monthly'?['monthly_result']:['technical_result','renewal_projection','action_plan']).map(code=>({code,findings:(code==='renewal_projection'?Object.keys(catalog).filter(k=>k.startsWith('r0.')):code==='action_plan'?[]:first).map(ref=>({ref,value:catalog[ref].value}))}));
  return {schemaVersion:'analysis-result-v2',kind,sections,recommendations:[]};
}
export function renderAnalysis(result:GroundedResult,catalog:Catalog) {
  return result.sections.map(s=>({code:s.code,figures:s.findings.map(f=>({reference:f.ref,coverage:catalog[f.ref]?.coverage??null,value:f.value,unit:catalog[f.ref]?.unit,expenseBasis:catalog[f.ref]?.expenseBasis??null})),actions:result.recommendations.filter(r=>s.findings.some(f=>f.ref===r.evidenceRef)).map(r=>`Revisar las condiciones de ${catalog[r.evidenceRef].coverage} por un aumento verificado de ${catalog[r.evidenceRef].value} UF; evaluar alternativas sin modificar beneficios automáticamente.`),limitation:s.findings.length?null:s.code==='renewal_projection'?'Sin escenario técnico verificado: no se proyecta renovación.':'Sin evidencia suficiente para recomendar una acción específica.'}));
}
