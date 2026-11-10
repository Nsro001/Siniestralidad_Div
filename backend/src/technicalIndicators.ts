import { resolvePolicyScope, scopeSelection, type ScopeInput } from './policyScope.js';

export const NUMERIC_TOLERANCE_UF = 1e-8;
export type VerifiedScope = ReturnType<typeof resolvePolicyScope>;
export type VerifiedMonth = VerifiedScope['monthly'][number];
export function previousMonth(period: string) {
  const date = new Date(`${period}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
export function change(current: number | null, previous: number | null) {
  const difference = current === null || previous === null ? null : current - previous;
  return { difference, percent: difference === null || previous === null || previous <= 0 ? null : difference / previous * 100,
    percentUnavailableReason: difference === null ? 'missing_data' : previous! <= 0 ? 'nonpositive_base' : null };
}
export function monthTotals(month: VerifiedMonth | undefined) {
  const usable = !!month?.isolationComplete && month.coverages.every(c => c.contracted && c.premiumUf !== null && c.technicalSpendUf !== null);
  const premiumUf = usable ? month!.coverages.reduce((s, c) => s + c.premiumUf!, 0) : null;
  const technicalSpendUf = usable ? month!.coverages.reduce((s, c) => s + c.technicalSpendUf!, 0) : null;
  const expenseUsable = !!month?.isolationComplete && month.coverages.every(c => c.contracted && c.reimbursementUf !== null);
  const reimbursementUf = expenseUsable ? month!.coverages.reduce((s, c) => s + c.reimbursementUf!, 0) : null;
  const analyzedUf = expenseUsable ? month!.coverages.reduce((s, c) => s + c.analyzedUf!, 0) : null;
  return { premiumUf, technicalSpendUf, lossRatio: premiumUf !== null && premiumUf > 0 ? technicalSpendUf! / premiumUf : null,
    reimbursementUf, analyzedUf, excludedNetUf: reimbursementUf === null ? null : reimbursementUf - analyzedUf!,
    differenceUf: technicalSpendUf === null || reimbursementUf === null ? null : technicalSpendUf - reimbursementUf };
}
export function reconciled(month: VerifiedMonth | undefined) {
  return !!month?.complete && month.coverages.every(c => c.reconciliation === 'matched');
}
function comparableValidity(current: VerifiedMonth, previous: VerifiedMonth | undefined) {
  return !!current.validity && !!previous?.validity && current.validity.startsOn === previous.validity.startsOn && current.validity.endsOn === previous.validity.endsOn &&
    current.coverages.every(c => {
      const old = previous.coverages.find(p => p.coverage === c.coverage);
      return old?.contracted && c.contracted && old.contractualCoverageId === c.contractualCoverageId && old.contractualCoverageName === c.contractualCoverageName;
    });
}

// No acepta indicadores del navegador: siempre resuelve snapshots/contratos con el motor de etapa 1.
export function buildPolicyIndicators(input: ScopeInput) {
  const selection = scopeSelection(input.periods, input.coverages);
  const scope = resolvePolicyScope(input);
  const referencePeriods = [...new Set(selection.periods.map(previousMonth))].filter(p => /^(19|20|21)\d{2}-/.test(p));
  const referenceScope = referencePeriods.length ? resolvePolicyScope({ ...input, periods: referencePeriods }) : null;
  const monthly = scope.monthly.map(current => {
    const referencePeriod = previousMonth(current.period);
    const previous = referenceScope?.monthly.find(m => m.period === referencePeriod);
    const now = monthTotals(current), before = monthTotals(previous);
    const reasons: string[] = [];
    if (!current.isolationComplete) reasons.push('current_scope_unresolved');
    if (!previous?.isolationComplete) reasons.push('previous_scope_unresolved');
    if (now.premiumUf === null || before.premiumUf === null) reasons.push('missing_premiums');
    if (!comparableValidity(current, previous)) reasons.push('contractual_scope_or_validity_changed');
    const amountComparisonAvailable = reasons.length === 0;
    if ((now.premiumUf !== null && now.premiumUf <= 0) || (before.premiumUf !== null && before.premiumUf <= 0)) reasons.push('nonpositive_premium');
    const comparisonAvailable = reasons.length === 0;
    const attributionReasons = [...reasons];
    if (new Set([...current.coverages,...(previous?.coverages??[])].map(c=>c.expenseBasis)).size!==1 || [...current.coverages, ...(previous?.coverages ?? [])].some(c => c.expenseBasis === 'undetermined') ||
      current.coverages.some(c => c.expenseBasis !== previous?.coverages.find(p => p.coverage === c.coverage)?.expenseBasis)) attributionReasons.push('expense_basis_unverified_or_changed');
    if([...current.coverages,...(previous?.coverages??[])].some(c=>!c.completenessConfirmed))attributionReasons.push('completeness_not_manually_verified');
    if (!reconciled(current) || !reconciled(previous)) attributionReasons.push('insufficient_reconciliation');
    if ([...current.coverages, ...(previous?.coverages ?? [])].some(c => c.technicalSpendUf !== null && c.technicalSpendUf < 0)) attributionReasons.push('negative_technical_spend');
    const attributionAvailable = attributionReasons.length === 0;
    const lossRatioChange = comparisonAvailable ? change(now.lossRatio, before.lossRatio) : change(null, null);
    const deltaPp = lossRatioChange.difference === null ? null : lossRatioChange.difference * 100;
    // Camino explícito: primero cambia el gasto manteniendo P0; luego cambia P0 a P1 con G1.
    const spendEffectPp = comparisonAvailable ? (now.technicalSpendUf! - before.technicalSpendUf!) / before.premiumUf! * 100 : null;
    const premiumEffectPp = comparisonAvailable ? now.technicalSpendUf! * (1 / now.premiumUf! - 1 / before.premiumUf!) * 100 : null;
    const coverages = current.coverages.map(c => {
      const old = previous?.coverages.find(p => p.coverage === c.coverage);
      const currentSpendUf = current.isolationComplete ? c.technicalSpendUf : null;
      const previousSpendUf = previous?.isolationComplete ? old?.technicalSpendUf ?? null : null;
      const spendChange = amountComparisonAvailable ? change(currentSpendUf, previousSpendUf) : change(null, null);
      const contributionSpendPp = attributionAvailable ? (currentSpendUf! - previousSpendUf!) / before.premiumUf! * 100 : null;
      const contributionPremiumPp = attributionAvailable ? currentSpendUf! * (1 / now.premiumUf! - 1 / before.premiumUf!) * 100 : null;
      const shareUsable = now.technicalSpendUf !== null && now.technicalSpendUf > 0 && current.coverages.every(r => r.technicalSpendUf !== null && r.technicalSpendUf >= 0);
      return { type: c.coverage, contractualCoverageId: c.contractualCoverageId, name: c.contractualCoverageName,
        previousExpenseBasis:old?.expenseBasis??'undetermined',
        currentSpendUf, previousSpendUf, differenceUf: spendChange.difference, variationPercent: spendChange.percent,
        variationUnavailableReason: spendChange.percentUnavailableReason,
        shareOfTechnicalSpendPercent: shareUsable ? currentSpendUf! / now.technicalSpendUf! * 100 : null,
        contributionSpendPp, contributionPremiumPp,
        contributionTotalPp: contributionSpendPp === null ? null : contributionSpendPp + contributionPremiumPp!,
        reconciliation: { current: c.reconciliation, previous: old?.reconciliation ?? 'unavailable', currentDifferenceUf: c.differenceUf,
          previousDifferenceUf: old?.differenceUf ?? null, currentExcludedNetUf: c.excludedNetUf, previousExcludedNetUf: old?.excludedNetUf ?? null } };
    });
    return { period: current.period, referencePeriod, referenceOutsideSelection: !selection.periods.includes(referencePeriod),
      status: now.premiumUf === null ? 'blocked' : 'available', current: now, previous: before,
      currentVersionId: current.versionId, previousVersionId: previous?.versionId ?? null,
      comparison: { available: comparisonAvailable, reasons,
        premium: amountComparisonAvailable ? change(now.premiumUf, before.premiumUf) : change(null, null),
        technicalSpend: amountComparisonAvailable ? change(now.technicalSpendUf, before.technicalSpendUf) : change(null, null),
        lossRatioDeltaPp: deltaPp, lossRatioVariationPercent: lossRatioChange.percent, spendEffectPp, premiumEffectPp,
        decompositionResidualPp: deltaPp === null ? null : deltaPp - spendEffectPp! - premiumEffectPp! },
      attribution: { available: attributionAvailable, reasons: attributionReasons }, coverages,
      warnings: [!current.complete || !previous?.complete ? 'Hay fuentes ausentes o filas sin resolver; ausencia de filas no significa cero.' : '',
        current.coverages.some(c => c.expenseBasis === 'undetermined') ? 'Base del gasto no determinada: los reembolsos no acreditan siniestros incurridos. No proyectar renovación sin evidencia.' : '',
        !reconciled(current) || !reconciled(previous) ? 'Conciliación insuficiente: no atribuir la variación a coberturas o prestaciones.' : '',
        [...current.coverages, ...(previous?.coverages ?? [])].some(c => c.excludedExpenseAllocations > 0) ? 'El detalle analizado excluye prestaciones o ajustes; el reembolso neto incluye esos movimientos.' : '',
        'Los conteos de líneas de reembolso no representan atenciones ni siniestros únicos.'].filter(Boolean) };
  });
  return { scope, referenceQuality: referenceScope?.quality ?? null, monthly,
    units: { amounts: 'UF', lossRatio: 'ratio', relativeChanges: 'percent', effects: 'percentage_points' },
    decompositionMethod: 'Gasto primero a prima anterior; prima después con gasto actual. La suma es exactamente el cambio de siniestralidad.' };
}
