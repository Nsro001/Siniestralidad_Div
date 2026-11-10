import type { Evidence } from './portfolio';
export type ExpenseBasis = 'paid' | 'incurred' | 'undetermined';
export type QualityStatus = 'complete' | 'incomplete' | 'partial' | 'ambiguous' | 'pending_validation';
export type TechnicalReview = {
  id: number; client_id: string; policy_id: string; policy_version_id: string;
  premium_snapshot_id: string; expense_snapshot_id: string; period: string; coverage: string;
  review_kind: 'expense_basis' | 'completeness' | 'partial_month' | 'coverage_ambiguity' | 'allocation';
  decision: 'pending' | 'validated' | 'rejected'; expense_basis: ExpenseBasis; data_complete: boolean | null;
  evidence: Evidence | null; note: string; created_by: string; created_at: string;
};
