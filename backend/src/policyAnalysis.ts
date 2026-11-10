import type { SupabaseClient } from '@supabase/supabase-js';
import type { PolicyAnalysis } from '../../shared/analysis.js';
import type { ScopeInput } from './policyScope.js';
import { buildPolicyIndicators } from './technicalIndicators.js';
import { prepareAnalysis, type AnalysisKind } from './analysisPrivacy.js';
import { buildCatalog, validateGroundedResult, renderAnalysis } from './analysisGrounding.js';
import { PROMPT_VERSION } from './geminiAdapter.js';
import { HttpError, databaseError } from './supabase.js';

// Read-only integration. Never constructs a provider or reserves tokens.
export const DISPLAY_CACHE_MODEL='gemini-synthetic';
const labels:Record<string,string>={premiumUf:'Prima',technicalSpendUf:'Gasto técnico',lossRatio:'Siniestralidad',reimbursementUf:'Reembolsos',differenceUf:'Diferencia UF',currentSpendUf:'Gasto actual',previousSpendUf:'Gasto anterior',variationPercent:'Variación relativa',sharePercent:'Participación en el gasto',contributionPp:'Contribución a la variación',lossRatioDeltaPp:'Cambio de siniestralidad',spendEffectPp:'Efecto gasto',premiumEffectPp:'Efecto prima',projectedSpendUf:'Gasto proyectado',comparablePremiumUf:'Prima comparable',requiredPremiumUf:'Prima requerida',adjustmentPercent:'Ajuste del escenario'};
const number=(v:number)=>v.toLocaleString('es-CL',{maximumFractionDigits:2});
export async function policyAnalysis(db:SupabaseClient,ownerId:string,input:ScopeInput,kind:AnalysisKind,scenarios?:unknown):Promise<PolicyAnalysis> {
  const access=await db.from('portfolio_policies').select('id').eq('id',input.policy.id).eq('client_id',input.client.id).maybeSingle();
  databaseError(access.error);if(!access.data)throw new HttpError(403,'analysis_access_denied');
  const indicators=buildPolicyIndicators(input);
  const result:PolicyAnalysis={status:'blocked',kind,source:'deterministic',persisted:false,reason:null,checkedAt:new Date().toISOString(),expiresAt:null,contextHash:null,
    scope:{clientId:input.client.id,clientName:input.client.name,policyId:input.policy.id,number:input.policy.number_key,insurer:input.policy.insurer_key,periods:indicators.scope.selection.periods,coverages:indicators.scope.selection.coverages,
      versions:[...new Set(indicators.monthly.flatMap(m=>[m.currentVersionId,m.previousVersionId].filter((id):id is string=>!!id)))].sort(),premiumSnapshotId:input.snapshots.find(s=>s.kind==='primas')!.id,expenseSnapshotId:input.snapshots.find(s=>s.kind==='gastos')!.id},sections:[],
    quality:indicators.scope.monthly.flatMap(m=>m.coverages.map(c=>({period:m.period,coverage:c.coverage,status:c.qualityStatus,expenseBasis:c.expenseBasis,reconciliation:c.reconciliation})))};
  const prepared=prepareAnalysis(input,ownerId,kind,DISPLAY_CACHE_MODEL,PROMPT_VERSION,scenarios);
  if(prepared.status==='blocked'){result.reason=prepared.reason;return result;}
  if(new Set(prepared.payload.months.flatMap(m=>m.coverages.map(c=>c.expenseBasis))).size!==1){result.reason='expense_basis_changed';return result;}
  const identity=prepared.identity,catalog=buildCatalog(prepared.payload);
  result.contextHash=identity.cacheKey;result.scope.versions=identity.contractVersions;
  // Exact ownership, dimensions, state, expiry and provenance, in addition to RLS.
  const cached=await db.from('analysis_cache').select('id,result,origin,expires_at,owner_id,client_id,policy_id,cache_key')
    .eq('owner_id',ownerId).eq('client_id',input.client.id).eq('policy_id',input.policy.id).eq('cache_key',identity.cacheKey)
    .eq('model',identity.model).eq('prompt_version',identity.promptVersion).eq('indicators_hash',identity.indicatorsHash)
    .eq('assumptions_hash',identity.assumptionsHash).eq('calculation_version',identity.calculationVersion).eq('privacy_version',identity.privacyVersion)
    .eq('state','ready').eq('origin','simulated').maybeSingle();
  // Missing local migrations => deterministic fallback, never privileged reads.
  if(cached.error && !['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(cached.error.code??''))databaseError(cached.error);
  const row=cached.data;
  if(row && row.origin==='simulated' && row.owner_id===ownerId && row.client_id===input.client.id && row.policy_id===input.policy.id && row.cache_key===identity.cacheKey && Date.parse(row.expires_at)>Date.now()) {
    try {
      validateGroundedResult(row.result,kind,catalog);
      const view=renderAnalysis(row.result,catalog);
      result.sections=view.map((s,i)=>({title:kind==='monthly'?'Análisis técnico mensual':['Resultado técnico','Escenario de renovación','Acciones fundamentadas'][i],
        text:[...s.figures.map(f=>`${f.reference.startsWith('r')?'Escenario':identity.periods[Number(/^m(\d+)/.exec(f.reference)?.[1]??0)]} · ${f.coverage??'Póliza'} · ${labels[f.reference.split('.').at(-1)!]??'Indicador verificado'}: ${number(f.unit==='ratio'?f.value*100:f.value)} ${f.unit==='ratio'||f.unit==='percent'?'%':f.unit??''} (${f.expenseBasis==='paid'?'pagado':f.expenseBasis==='incurred'?'incurrido':'base del escenario'}).`),...s.actions,s.limitation??''].filter(Boolean).join(' '),references:s.figures.map(f=>f.reference)}));
      result.status='available';result.source='simulated';result.persisted=true;result.expiresAt=row.expires_at;return result;
    }catch { /* Invalid cache is never exported. Use verified deterministic data. */ }
  }
  const months=prepared.payload.months;
  const last=months.at(-1)!;
  const basis=last.coverages[0].expenseBasis==='paid'?'pagado':'incurrido';
  const premium=months.reduce((sum,m)=>sum+m.current.premiumUf!,0),spend=months.reduce((sum,m)=>sum+m.current.technicalSpendUf!,0);
  const observed=`Prima ${number(premium)} UF; gasto técnico ${basis} ${number(spend)} UF; siniestralidad ${premium>0?`${number(100*spend/premium)}%`:'no calculable por prima cero'}. Fuentes conciliadas y completitud revisada.`;
  const change=last.effects?`Último mes seleccionado: variación de siniestralidad ${number(last.effects.lossRatioDeltaPp!)} puntos porcentuales: efecto gasto ${number(last.effects.spendEffectPp!)} pp y efecto prima ${number(last.effects.premiumEffectPp!)} pp. Esta descomposición es matemática; no acredita causas clínicas.`:'No hay base mensual anterior comparable y verificada; no se atribuyen variaciones.';
  const coverage=last.coverages.filter(c=>c.differenceUf!=null).map(c=>`${c.type}: gasto ${number(c.currentSpendUf!)} UF frente a ${number(c.previousSpendUf!)} UF; diferencia ${number(c.differenceUf!)} UF; variación ${c.variationPercent==null?'no calculable por base cero':`${number(c.variationPercent)}%`}; contribución ${number(c.contributionPp!)} pp.`).join(' ');
  const actions=last.coverages.filter(c=>c.differenceUf!=null&&c.differenceUf>0).map(c=>`Revisar las condiciones de ${c.type} por aumento verificado de ${number(c.differenceUf!)} UF; evaluar alternativas sin modificar beneficios automáticamente.`).join(' ')||'No hay evidencia cuantificada suficiente para proponer una acción específica por cobertura.';
  const renewal=prepared.payload.renewal.map(r=>`Escenario configurado: gasto proyectado ${number(r.projectedSpendUf)} UF; prima requerida ${number(r.requiredPremiumUf)} UF; ajuste ${number(r.adjustmentPercent)}%. No es una oferta.`).join(' ');
  result.status='available';
  result.sections=kind==='monthly'?[{title:'Análisis técnico mensual',text:`${observed} ${change} ${coverage} ${actions}`,references:Object.keys(catalog)}]:[
    {title:'Resultado técnico del período',text:observed,references:months.flatMap((_,i)=>[`m${i}.premiumUf`,`m${i}.technicalSpendUf`,`m${i}.lossRatio`])},
    {title:'Variación y coberturas',text:`${change} ${coverage}`,references:Object.keys(catalog).filter(r=>r.includes('.c')||r.endsWith('Pp'))},
    {title:'Acciones y alcance de renovación',text:`${actions} ${renewal||'Sin supuestos de renovación verificados: no se proyecta un reajuste.'}`,references:Object.keys(catalog).filter(r=>r.startsWith('r')||r.endsWith('.differenceUf'))},
  ];return result;
}
