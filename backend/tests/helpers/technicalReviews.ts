import type { ScopeInput } from '../../src/policyScope.js';
import type { TechnicalReview } from '../../../shared/technicalReview.js';
export function verifiedReviews(input:ScopeInput):TechnicalReview[]{
  let id=0;const records:TechnicalReview[]=[];
  const premium=input.snapshots.find(s=>s.kind==='primas')!,expense=input.snapshots.find(s=>s.kind==='gastos')!;
  for(const period of new Set(premium.rows.map(r=>r.period)))for(const coverage of input.coverages)for(const kind of ['expense_basis','completeness'] as const){
    records.push({id:++id,client_id:input.client.id,policy_id:input.policy.id,policy_version_id:input.versions[0].id,premium_snapshot_id:premium.id,expense_snapshot_id:expense.id,
      period,coverage,review_kind:kind,decision:'validated',expense_basis:'paid',data_complete:kind==='completeness'?true:null,evidence:{documentId:'00000000-0000-4000-8000-000000000099',page:1,quote:'Respaldo sintético'},note:'Acreditación sintética para prueba',created_by:'00000000-0000-4000-8000-000000000001',created_at:'2026-01-01T00:00:00Z'});
  }
  return records;
}
