import { validateGroundedShape, type GroundedResult } from './analysisGrounding.js';
import { createHash } from 'node:crypto';
import type { ScopeInput } from './policyScope.js';
import type { ExpenseRow } from './types.js';
import { normalizeRut, isUuid } from './contracts.js';
import { buildPolicyIndicators } from './technicalIndicators.js';
import { buildRenewalScenarios } from './renewalScenarios.js';
import { HttpError } from './supabase.js';

export const PRIVACY_VERSION = 'privacy-v1';
export const CALCULATION_VERSION = 'calculation-v2';
export const MIN_GROUP_SIZE = 10;
const MAX_PATIENT_SHARE = .2;
export type AnalysisKind = 'monthly' | 'conclusions';
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(Object.is(value, -0) ? 0 : value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new HttpError(400, 'analysis_invalid_canonical_data');
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

// Las identidades solo viven en este cálculo local de umbral. Nunca se devuelven,
// registran, hashean individualmente ni se incluyen en el JSON para el proveedor.
function safeGroup(input: ScopeInput, period: string, coverage: string, version: string | null, linksByRow: Map<number, ScopeInput['links']>) {
  if (!version) return false;
  const snapshot = input.snapshots.find(s => s.kind === 'gastos');
  if (!snapshot) return false;
  const patients = new Map<string, number>();
  for (const [index, source] of snapshot.rows.entries()) {
    const row = source as ExpenseRow;
    if (row.period !== period || row.reembolsoUf <= 0) continue;
    const links = linksByRow.get(index) ?? [];
    const percentage = links.length
      ? links.filter(l => l.policy_id === input.policy.id && l.policy_version_id === version && l.coverage === coverage).reduce((s, l) => s + Number(l.allocation_percent), 0)
      : row.policy?.trim().toLowerCase() === input.policy.number_key && row.coverage === coverage ? 100 : 0;
    if (!percentage) continue;
    let identity: string | null;
    try { identity = normalizeRut(row.patientRut ?? ''); } catch { return false; }
    if (!identity) return false;
    patients.set(identity, (patients.get(identity) ?? 0) + row.reembolsoUf * percentage / 100);
  }
  const total = [...patients.values()].reduce((a, b) => a + b, 0);
  return patients.size >= MIN_GROUP_SIZE && total > 0 && [...patients.values()].every(v => v / total <= MAX_PATIENT_SHARE + 1e-12);
}

export type CacheIdentity = {
  ownerId: string; clientId: string; policyId: string; contractVersions: string[];
  periods: string[]; coverages: string[]; kind: AnalysisKind; model: string; promptVersion: string;
  indicatorsHash: string; assumptionsHash: string; calculationVersion: string; privacyVersion: string; cacheKey: string;
};
export function validateIdentity(identity: CacheIdentity) {
  if (![identity.ownerId, identity.clientId, identity.policyId, ...identity.contractVersions].every(isUuid) || !identity.contractVersions.length ||
    !['monthly', 'conclusions'].includes(identity.kind) || !/^gemini-[a-z0-9.-]{1,100}$/.test(identity.model) || !/^prompt-v\d{1,8}$/.test(identity.promptVersion) ||
    identity.calculationVersion !== CALCULATION_VERSION || identity.privacyVersion !== PRIVACY_VERSION ||
    ![identity.cacheKey, identity.indicatorsHash, identity.assumptionsHash].every(s => /^[0-9a-f]{64}$/.test(s))) throw new HttpError(400, 'analysis_invalid_identity');
  const { cacheKey, ...dimensions } = identity;
  if (fingerprint(dimensions) !== cacheKey) throw new HttpError(400, 'analysis_identity_hash_mismatch');
}

// Esta función acepta datos del repositorio autorizado, nunca un body de indicadores.
// Lista permitida construida campo a campo; sin spreads de contratos o reportes.
export function prepareAnalysis(input: ScopeInput, ownerId: string, kind: AnalysisKind, model: string, promptVersion: string, renewalConfigurations?: unknown) {
  const indicators = buildPolicyIndicators(input);
  if (kind === 'monthly' && indicators.scope.selection.periods.length !== 1) return { status: 'blocked' as const, reason: 'monthly_requires_one_period' };
  if (indicators.scope.monthly.some(m => !m.complete || m.coverages.some(c => c.reconciliation !== 'matched' || c.expenseBasis === 'undetermined' || !c.completenessConfirmed)) ||
    (kind === 'monthly' && indicators.monthly.some(m => !m.attribution.available))) return { status: 'blocked' as const, reason: 'unverified_or_unreconciled_scope' };
  const versions = new Set<string>();
  const linksByRow = new Map<number, ScopeInput['links']>();
  const expenseSnapshot = input.snapshots.find(s => s.kind === 'gastos');
  for (const link of input.links) if (link.snapshot_id === expenseSnapshot?.id) linksByRow.set(link.row_index, [...(linksByRow.get(link.row_index) ?? []), link]);
  for (const month of indicators.monthly) {
    if (month.currentVersionId) versions.add(month.currentVersionId);
    for (const coverage of month.coverages) {
      if (!safeGroup(input, month.period, coverage.type, month.currentVersionId, linksByRow)) return { status: 'blocked' as const, reason: 'privacy_threshold_not_met' };
      if (month.attribution.available) {
        if (month.previousVersionId) versions.add(month.previousVersionId);
        if (!safeGroup(input, month.referencePeriod, coverage.type, month.previousVersionId, linksByRow)) return { status: 'blocked' as const, reason: 'privacy_threshold_not_met' };
      }
    }
  }
  const months = indicators.monthly.map((m, index) => ({
    index,
    current: { premiumUf: m.current.premiumUf, technicalSpendUf: m.current.technicalSpendUf, lossRatio: m.current.lossRatio,
      reimbursementUf: m.current.reimbursementUf, differenceUf: m.current.differenceUf },
    previous: m.attribution.available ? { premiumUf: m.previous.premiumUf, technicalSpendUf: m.previous.technicalSpendUf, lossRatio: m.previous.lossRatio } : null,
    effects: m.attribution.available ? { lossRatioDeltaPp: m.comparison.lossRatioDeltaPp, spendEffectPp: m.comparison.spendEffectPp, premiumEffectPp: m.comparison.premiumEffectPp } : null,
    coverages: m.coverages.map(c => ({ type: c.type, expenseBasis: indicators.scope.monthly.find(month => month.period === m.period)?.coverages.find(item => item.coverage === c.type)?.expenseBasis ?? 'undetermined', currentSpendUf: c.currentSpendUf,
      previousSpendUf: m.attribution.available ? c.previousSpendUf : null, differenceUf: m.attribution.available ? c.differenceUf : null,
      variationPercent: m.attribution.available ? c.variationPercent : null, sharePercent: c.shareOfTechnicalSpendPercent,
      contributionPp: m.attribution.available ? c.contributionTotalPp : null })),
  }));
  let assumptions: unknown = null;
  let renewal: Array<{ projectedSpendUf: number; comparablePremiumUf: number; requiredPremiumUf: number; adjustmentPercent: number }> = [];
  if (kind === 'conclusions' && renewalConfigurations !== undefined) {
    const scenarios = buildRenewalScenarios(input, renewalConfigurations);
    if (scenarios.blockedReasons.length || scenarios.scenarios.some(s => s.status !== 'available')) return { status: 'blocked' as const, reason: 'renewal_assumptions_or_data_missing' };
    assumptions = scenarios.scenarios.map(s => {
      const a = s.assumptions!;
      return { configurationVersionHash: fingerprint(a.version), claimsBasis: a.claimsBasis, targetLossRatio: a.targetLossRatio, targetIncludesExpenses: a.targetIncludesExpenses,
        annualClaimTrend: a.annualClaimTrend, trendYears: a.trendYears, developmentFactor: a.developmentFactor, exposureFactor: a.exposureFactor,
        forecastMonths: a.forecastMonths, minimumObservedMonths: a.minimumObservedMonths, maintenanceBand: a.maintenanceBand };
    });
    renewal = scenarios.scenarios.map(s => ({ projectedSpendUf: s.result!.projectedSpendUf, comparablePremiumUf: s.result!.comparablePremiumUf,
      requiredPremiumUf: s.result!.requiredPremiumUf, adjustmentPercent: s.result!.adjustmentPercent }));
  }
  const payload = { schemaVersion: 'aggregate-v2', kind, months, renewal };
  const dimensions = { ownerId, clientId: input.client.id, policyId: input.policy.id, contractVersions: [...versions].sort(),
    periods: indicators.scope.selection.periods, coverages: indicators.scope.selection.coverages, kind, model, promptVersion,
    indicatorsHash: fingerprint({ payload, reviews: (input.reviews ?? []).map(r => ({ id:r.id,version:r.policy_version_id,period:r.period,coverage:r.coverage,
      kind:r.review_kind,decision:r.decision,basis:r.expense_basis,complete:r.data_complete })).sort((a,b)=>a.id-b.id),
      snapshots: [...indicators.scope.snapshots].sort((a,b) => a.kind.localeCompare(b.kind)), links: input.links.map(l => ({ snapshot: l.snapshot_id, row: l.row_index,
      policy: l.policy_id, version: l.policy_version_id, coverage: l.coverage, allocation: l.allocation_percent })).sort((a, b) => canonical(a).localeCompare(canonical(b))) }),
    assumptionsHash: fingerprint(assumptions), calculationVersion: CALCULATION_VERSION, privacyVersion: PRIVACY_VERSION };
  const identity: CacheIdentity = { ...dimensions, cacheKey: fingerprint(dimensions) };
  validateIdentity(identity);
  return { status: 'prepared' as const, payload, identity };
}

export const METRIC_REFS = ['premiumUf', 'technicalSpendUf', 'lossRatio', 'lossRatioDeltaPp', 'spendEffectPp', 'premiumEffectPp', 'reimbursementUf', 'differenceUf', 'renewalAdjustmentPercent'];
export type StoredAnalysis = { schemaVersion: 'analysis-result-v1'; kind: AnalysisKind;
  sections: Array<{ code: string; metricRefs: string[] }>; recommendations: string[] };
export function validateStoredAnalysis(value: unknown): asserts value is StoredAnalysis | GroundedResult {
  if ((value as GroundedResult)?.schemaVersion === 'analysis-result-v2') { validateGroundedShape(value); return; }
  const a = value as StoredAnalysis;
  const onlyKeys = (item: object, allowed: string[]) => Object.keys(item).every(k => allowed.includes(k));
  if (!a || typeof a !== 'object' || Array.isArray(a) || !onlyKeys(a, ['schemaVersion', 'kind', 'sections', 'recommendations']) ||
    a.schemaVersion !== 'analysis-result-v1' || !['monthly', 'conclusions'].includes(a.kind) || !Array.isArray(a.sections) || a.sections.length < 1 || a.sections.length > 3 ||
    !Array.isArray(a.recommendations) || a.recommendations.length > 3 || a.sections.some(s => !s || typeof s !== 'object' || !onlyKeys(s, ['code', 'metricRefs']) ||
      !['monthly_result', 'technical_result', 'renewal_projection', 'action_plan'].includes(s.code) || !Array.isArray(s.metricRefs) || s.metricRefs.length > 12 || s.metricRefs.some(r => !METRIC_REFS.includes(r))) ||
    a.recommendations.some(r => !['review_benefits', 'education', 'preferred_providers', 'pharmacy_agreements', 'bioequivalents'].includes(r))) throw new HttpError(400, 'analysis_unsafe_result');
}
