import { resolvePolicyScope, type ScopeInput } from './policyScope.js';
import { monthTotals, reconciled, previousMonth } from './technicalIndicators.js';
import { HttpError } from './supabase.js';

export type RenewalAssumptions = {
  name: string; version: string; source: string;
  claimsBasis: 'paid' | 'incurred'; dataCompletenessConfirmed: true;
  targetLossRatio: number; targetIncludesExpenses: true;
  annualClaimTrend: number; trendYears: number; developmentFactor: number;
  exposureFactor: number; forecastMonths: number; minimumObservedMonths: number; maintenanceBand: number;
};
function validate(value: unknown): { assumptions: RenewalAssumptions | null; reasons: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { assumptions: null, reasons: ['missing_assumptions'] };
  const a = value as Record<string, unknown>, reasons: string[] = [];
  for (const name of ['name', 'version', 'source']) if (typeof a[name] !== 'string' || !(a[name] as string).trim() || (a[name] as string).length > 1000) reasons.push(`missing_or_invalid_${name}`);
  const rules: Record<string, (v: number) => boolean> = {
    targetLossRatio: v => v > 0 && v <= 1, annualClaimTrend: v => v > -1, trendYears: v => v >= 0,
    developmentFactor: v => v > 0, exposureFactor: v => v > 0,
    forecastMonths: v => Number.isInteger(v) && v >= 1 && v <= 120,
    minimumObservedMonths: v => Number.isInteger(v) && v >= 1 && v <= 120,
    maintenanceBand: v => v >= 0 && v <= 1,
  };
  for (const [name, valid] of Object.entries(rules)) if (typeof a[name] !== 'number' || !Number.isFinite(a[name]) || !valid(a[name] as number)) reasons.push(`missing_or_invalid_${name}`);
  if (!['paid', 'incurred'].includes(String(a.claimsBasis))) reasons.push('missing_or_invalid_claimsBasis');
  if (a.dataCompletenessConfirmed !== true) reasons.push('data_completeness_not_confirmed');
  if (a.targetIncludesExpenses !== true) reasons.push('target_expense_basis_not_confirmed');
  // Reconstruir una lista permitida: no retornar propiedades arbitrarias enviadas por el cliente.
  const assumptions = reasons.length ? null : Object.fromEntries(['name', 'version', 'source', 'claimsBasis', 'dataCompletenessConfirmed', 'targetIncludesExpenses', ...Object.keys(rules)].map(k => [k, a[k]])) as RenewalAssumptions;
  return { assumptions, reasons };
}

export function buildRenewalScenarios(input: ScopeInput, configurations: unknown) {
  const scope = resolvePolicyScope(input);
  const globalReasons: string[] = [];
  const months = scope.monthly, first = months[0], last = months.at(-1)!;
  if (months.some(m => !m.complete)) globalReasons.push('incomplete_or_unresolved_data');
  if (months.some(m => m.coverages.some(c => !c.completenessConfirmed))) globalReasons.push('completeness_not_manually_verified');
  const bases = new Set(months.flatMap(m => m.coverages.map(c => c.expenseBasis)));
  if (bases.has('undetermined') || bases.size !== 1) globalReasons.push('expense_basis_unverified_or_mixed');
  if (months.some(m => !reconciled(m))) globalReasons.push('insufficient_reconciliation');
  if (months.some(m => m.coverages.some(c => c.technicalSpendUf !== null && c.technicalSpendUf < 0))) globalReasons.push('negative_technical_spend');
  if (months.some((m, i) => i > 0 && previousMonth(m.period) !== months[i - 1].period)) globalReasons.push('noncontiguous_observation');
  if (!first.validity || first.period !== first.validity.startsOn.slice(0, 7) || !first.validity.startsOn.endsWith('-01')) globalReasons.push('observation_does_not_start_at_contract_inception');
  if (months.some(m => !m.validity || m.validity.startsOn !== first.validity?.startsOn || m.validity.endsOn !== first.validity?.endsOn)) globalReasons.push('mixed_or_partial_validity');
  for (const month of months) {
    const version = input.versions.find(v => v.id === month.versionId);
    const expected = new Set(version?.contract.coverages.map(c => c.type) ?? []);
    if (!expected.size || expected.size !== scope.selection.coverages.length || scope.selection.coverages.some(c => !expected.has(c as any))) {
      globalReasons.push('incomplete_contractual_coverage_scope'); break;
    }
  }
  const totals = months.map(monthTotals);
  const premiumUf = totals.every(t => t.premiumUf !== null) ? totals.reduce((s, t) => s + t.premiumUf!, 0) : null;
  const technicalSpendUf = totals.every(t => t.technicalSpendUf !== null) ? totals.reduce((s, t) => s + t.technicalSpendUf!, 0) : null;
  if (premiumUf === null || premiumUf <= 0) globalReasons.push('nonpositive_or_missing_premium');
  if (technicalSpendUf === null || technicalSpendUf < 0) globalReasons.push('invalid_or_missing_technical_spend');
  if (!Array.isArray(configurations) || !configurations.length) globalReasons.push('missing_scenarios');
  if (Array.isArray(configurations) && configurations.length > 10) throw new HttpError(400, 'Máximo diez escenarios técnicos por solicitud.');
  const scenarios = (Array.isArray(configurations) ? configurations : []).map((configuration: unknown) => {
    const { assumptions, reasons: configurationReasons } = validate(configuration);
    const reasons = [...new Set([...globalReasons, ...configurationReasons])];
    if (assumptions && !bases.has(assumptions.claimsBasis)) reasons.push('assumed_claims_basis_differs_from_evidence');
    if (assumptions && months.length < assumptions.minimumObservedMonths) reasons.push('insufficient_observed_months');
    if (reasons.length || !assumptions) return { status: 'blocked' as const, reasons, assumptions, result: null };
    const a = assumptions;
    const trendFactor = (1 + a.annualClaimTrend) ** a.trendYears;
    const projectedSpendUf = technicalSpendUf! / months.length * a.forecastMonths * a.developmentFactor * a.exposureFactor * trendFactor;
    const comparablePremiumUf = premiumUf! / months.length * a.forecastMonths * a.exposureFactor;
    const requiredPremiumUf = projectedSpendUf / a.targetLossRatio;
    const adjustmentRatio = requiredPremiumUf / comparablePremiumUf - 1;
    if (![trendFactor, projectedSpendUf, comparablePremiumUf, requiredPremiumUf, adjustmentRatio].every(Number.isFinite) || comparablePremiumUf <= 0) {
      return { status: 'blocked' as const, reasons: ['nonfinite_projection'], assumptions: a, result: null };
    }
    const direction = Math.abs(adjustmentRatio) <= a.maintenanceBand + 1e-12 ? 'maintenance' : adjustmentRatio > 0 ? 'increase' : 'discount';
    return { status: 'available' as const, reasons: [], assumptions: a,
      result: { trendFactor, projectedSpendUf, comparablePremiumUf, requiredPremiumUf, adjustmentPercent: adjustmentRatio * 100,
        direction, maintenanceBandPercent: a.maintenanceBand * 100, observedLossRatio: technicalSpendUf! / premiumUf!,
        projectedLossRatioAtComparablePremium: projectedSpendUf / comparablePremiumUf } };
  });
  return { scope, observations: { from: first.period, through: last.period, months: months.length, premiumUf, technicalSpendUf },
    blockedReasons: [...new Set(globalReasons)], scenarios,
    formulas: { projectedSpend: 'G observado / meses observados × meses proyectados × desarrollo × exposición × (1 + tendencia anual)^años de tendencia',
      comparablePremium: 'P observada / meses observados × meses proyectados × exposición', requiredPremium: 'G proyectado / siniestralidad objetivo',
      adjustmentPercent: '(Prima requerida / prima comparable − 1) × 100' },
    notice: 'Escenarios técnicos internos según supuestos proporcionados, sin tasas predeterminadas. No son ofertas ni compromisos de aseguradoras. La confirmación de completitud es declarada por el solicitante.' };
}
