import type { PremiumRow, ExpenseRow } from './types.js';
import type { PolicyVersion, RowLink } from '../../shared/portfolio.js';
import { effectivePolicies, policyState, normalizeRut, validDate } from './contracts.js';
import { HttpError } from './supabase.js';
import { EXCLUDED_PRESTATIONS } from './report.js';
import type { TechnicalReview } from '../../shared/technicalReview.js';
import { reviewedCell } from './technicalReview.js';

export type ScopePolicy = { id: string; client_id: string; number_key: string; insurer_key: string };
export type ScopeSnapshot = { id: string; client_id: string; kind: 'primas' | 'gastos'; rows: (PremiumRow | ExpenseRow)[] };
export type ScopeInput = {
  client: { id: string; name: string; rut?: string | null }; policy: ScopePolicy; policies: ScopePolicy[];
  versions: PolicyVersion[]; snapshots: ScopeSnapshot[]; links: RowLink[];
  periods: string[]; coverages: string[];
  reviews?: TechnicalReview[];
};
const key = (value: string) => value.trim().toLowerCase();
const monthBounds = (period: string) => {
  const date = new Date(`${period}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0);
  return [`${period}-01`, date.toISOString().slice(0, 10)];
};
export function scopeSelection(periods: string[], coverages: string[]) {
  const months = [...new Set(periods)].sort();
  const covers = new Set(coverages);
  if (covers.delete('Consolidado S+D+C')) ['Salud', 'Dental', 'Catastrófico'].forEach(c => covers.add(c));
  if (!months.length || months.length > 120 || months.some(p => !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(p)) ||
    !covers.size || [...covers].some(c => !['Vida', 'Salud', 'Dental', 'Catastrófico'].includes(c))) {
    throw new HttpError(400, 'Selecciona períodos y coberturas válidos. Máximo 120 meses.');
  }
  return { periods: months, coverages: [...covers].sort() };
}

// Resolución conservadora: los datos mensuales no permiten separar endosos o vigencias parciales.
export function resolvePolicyScope(input: ScopeInput) {
  const selection = scopeSelection(input.periods, input.coverages);
  const { client, policy } = input;
  if (policy.client_id !== client.id || input.policies.some(p => p.client_id !== client.id) ||
    !input.policies.some(p => p.id === policy.id)) throw new HttpError(409, 'Identidad de póliza inconsistente.');
  if (input.snapshots.length !== 2 || new Set(input.snapshots.map(s => s.kind)).size !== 2 ||
    input.snapshots.some(s => s.client_id !== client.id || !Array.isArray(s.rows))) {
    throw new HttpError(409, 'Se requieren snapshots de primas y gastos de la misma empresa.');
  }
  const versions = input.versions.filter(v => v.policy_id === policy.id && v.client_id === client.id);
  const versionByPeriod = new Map<string, PolicyVersion>();
  const periodProblems = new Map<string, string>();
  for (const period of selection.periods) {
    const [start, end] = monthBounds(period);
    const a = effectivePolicies(versions, start)[0], b = effectivePolicies(versions, end)[0];
    if (!a || !b) periodProblems.set(period, 'no_validated_version');
    else if (a.id !== b.id) periodProblems.set(period, 'contract_changes_within_month');
    else if (!a.contract || typeof a.contract.number !== 'string' || typeof a.contract.insurer !== 'string' ||
      !validDate(a.contract.startsOn) || !validDate(a.contract.endsOn) ||
      !['active', 'cancelled', 'suspended'].includes(a.contract.status) ||
      (a.contract.status === 'cancelled' && !validDate(a.contract.cancellationDate)) ||
      !Array.isArray(a.contract.coverages) || a.contract.coverages.some(c => !c || typeof c.type !== 'string')) periodProblems.set(period, 'malformed_contract');
    else if (selection.coverages.some(type => a.contract.coverages.filter(c => c.type === type).length > 1)) periodProblems.set(period, 'ambiguous_contract_coverage');
    else if (key(a.contract.number) !== policy.number_key || key(a.contract.insurer) !== policy.insurer_key) periodProblems.set(period, 'contract_identity_conflict');
    else if (a.contract.currency !== 'UF') periodProblems.set(period, 'currency_not_comparable');
    else if (policyState(a.contract, start) !== 'active' || policyState(a.contract, end) !== 'active') periodProblems.set(period, 'partial_or_inactive_validity');
    else versionByPeriod.set(period, a);
  }
  const issues: Array<{ snapshotId: string; rowIndex: number; reason: string; unallocatedPercent: number }> = [];
  const counts: Record<string, number> = {};
  const affectedPeriods = new Set<string>();
  const periodReasons = new Map<string, Set<string>>();
  const included: Array<{ kind: 'primas' | 'gastos'; row: PremiumRow | ExpenseRow; percent: number; coverage: string; period: string; method: 'verified_link' | 'unique_number' }> = [];
  const indexed = new Map<string, RowLink[]>();
  for (const link of input.links) {
    const id = `${link.snapshot_id}:${link.row_index}`;
    indexed.set(id, [...(indexed.get(id) ?? []), link]);
  }
  let otherPolicyRows = 0;
  for (const snapshot of input.snapshots) for (const [rowIndex, row] of snapshot.rows.entries()) {
    if (!selection.periods.includes(row.period)) continue;
    const links = indexed.get(`${snapshot.id}:${rowIndex}`) ?? [];
    // A verified link may correct an inferred coverage; do not filter on the raw label first.
    if (!selection.coverages.includes(row.coverage) && !links.some(l => selection.coverages.includes(l.coverage))) continue;
    const issue = (reason: string, percent = 100) => {
      affectedPeriods.add(row.period);
      periodReasons.set(row.period, new Set([...(periodReasons.get(row.period) ?? []), reason]));
      counts[reason] = (counts[reason] ?? 0) + 1;
      if (issues.length < 200) issues.push({ snapshotId: snapshot.id, rowIndex, reason, unallocatedPercent: percent });
    };
    if (row.clientName !== client.name) { issue('row_company_conflict'); continue; }
    if (client.rut && (row as PremiumRow).clientRut) {
      try {
        if (normalizeRut((row as PremiumRow).clientRut!) !== client.rut) { issue('row_company_rut_conflict'); continue; }
      } catch { issue('invalid_company_rut'); continue; }
    }
    const amountValid = snapshot.kind === 'primas'
      ? Number.isFinite((row as PremiumRow).premiumUf) && Number.isFinite((row as PremiumRow).spendUf) && (row as PremiumRow).premiumUf >= 0
      : Number.isFinite((row as ExpenseRow).reembolsoUf);
    if (!amountValid) { issue('invalid_amount'); continue; }
    const rowNumber = key(row.policy ?? '');
    if (links.length) {
      const total = links.reduce((s, l) => s + Number(l.allocation_percent), 0);
      if (links.some(l => !Number.isFinite(Number(l.allocation_percent)) || Number(l.allocation_percent) <= 0) || total > 100 + 1e-8) {
        issue('invalid_allocation'); continue;
      }
      const targetLinks = links.filter(l => l.policy_id === policy.id && selection.coverages.includes(l.coverage));
      if (!targetLinks.length) { otherPolicyRows++; continue; }
      const version = versionByPeriod.get(row.period);
      if (!version) { issue(periodProblems.get(row.period)!); continue; }
      if (rowNumber && rowNumber !== policy.number_key) { issue('policy_number_conflict'); continue; }
      if (targetLinks.some(l => l.policy_version_id !== version.id || !version.contract.coverages.some(c => c.type === l.coverage))) {
        issue('link_version_or_coverage_conflict'); continue;
      }
      for (const link of targetLinks) included.push({ kind: snapshot.kind, row, percent: Number(link.allocation_percent), coverage: link.coverage, period: row.period, method: 'verified_link' });
      if (total < 100 - 1e-8) issue('partially_allocated', 100 - total);
    } else {
      if (!rowNumber) { issue('missing_policy_number'); continue; }
      const matches = input.policies.filter(p => p.number_key === rowNumber);
      if (matches.length !== 1) { issue(matches.length ? 'ambiguous_insurer' : 'unknown_policy_number'); continue; }
      if (matches[0].id !== policy.id) { otherPolicyRows++; continue; }
      const version = versionByPeriod.get(row.period);
      if (!version) { issue(periodProblems.get(row.period)!); continue; }
      if ((row as ExpenseRow).coverageInferred) { issue('inferred_coverage_without_link'); continue; }
      if (!version.contract.coverages.some(c => c.type === row.coverage)) { issue('coverage_not_contracted'); continue; }
      included.push({ kind: snapshot.kind, row, percent: 100, coverage: row.coverage, period: row.period, method: 'unique_number' });
    }
  }
  const monthly = selection.periods.map(period => {
    const version = versionByPeriod.get(period);
    const coverages = selection.coverages.map(coverage => {
      const items = included.filter(r => r.period === period && r.coverage === coverage);
      const p = items.filter(r => r.kind === 'primas'), e = items.filter(r => r.kind === 'gastos');
      const sum = (rs: typeof items, field: string) => rs.reduce((s, r) => s + Number((r.row as any)[field]) * r.percent / 100, 0);
      const premiumUf = p.length ? sum(p, 'premiumUf') : null;
      const technicalSpendUf = p.length ? sum(p, 'spendUf') : null;
      const reimbursementUf = e.length ? sum(e, 'reembolsoUf') : null;
      const analyzed = e.filter(r => (r.row as ExpenseRow).reembolsoUf > 0 && !EXCLUDED_PRESTATIONS.has((r.row as ExpenseRow).descCober));
      const analyzedUf = e.length ? sum(analyzed, 'reembolsoUf') : null;
      const differenceUf = technicalSpendUf === null || reimbursementUf === null ? null : technicalSpendUf - reimbursementUf;
      const contractualCoverage = version?.contract.coverages.find(c => c.type === coverage);
      const review = reviewedCell(input, period, coverage, version?.id ?? null,
        [...(periodReasons.get(period) ?? []), ...(periodProblems.has(period) ? [periodProblems.get(period)!] : []),
          ...(differenceUf !== null && Math.abs(differenceUf)>1e-8 ? ['reconciliation_difference'] : [])], !p.length || !e.length);
      return { ...review, coverage, contractualCoverageId: contractualCoverage?.id ?? null, contractualCoverageName: contractualCoverage?.name ?? coverage,
        contracted: !!contractualCoverage, premiumUf, technicalSpendUf,
        lossRatio: premiumUf !== null && premiumUf > 0 ? technicalSpendUf! / premiumUf : null,
        reimbursementUf, analyzedUf, excludedNetUf: reimbursementUf === null ? null : reimbursementUf - analyzedUf!,
        differenceUf, reconciliation: differenceUf === null ? 'unavailable' : Math.abs(differenceUf) <= 1e-8 ? 'matched' : 'difference',
        premiumRows: p.length, expenseRows: e.length, partialAllocation: items.some(r => r.percent !== 100),
        excludedExpenseAllocations: e.length - analyzed.length,
        negativeAdjustmentAllocations: e.filter(r => (r.row as ExpenseRow).reembolsoUf < 0).length,
        missingPremium: !p.length, missingExpenses: !e.length };
    });
    const full = coverages.every(c => c.premiumUf !== null && c.reimbursementUf !== null);
    return { period, versionId: version?.id ?? null, revision: version?.revision ?? null,
      validity: version ? { startsOn: version.contract.startsOn, endsOn: version.contract.endsOn, effectiveOn: version.effective_on } : null,
      problem: periodProblems.get(period) ?? null, coverages,
      isolationComplete: !!version && !affectedPeriods.has(period) && !coverages.some(c=>c.dataReviewBlocked),
      complete: full && !!version && !affectedPeriods.has(period) && !coverages.some(c=>c.dataReviewBlocked) };
  });
  return { client: { id: client.id, name: client.name }, policy: { id: policy.id, number: policy.number_key, insurer: policy.insurer_key },
    selection, snapshots: input.snapshots.map(s => ({ id: s.id, kind: s.kind })), monthly,
    quality: { complete: monthly.every(m => m.complete), issueCounts: counts, issues, issuesTruncated: Object.values(counts).reduce((a, b) => a + b, 0) > issues.length,
      includedAllocations: included.length, verifiedAllocations: included.filter(i => i.method === 'verified_link').length,
      uniqueNumberAllocations: included.filter(i => i.method === 'unique_number').length, otherPolicyRows,
      warnings: ['La ausencia de reembolsos no acredita gasto cero.', 'Los totales corresponden únicamente a filas resueltas; revisar incidencias y asignaciones parciales.',
        'La identidad por número requiere unicidad entre todas las pólizas de la empresa; no se infiere aseguradora desde el nombre del cliente.',
        'Las filas mensuales no permiten separar cambios contractuales dentro del mes.'] } };
}
