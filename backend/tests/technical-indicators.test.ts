import { test } from 'node:test';
import { verifiedReviews } from './helpers/technicalReviews.js';
import assert from 'node:assert/strict';
import { buildPolicyIndicators } from '../src/technicalIndicators.js';
import { buildRenewalScenarios, type RenewalAssumptions } from '../src/renewalScenarios.js';
import type { ScopeInput } from '../src/policyScope.js';
import type { PolicyContract, PolicyVersion } from '../../shared/portfolio.js';
import type { PremiumRow, ExpenseRow } from '../src/types.js';

function fixture(): ScopeInput {
  const policy = { id: 'p1', client_id: 'c1', number_key: '001', insurer_key: 'aseguradora' };
  const premiums = ['2026-01', '2026-02'].flatMap((period, month) => ['Salud', 'Dental'].map((coverage, cov) => ({
    clientName: 'Empresa', policy: '001', period, coverage, premiumUf: (month ? 80 : 100) * (cov ? .4 : .6),
    spendUf: (month ? 100 : 80) * (cov ? .25 : .75), clientRut: undefined,
  })));
  const expenses = premiums.map(p => ({ clientName: p.clientName, policy: p.policy, period: p.period, coverage: p.coverage,
    reembolsoUf: p.spendUf, descCober: 'CONSULTAS', provider: 'Prestador', insuredRut: 'no-exportar', patientRut: 'no-exportar',
    relation: '', isapre: '', valPrest: 0, valBonif: 0, mtoReclam: 0 }));
  const contract = { number: '001', insurer: 'Aseguradora', startsOn: '2026-01-01', endsOn: '2026-12-31',
    status: 'active', cancellationDate: '', currency: 'UF', coverages: ['Salud', 'Dental'].map(type => ({ id: type, type, name: `Colectivo ${type}` })) } as PolicyContract;
  const input:ScopeInput={ client: { id: 'c1', name: 'Empresa' }, policy, policies: [policy],
    versions: [{ id: 'v1', policy_id: 'p1', client_id: 'c1', revision: 1, effective_on: '2026-01-01', validation_status: 'validated', contract } as PolicyVersion],
    snapshots: [{ id: 'sp', client_id: 'c1', kind: 'primas', rows: premiums }, { id: 'se', client_id: 'c1', kind: 'gastos', rows: expenses }],
    links: [], periods: ['2026-02'], coverages: ['Salud', 'Dental'] };
  input.reviews=verifiedReviews(input);return input;
}
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const assumptions = (extra: Partial<RenewalAssumptions> = {}): RenewalAssumptions => ({
  name: 'Hipótesis sintética', version: 'test-1', source: 'Datos y supuestos sintéticos de prueba', claimsBasis: 'paid', dataCompletenessConfirmed: true,
  targetLossRatio: .8, targetIncludesExpenses: true, annualClaimTrend: 0, trendYears: 1, developmentFactor: 1,
  exposureFactor: 1, forecastMonths: 12, minimumObservedMonths: 2, maintenanceBand: .01, ...extra,
});
const renewalInput = () => ({ ...fixture(), periods: ['2026-01', '2026-02'] });

test('indicadores: cambio de prima/gasto, porcentajes, puntos y suma exacta por cobertura contractual', () => {
  const result = buildPolicyIndicators(fixture()), m = result.monthly[0];
  near(m.current.premiumUf, 80); near(m.previous.premiumUf, 100); near(m.current.technicalSpendUf, 100);
  near(m.current.lossRatio, 1.25); near(m.previous.lossRatio, .8);
  near(m.comparison.premium.difference, -20); near(m.comparison.premium.percent, -20);
  near(m.comparison.technicalSpend.percent, 25); near(m.comparison.lossRatioDeltaPp, 45);
  near(m.comparison.lossRatioVariationPercent, 56.25); near(m.comparison.spendEffectPp, 20);
  near(m.comparison.premiumEffectPp, 25); near(m.comparison.decompositionResidualPp, 0);
  assert.equal(m.attribution.available, true); assert.equal(m.referenceOutsideSelection, true);
  const health = m.coverages.find(c => c.type === 'Salud')!;
  near(health.currentSpendUf, 75); near(health.previousSpendUf, 60); near(health.differenceUf, 15);
  near(health.variationPercent, 25); near(health.shareOfTechnicalSpendPercent, 75);
  near(health.contributionSpendPp, 15); near(health.contributionPremiumPp, 18.75); near(health.contributionTotalPp, 33.75);
  near(m.coverages.reduce((s, c) => s + c.contributionTotalPp!, 0), 45);
  assert.equal(health.name, 'Colectivo Salud'); assert.ok(!JSON.stringify(result).includes('no-exportar'));
});
test('indicadores: gasto estable y caída de prima tienen efecto gasto cero', () => {
  const input = fixture();
  for (const r of input.snapshots[0].rows as PremiumRow[]) if (r.period === '2026-02') r.spendUf = r.coverage === 'Salud' ? 60 : 20;
  for (const r of input.snapshots[1].rows as ExpenseRow[]) if (r.period === '2026-02') r.reembolsoUf = r.coverage === 'Salud' ? 60 : 20;
  const m = buildPolicyIndicators(input).monthly[0]; near(m.comparison.spendEffectPp, 0); near(m.comparison.premiumEffectPp, 20); near(m.comparison.lossRatioDeltaPp, 20);
});
test('indicadores: pólizas ajenas no afectan indicadores; identidad ambigua bloquea valores íntegros', () => {
  const input = fixture(); input.policies.push({ ...input.policy, id: 'p2', number_key: '002' });
  for (const snapshot of input.snapshots) snapshot.rows.push(...snapshot.rows.map(r => ({ ...r, policy: '002' })));
  near(buildPolicyIndicators(input).monthly[0].current.technicalSpendUf, 100);
  input.policies[1].number_key = '001'; input.policies[1].insurer_key = 'otra';
  const result = buildPolicyIndicators(input); assert.equal(result.monthly[0].status, 'blocked');
  assert.equal(result.monthly[0].current.premiumUf, null); assert.equal(result.monthly[0].attribution.available, false);
});
test('indicadores: la asignación verificada a otra versión no entra; prorrateo sin completar bloquea el análisis', () => {
  const input = fixture(); input.links = [{ snapshot_id: 'sp', row_index: 2, policy_id: 'p1', policy_version_id: 'v1', coverage: 'Salud', allocation_percent: 50 }];
  assert.equal(buildPolicyIndicators(input).monthly[0].status, 'blocked');
  input.links[0].allocation_percent = 100; input.links[0].policy_version_id = 'otra-version';
  assert.equal(buildPolicyIndicators(input).monthly[0].status, 'blocked');
});
test('indicadores: mes calendario ausente no se sustituye por otro ni se considera cero', () => {
  const input = fixture(); input.snapshots.forEach(s => { s.rows = s.rows.filter(r => r.period !== '2026-01'); });
  const m = buildPolicyIndicators(input).monthly[0]; near(m.current.technicalSpendUf, 100);
  assert.equal(m.previous.technicalSpendUf, null); assert.equal(m.comparison.lossRatioDeltaPp, null); assert.equal(m.attribution.available, false);
});
test('indicadores: bases cero preservan diferencias absolutas y bloquean divisiones no definidas', () => {
  const input = fixture();
  for (const r of input.snapshots[0].rows as PremiumRow[]) if (r.period === '2026-01') { r.premiumUf = 0; r.spendUf = 0; }
  for (const r of input.snapshots[1].rows as ExpenseRow[]) if (r.period === '2026-01') r.reembolsoUf = 0;
  const m = buildPolicyIndicators(input).monthly[0]; near(m.comparison.premium.difference, 80);
  assert.equal(m.comparison.premium.percent, null); assert.equal(m.comparison.premium.percentUnavailableReason, 'nonpositive_base');
  near(m.comparison.technicalSpend.difference, 100); assert.equal(m.comparison.technicalSpend.percent, null);
  assert.equal(m.comparison.lossRatioDeltaPp, null); assert.equal(m.coverages[0].variationPercent, null);
  assert.equal(m.coverages[0].contributionSpendPp, null); assert.ok(!JSON.stringify(m).includes('Infinity'));
});
test('indicadores: conciliación por cobertura bloquea atribuciones aunque diferencias se compensen en el total', () => {
  const input = fixture(), rows = input.snapshots[1].rows as ExpenseRow[];
  rows[2].reembolsoUf += 10; rows[3].reembolsoUf -= 10;
  const m = buildPolicyIndicators(input).monthly[0]; near(m.current.differenceUf, 0);
  near(m.comparison.lossRatioDeltaPp, 45); assert.equal(m.attribution.available, false);
  assert.ok(m.attribution.reasons.includes('insufficient_reconciliation'));
  assert.ok(m.coverages.every(c => c.contributionTotalPp === null));
});
test('indicadores: exclusiones y ajustes se concilian firmados; no se presentan líneas como atenciones', () => {
  const input = fixture(), row = input.snapshots[1].rows[2] as ExpenseRow;
  row.reembolsoUf = 85; input.snapshots[1].rows.push({ ...row, reembolsoUf: -10 });
  const m = buildPolicyIndicators(input).monthly[0]; assert.equal(m.attribution.available, true);
  near(m.current.reimbursementUf, 100); near(m.current.analyzedUf, 110); near(m.current.excludedNetUf, -10);
  assert.ok(m.warnings.some(w => w.includes('excluye'))); assert.ok(m.warnings.some(w => w.includes('no representan atenciones')));
});
test('indicadores: período parcial, endoso interno y cobertura contractual duplicada se bloquean', () => {
  for (const modify of [
    (i: ScopeInput) => { i.versions[0].contract.endsOn = '2026-02-15'; },
    (i: ScopeInput) => { i.versions.push({ ...i.versions[0], id: 'v2', revision: 2, effective_on: '2026-02-15' }); },
    (i: ScopeInput) => { i.versions[0].contract.coverages.push({ ...i.versions[0].contract.coverages[0], id: 'salud2' }); },
  ]) { const input = fixture(); modify(input); assert.equal(buildPolicyIndicators(input).monthly[0].status, 'blocked'); }
});
test('indicadores: referencia de otra vigencia no se usa para explicar cambios', () => {
  const input = fixture(); input.versions.push({ ...input.versions[0], id: 'renovacion', revision: 2, effective_on: '2026-02-01', contract: { ...input.versions[0].contract, startsOn: '2026-02-01', endsOn: '2027-01-31' } });
  const m = buildPolicyIndicators(input).monthly[0]; near(m.current.premiumUf, 80);
  assert.equal(m.comparison.available, false); assert.ok(m.comparison.reasons.includes('contractual_scope_or_validity_changed'));
});
test('renovación: alza, mantención y descuento se derivan de supuestos explícitos verificables', () => {
  const output = buildRenewalScenarios(renewalInput(), [assumptions(), assumptions({ annualClaimTrend: -.2 }), assumptions({ annualClaimTrend: -.4 })]);
  assert.deepEqual(output.blockedReasons, []);
  const [increase, maintenance, discount] = output.scenarios;
  near(increase.result!.comparablePremiumUf, 1080); near(increase.result!.projectedSpendUf, 1080);
  near(increase.result!.requiredPremiumUf, 1350); near(increase.result!.adjustmentPercent, 25);
  assert.equal(increase.result!.direction, 'increase'); near(maintenance.result!.adjustmentPercent, 0);
  assert.equal(maintenance.result!.direction, 'maintenance'); near(discount.result!.adjustmentPercent, -25);
  assert.equal(discount.result!.direction, 'discount'); assert.match(output.notice, /No son ofertas/);
});
test('renovación: ningún supuesto esencial tiene tasa por defecto', () => {
  for (const field of Object.keys(assumptions())) {
    const a = { ...assumptions() } as Record<string, unknown>; delete a[field];
    const scenario = buildRenewalScenarios(renewalInput(), [a]).scenarios[0];
    assert.equal(scenario.status, 'blocked', field); assert.equal(scenario.result, null, field);
  }
  assert.ok(buildRenewalScenarios(renewalInput(), undefined).blockedReasons.includes('missing_scenarios'));
});
test('renovación: rechaza datos incompletos, selección parcial, vigencias mezcladas y falta de conciliación', () => {
  for (const modify of [
    (i: ScopeInput) => { i.periods = ['2026-02']; },
    (i: ScopeInput) => { i.periods.push('2026-04'); },
    (i: ScopeInput) => { i.coverages = ['Salud']; },
    (i: ScopeInput) => { (i.snapshots[1].rows[0] as ExpenseRow).reembolsoUf = 1; },
    (i: ScopeInput) => { i.versions[0].contract.endsOn = '2026-02-15'; },
    (i: ScopeInput) => { (i.snapshots[0].rows[0] as PremiumRow).policy = ''; },
    (i: ScopeInput) => { i.snapshots[1].rows = []; },
  ]) { const input = renewalInput(); modify(input); const s = buildRenewalScenarios(input, [assumptions()]).scenarios[0]; assert.equal(s.status, 'blocked'); assert.equal(s.result, null); }
});
test('renovación: valida dominios, mínimos observados, banda y resultados no finitos', () => {
  for (const change of [{ targetLossRatio: 0 }, { annualClaimTrend: -1 }, { forecastMonths: 0 }, { developmentFactor: 0 },
    { exposureFactor: -1 }, { maintenanceBand: -.1 }, { trendYears: NaN }, { minimumObservedMonths: 3 }, { annualClaimTrend: 1e300, trendYears: 100 }]) {
    assert.equal(buildRenewalScenarios(renewalInput(), [assumptions(change)]).scenarios[0].status, 'blocked', JSON.stringify(change));
  }
  assert.throws(() => buildRenewalScenarios(renewalInput(), Array(11).fill(assumptions())), /diez/);
  near(buildRenewalScenarios(renewalInput(), [assumptions({ developmentFactor: 1.1, exposureFactor: 2 })]).scenarios[0].result!.projectedSpendUf, 2376);
});
test('base del gasto: no se infiere pagado/incurrido desde reembolsos ni desde supuestos del navegador',()=>{
  const input=renewalInput();input.reviews=[];
  const result=buildPolicyIndicators(input);
  assert.equal(result.scope.monthly[0].coverages[0].expenseBasis,'undetermined');
  assert.equal(result.scope.monthly[0].coverages[0].qualityStatus,'pending_validation');
  assert.equal(result.monthly[0].attribution.available,false);
  const forecast=buildRenewalScenarios(input,[assumptions({claimsBasis:'incurred'})]);
  assert.equal(forecast.scenarios[0].status,'blocked');assert.ok(forecast.blockedReasons.includes('expense_basis_unverified_or_mixed'));
});
test('base incurrida exige evidencia del mismo alcance; una base supuesta diferente bloquea renovación',()=>{
  const input=renewalInput();for(const r of input.reviews!)if(r.review_kind==='expense_basis')r.expense_basis='incurred';
  assert.equal(buildRenewalScenarios(input,[assumptions({claimsBasis:'incurred'})]).scenarios[0].status,'available');
  assert.equal(buildRenewalScenarios(input,[assumptions({claimsBasis:'paid'})]).scenarios[0].status,'blocked');
  input.reviews!.forEach(r=>r.premium_snapshot_id='otra-carga');
  assert.equal(buildPolicyIndicators(input).scope.monthly[0].coverages[0].expenseBasis,'undetermined');
});
test('calidad por mes/cobertura: faltantes, errores parciales, ambiguos y revisiones no sobrescriben datos',()=>{
  const input=fixture();assert.equal(buildPolicyIndicators(input).scope.monthly[0].coverages[0].qualityStatus,'complete');
  input.snapshots[1].rows=input.snapshots[1].rows.filter(r=>r.period!=='2026-02'||r.coverage!=='Dental');
  const row=buildPolicyIndicators(input).scope.monthly[0].coverages.find(c=>c.coverage==='Dental')!;
  assert.equal(row.qualityStatus,'incomplete');assert.equal(row.reimbursementUf,null);
  const partial=fixture();partial.versions[0].contract.endsOn='2026-02-15';
  assert.equal(buildPolicyIndicators(partial).scope.monthly[0].coverages[0].qualityStatus,'partial');
  const ambiguous=fixture();ambiguous.versions[0].contract.coverages.push({...ambiguous.versions[0].contract.coverages[0]});
  assert.equal(buildPolicyIndicators(ambiguous).scope.monthly[0].coverages[0].qualityStatus,'ambiguous');
  const flagged=fixture();flagged.reviews!.push({...flagged.reviews![0],id:999,period:'2026-02',review_kind:'partial_month',decision:'pending'});
  const before=JSON.stringify(flagged.snapshots);assert.equal(buildPolicyIndicators(flagged).monthly[0].status,'blocked');assert.equal(JSON.stringify(flagged.snapshots),before);
});
