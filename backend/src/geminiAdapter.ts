import { prepareAnalysis, canonical, type AnalysisKind } from './analysisPrivacy.js';
import { AnalysisPersistence, type AuthorizedAnalysisUser, classifyProviderFailure } from './analysisPersistence.js';
import { buildCatalog, deterministicAnalysis, renderAnalysis, validateGroundedResult, type GroundedResult } from './analysisGrounding.js';
import type { ScopeInput } from './policyScope.js';
import { databaseError, HttpError } from './supabase.js';

// Deliberately no HTTP transport, SDK, key access or automatic application wiring.
export const GEMINI_ENABLED = false;
export const PROMPT_VERSION = 'prompt-v2';
export const RESPONSE_SCHEMA = {type:'object',additionalProperties:false,required:['schemaVersion','kind','sections','recommendations'],properties:{schemaVersion:{const:'analysis-result-v2'},kind:{enum:['monthly','conclusions']},sections:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,required:['code','findings'],properties:{code:{enum:['monthly_result','technical_result','renewal_projection','action_plan']},findings:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['ref','value'],properties:{ref:{type:'string'},value:{type:'number'}}}}}}},recommendations:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['code','evidenceRef'],properties:{code:{const:'review_benefits'},evidenceRef:{type:'string'}}}}}};
export type ProviderRequest = {systemInstruction:string;data:string;responseSchema:typeof RESPONSE_SCHEMA;maxOutputTokens:number};
export type ProviderResponse = {result:unknown;usage:{input:number;output:number;total:number}};
export interface SimulatedProvider {readonly mode:'simulation';generate(request:ProviderRequest,signal:AbortSignal):Promise<ProviderResponse>}
type Store=Pick<AnalysisPersistence,'read'|'reserve'|'finish'|'runtimePolicy'>;
const instruction='Interpreta solo el catálogo agregado. Copia referencias y cifras exactas, sin cálculos nuevos. Mensual: monthly_result. Final: technical_result, renewal_projection, action_plan en ese orden. Sin escenarios: renewal_projection vacío. Respeta expenseBasis: paid significa pagado e incurred significa incurrido; nunca los equipares. Solo review_benefits ante differenceUf positivo por cobertura y citado en findings. No inventes causas, tasas, atenciones, tratamientos ni acciones clínicas. No incluyas texto libre. Máximo tres conclusiones.';
function verifiedPolicy(p:any,model:string,now:number) {
  const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  return p?.enabled===true && p.tier==='free' && p.api_budget_clp===0 && p.project_verified===true && p.free_quota_verified===true && p.billing_disabled_verified===true && p.privacy_approved===true && p.model===model && p.verified_model===model && hash(p.project_ref_sha256) && p.project_ref_sha256===p.verified_project_sha256 && hash(p.quota_evidence_sha256) && hash(p.billing_evidence_sha256) && Date.parse(p.verified_at)<=now && Date.parse(p.verification_expires_at)>now && Date.parse(p.verification_expires_at)-Date.parse(p.verified_at)<=86400000 && (!p.cooldown_until || Date.parse(p.cooldown_until)<=now) && ['project_requests_minute','project_requests_day','user_requests_minute','user_requests_day','project_tokens_minute','project_tokens_day','user_tokens_minute','user_tokens_day','max_input_tokens','max_output_tokens'].every(k=>Number.isSafeInteger(Number(p[k]))&&Number(p[k])>0) && p.project_requests_minute<=p.verified_free_rpm && p.project_requests_day<=p.verified_free_rpd && p.project_tokens_minute<=p.verified_free_tpm;
}
export class GeminiAnalysisAdapter {
  constructor(private readonly store:Store,private readonly simulation?:SimulatedProvider,private readonly timeoutMs=5000) {}
  monthly(user:AuthorizedAnalysisUser,input:ScopeInput,model:string) {return this.run(user,input,'monthly',model);}
  conclusions(user:AuthorizedAnalysisUser,input:ScopeInput,model:string,scenarios?:unknown) {return this.run(user,input,'conclusions',model,scenarios);}
  private async run(user:AuthorizedAnalysisUser,input:ScopeInput,kind:AnalysisKind,model:string,scenarios?:unknown) {
    // RLS access precedes preparation and even deterministic fallback.
    const access=await user.db.from('portfolio_policies').select('id').eq('id',input.policy.id).eq('client_id',input.client.id).maybeSingle();
    databaseError(access.error);if(!access.data)throw new HttpError(403,'analysis_access_denied');
    const prepared=prepareAnalysis(input,user.id,kind,model,PROMPT_VERSION,scenarios);
    const catalog=prepared.status==='prepared'?buildCatalog(prepared.payload):{};
    const fallback=(reason:string)=>{const result=deterministicAnalysis(kind,catalog);return {source:'deterministic' as const,reason,result,view:renderAnalysis(result,catalog)};};
    if(prepared.status==='blocked')return fallback(prepared.reason);
    if(new Set(prepared.payload.months.flatMap(m=>m.coverages.map(c=>c.expenseBasis))).size!==1)return fallback('expense_basis_changed');
    if(!this.simulation || this.simulation.mode!=='simulation')return fallback('real_provider_disabled');
    let policy:any;
    try {policy=await this.store.runtimePolicy();}catch{return fallback('persistence_unavailable');}
    if(!verifiedPolicy(policy,model,Date.now()))return fallback('free_tier_not_verified_or_disabled');
    let cached;
    try {cached=await this.store.read(user,prepared.identity);}catch(error){if(error instanceof HttpError && error.status===403)throw error;return fallback('cache_unavailable_or_invalid');}
    if(cached) {try {validateGroundedResult(cached.result,kind,catalog);return {source:'cache' as const,result:cached.result,view:renderAnalysis(cached.result,catalog)};}catch{return fallback('invalid_cache');}}
    const request:ProviderRequest={systemInstruction:instruction,data:canonical({operation:kind,aggregates:prepared.payload,catalog}),responseSchema:RESPONSE_SCHEMA,maxOutputTokens:Number(policy.max_output_tokens)};
    // Synthetic simulation bound only. A real tokenizer must be verified before any real transport.
    const inputBound=Buffer.byteLength(canonical(request),'utf8');
    if(inputBound>Number(policy.max_input_tokens))return fallback('request_token_limit');
    let reservation;
    try {reservation=await this.store.reserve(user,prepared.identity,inputBound,request.maxOutputTokens);}catch(error){if(error instanceof HttpError && error.status===403)throw error;return fallback('reservation_not_confirmed');}
    if(reservation.status!=='reserved')return fallback(reservation.reason??reservation.status);
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let outcome:'succeeded'|'rate_limited'|'timeout'|'provider_error'|'invalid_result'='provider_error';
    let result:GroundedResult|null=null;let usage:ProviderResponse['usage']|null=null;
    try {
      const response=await Promise.race([this.simulation.generate(request,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject({timeout:true});},Math.max(1,Math.min(this.timeoutMs,30000)));})]);
      const u=response.usage;
      if(!u || ![u.input,u.output,u.total].every(n=>Number.isSafeInteger(n)&&n>=0) || u.total<u.input+u.output)throw {invalid:true};
      usage={input:u.input,output:u.output,total:u.total};
      try{validateGroundedResult(response.result,kind,catalog);}catch{throw {invalid:true};}
      result=response.result;outcome='succeeded';
    }catch(error){const e=error as {timeout?:boolean;status?:number;invalid?:boolean};outcome=e?.invalid?'invalid_result':classifyProviderFailure(e?.status??null,e?.timeout===true);}
    finally{if(timer)clearTimeout(timer);controller.abort();}
    try {
      const finished=await this.store.finish(user,reservation.requestId,reservation.leaseToken,outcome,result,usage);
      if(finished.status!=='succeeded' || !result)return fallback(finished.status??outcome);
    }catch{return fallback('completion_not_confirmed');}
    return {source:'simulation' as const,result,view:renderAnalysis(result,catalog)};
  }
}
