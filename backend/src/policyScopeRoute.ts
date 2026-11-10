import { policyAnalysis } from './policyAnalysis.js';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, databaseError } from './supabase.js';
import { uuid, validateEvidence } from './contracts.js';
import { requireAdmin } from './supabase.js';
import { portfolioError } from './portfolioAdmin.js';
import type { TechnicalReview } from '../../shared/technicalReview.js';
import { resolvePolicyScope, scopeSelection, type ScopePolicy, type ScopeSnapshot } from './policyScope.js';
import type { PolicyVersion, RowLink } from '../../shared/portfolio.js';
import { buildPolicyIndicators } from './technicalIndicators.js';
import { buildRenewalScenarios } from './renewalScenarios.js';
import type { RequestHandler } from 'express';

function check(error: { code?: string } | null) {
  if (error && ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    throw new HttpError(503, 'El diagnóstico por póliza requiere las migraciones de Administración de Cartera. No se modificaron los datos.');
  }
  databaseError(error);
}
async function scopedRows<T>(db: SupabaseClient, table: string, column: string, value: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select(columns).eq(column, value);
    for (const field of order.split(',')) query = query.order(field);
    const { data, error } = await query.range(offset, offset + 499);
    check(error); rows.push(...(data ?? []) as T[]);
    if (!data || data.length < 500) return rows;
  }
}
export function policyScopeRouter() {
  const router = Router();
  const handle: RequestHandler = (req, res, next) => {
    (async () => {
      const db = res.locals.auth.db as SupabaseClient;
      const parameter = (name: string) => {
        const value = req.query[name];
        if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Parámetro requerido: ${name}.`);
        return value;
      };
      const id = uuid(req.params.policyId);
      const selection = scopeSelection(parameter('periods').split(',').map(s => s.trim()), parameter('coverages').split(',').map(s => s.trim()));
      const premiumId = uuid(parameter('premiumSnapshotId')), expenseId = uuid(parameter('expenseSnapshotId'));
      const { data: policy, error } = await db.from('portfolio_policies').select('id,client_id,number_key,insurer_key').eq('id', id).maybeSingle();
      check(error);
      if (!policy) throw new HttpError(404, 'Póliza no disponible.');
      const { data: client, error: clientError } = await db.from('clients').select('id,name,rut').eq('id', policy.client_id).maybeSingle();
      check(clientError);
      if (!client) throw new HttpError(404, 'Empresa no disponible.');
      if (req.method === 'POST' && req.path.endsWith('/reviews')) {
        const b = req.body ?? {};
        if (!selection.periods.includes(b.period) || !selection.coverages.includes(b.coverage) ||
          !['expense_basis','completeness','partial_month','coverage_ambiguity','allocation'].includes(b.review_kind) ||
          !['pending','validated','rejected'].includes(b.decision) || !['paid','incurred','undetermined'].includes(b.expense_basis) ||
          typeof b.note !== 'string' || b.note.trim().length < 3 || b.note.length > 2000 ||
          (b.data_complete !== null && typeof b.data_complete !== 'boolean') || (b.decision === 'validated' && !validateEvidence(b.evidence))) throw new HttpError(400,'Revisión o respaldo inválidos.');
        const {data,error} = await db.rpc('portfolio_review_technical',{target_policy:id,version_id:uuid(b.versionId),premium_snapshot:premiumId,expense_snapshot:expenseId,details:{
          period:b.period,coverage:b.coverage,review_kind:b.review_kind,decision:b.decision,expense_basis:b.expense_basis,data_complete:b.data_complete,evidence:b.evidence??null,note:b.note.trim()}});
        portfolioError(error); res.json({id:data}); return;
      }
      let reviewStorageAvailable = true;
      const reviews: TechnicalReview[] = [];
      for(let offset=0;;offset+=500){
        const {data,error}=await db.from('portfolio_technical_reviews').select('*').eq('policy_id',id).order('id').range(offset,offset+499);
        if(error && ['42P01','PGRST205'].includes(error.code)){reviewStorageAvailable=false;break;}
        check(error);reviews.push(...(data??[]) as TechnicalReview[]);if(!data||data.length<500)break;
      }
      const selectedReviews=reviews.filter(r=>r.premium_snapshot_id===premiumId&&r.expense_snapshot_id===expenseId&&selection.periods.includes(r.period)&&selection.coverages.includes(r.coverage));
      if(req.path.endsWith('/reviews')){res.json({reviews:selectedReviews,reviewStorageAvailable});return;}
      const snapshot = async (snapshotId: string, kind: 'primas' | 'gastos') => {
        const { data, error } = await db.from('portfolio_dataset_versions').select('id,client_id,kind,rows')
          .eq('id', snapshotId).eq('client_id', client.id).eq('kind', kind).maybeSingle();
        check(error);
        if (!data) throw new HttpError(404, 'Snapshot no disponible para esta empresa y tipo de sábana.');
        return data as ScopeSnapshot;
      };
      const [policies, versions, premiums, expenses, premiumLinks, expenseLinks] = await Promise.all([
        scopedRows<ScopePolicy>(db, 'portfolio_policies', 'client_id', client.id, 'id,client_id,number_key,insurer_key', 'id'),
        scopedRows<PolicyVersion>(db, 'portfolio_policy_versions', 'client_id', client.id, 'id,client_id,policy_id,revision,effective_on,validation_status,contract', 'id'),
        snapshot(premiumId, 'primas'), snapshot(expenseId, 'gastos'),
        scopedRows<RowLink>(db, 'portfolio_row_links', 'snapshot_id', premiumId, '*', 'row_index,policy_version_id,coverage'),
        scopedRows<RowLink>(db, 'portfolio_row_links', 'snapshot_id', expenseId, '*', 'row_index,policy_version_id,coverage'),
      ]);
      const input = { client, policy, policies, versions, snapshots: [premiums, expenses], links: [...premiumLinks, ...expenseLinks], reviews, ...selection };
      res.setHeader('X-Report-Scope', 'policy');
      if(req.path.endsWith('/analysis/export')){
        const month=req.query.month;
        if(month!==undefined&&(typeof month!=='string'||!selection.periods.includes(month)))throw new HttpError(400,'Mes de exportación fuera del alcance.');
        const analysis=await policyAnalysis(db,res.locals.auth.profile.id,input,'conclusions');
        const monthly=typeof month==='string'?await policyAnalysis(db,res.locals.auth.profile.id,{...input,periods:[month]},'monthly'):null;
        res.json({analysis,monthly,indicators:buildPolicyIndicators(input)});return;
      }
      if(req.path.endsWith('/analysis/monthly')||req.path.endsWith('/analysis/conclusions')){
        res.json(await policyAnalysis(db,res.locals.auth.profile.id,input,req.path.endsWith('/analysis/monthly')?'monthly':'conclusions',req.method==='POST'?req.body?.scenarios:undefined));return;
      }
      res.json({...(req.path.endsWith('/monthly') ? buildPolicyIndicators(input)
        : req.path.endsWith('/renewal-scenarios') ? buildRenewalScenarios(input, req.body?.scenarios)
        : resolvePolicyScope(input)),reviewStorageAvailable});
    })().catch(next);
  };
  router.get(['/:policyId/quality', '/:policyId/monthly', '/:policyId/reviews'], handle);
  router.post('/:policyId/renewal-scenarios', handle);
  router.post(['/:policyId/analysis/monthly','/:policyId/analysis/conclusions'],handle);
  // GET is read-only: cache revalidation or deterministic fallback, never provider generation.
  router.get(['/:policyId/analysis/monthly','/:policyId/analysis/conclusions','/:policyId/analysis/export'],handle);
  router.post('/:policyId/reviews',(req,res,next)=>{try{requireAdmin(res.locals.auth.profile);if(process.env.PORTFOLIO_ADMIN_ENABLED==='false')throw new HttpError(503,'Administración de cartera deshabilitada.');next();}catch(error){next(error);}},handle);
  return router;
}
