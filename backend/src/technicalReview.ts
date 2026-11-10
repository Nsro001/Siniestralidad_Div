import type { ScopeInput } from './policyScope.js';
import type { TechnicalReview, QualityStatus, ExpenseBasis } from '../../shared/technicalReview.js';
export function reviewedCell(input: ScopeInput, period: string, coverage: string, versionId: string | null, reasons: string[], missing: boolean) {
  const premium = input.snapshots.find(s => s.kind === 'primas')?.id, expense = input.snapshots.find(s => s.kind === 'gastos')?.id;
  const records = (input.reviews ?? []).filter(r => r.policy_id === input.policy.id && r.client_id === input.client.id &&
    r.policy_version_id === versionId && r.premium_snapshot_id === premium && r.expense_snapshot_id === expense && r.period === period && r.coverage === coverage);
  const latest = (kind: TechnicalReview['review_kind']) => records.filter(r => r.review_kind === kind).sort((a,b) => b.id-a.id)[0];
  const basisReview = latest('expense_basis'), completeness = latest('completeness');
  const expenseBasis: ExpenseBasis = basisReview?.decision === 'validated' ? basisReview.expense_basis : 'undetermined';
  const completenessConfirmed = completeness?.decision === 'validated' && completeness.data_complete === true;
  const incomplete = completeness?.decision === 'validated' && completeness.data_complete === false;
  const flagged = (kind:TechnicalReview['review_kind']) => { const r=latest(kind);return !!r&&r.decision!=='validated'; };
  const ambiguous = reasons.some(r => /ambiguous|conflict|inferred_coverage|unknown_policy|missing_policy/.test(r)) || flagged('coverage_ambiguity');
  const partial = reasons.some(r => /partial|within_month/.test(r)) || flagged('partial_month');
  const dataReviewBlocked=flagged('partial_month')||flagged('coverage_ambiguity')||flagged('allocation');
  const pendingVersion = reasons.some(r => /no_validated_version|malformed_contract/.test(r));
  const qualityStatus: QualityStatus = ambiguous ? 'ambiguous' : partial ? 'partial' : pendingVersion ? 'pending_validation' : missing || incomplete ? 'incomplete'
    : reasons.length || dataReviewBlocked || expenseBasis === 'undetermined' || !completenessConfirmed ? 'pending_validation' : 'complete';
  return { qualityStatus, expenseBasis, completenessConfirmed, dataReviewBlocked, basisReviewId: basisReview?.id ?? null, completenessReviewId: completeness?.id ?? null };
}
