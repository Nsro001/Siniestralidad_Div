import type { PremiumRow, ExpenseRow } from './types.js';
import type { ExecutiveConclusion } from '../../shared/executive.js';
import { buildGastosReport } from './report.js';
const COV = ['Salud', 'Dental', 'Catastrófico'];
const CONS = 'Consolidado S+D+C';
// Parámetros de seguimiento descriptivo; no son tarifas ni probabilidades actuariales.
export const CONCLUSION_RULES = { equilibrium: 75, nearBand: 2, trendPoints: 2, prestationShare: 30, providerShare: 20, insuredShare: 20 };
const index = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const period = (n: number) => `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`;
export function validity(available: string[], selected: string[]) {
  const valid = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
  const all = [...new Set(available.filter(valid))].sort();
  const chosen = [...new Set(selected.filter(valid))].sort();
  if (!all.length || !chosen.length || chosen[0] < all[0]) return null;
  const end = index(chosen[chosen.length - 1]);
  const anchor = index(all[0]);
  const cycle = anchor + Math.floor((end - anchor) / 12) * 12;
  const first = all.find(p => index(p) >= cycle && index(p) <= end);
  if (!first) return null;
  return { start: first, month: end - index(first) + 1, cycleStart: period(cycle), mixed: chosen[0] < period(cycle) };
}
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });
export function buildConclusion(premiums: PremiumRow[], expenses: ExpenseRow[], client: string, coverages: string, periods: string): ExecutiveConclusion {
  const selected = [...new Set(periods.split(',').filter(p => /^\d{4}-(0[1-9]|1[0-2])$/.test(p)))].sort();
  const own = premiums.filter(r => r.clientName === client && COV.includes(r.coverage));
  const v = validity(own.map(r => r.period), selected);
  const requested = coverages.split(',').filter(Boolean);
  const consolidated = requested.includes(CONS) || COV.every(c => requested.includes(c));
  const scope = consolidated ? COV : requested;
  const rows = premiums.filter(r => r.clientName === client && scope.includes(r.coverage) && selected.includes(r.period));
  const totals = (rs: PremiumRow[]) => ({ premium: rs.reduce((s,r) => s+r.premiumUf,0), spend: rs.reduce((s,r) => s+r.spendUf,0) });
  const sum = totals(rows);
  const ratio = sum.premium > 0 ? sum.spend / sum.premium * 100 : null;
  const notes = ['Vigencia estimada por aniversario del primer período de primas disponible; no acredita el inicio contractual.', 'Focos de gasto calculados sobre reembolsos positivos y las exclusiones de la distribución; pueden diferir del gasto de primas.'];
  const contiguous = selected.length > 0 && index(selected[selected.length-1]) - index(selected[0]) + 1 === selected.length;
  const monthly = selected.map(p => ({ period: p, ...totals(rows.filter(r => r.period === p)) }));
  const complete = monthly.length > 0 && monthly.every(m => m.premium > 0 && m.spend >= 0 && Number.isFinite(m.premium) && Number.isFinite(m.spend));
  const scopeCoverages = [...new Set(rows.map(r => r.coverage))];
  const coverageComplete = selected.every(p => scopeCoverages.every(c => rows.some(r => r.period === p && r.coverage === c)));
  if (!coverageComplete) notes.push('Faltan registros mensuales de una o más coberturas: no se evalúa equilibrio.');
  const fullValidity = !!v && !v.mixed && contiguous && selected[0] === v.start && complete && coverageComplete;
  if (!complete) notes.push('Faltan meses con prima positiva o hay importes no válidos; no se concluye equilibrio.');
  if (v?.mixed) notes.push('La selección abarca más de una vigencia: no corresponde evaluar equilibrio de renovación.');
  if (!contiguous || (v && selected[0] !== v.start)) notes.push('La selección no cubre de forma continua la vigencia hasta el corte.');
  if (!consolidated) notes.push('Análisis de coberturas seleccionadas: el equilibrio de renovación requiere el consolidado Salud + Dental + Catastrófico.');
  const availableCov = new Set(own.filter(r => selected.includes(r.period)).map(r => r.coverage));
  const missingCov = COV.filter(c => !availableCov.has(c));
  if (consolidated && missingCov.length) notes.push(`Sin registros de ${missingCov.join(', ')}; confirmar si corresponde a cobertura no contratada o información faltante.`);
  let trend = 'Datos insuficientes para establecer tendencia: se requieren al menos cuatro meses consecutivos con prima positiva.';
  let delta: number | null = null;
  if (complete && coverageComplete && contiguous && monthly.length >= 4) {
    const n = Math.min(3, Math.floor(monthly.length / 2));
    const recent = monthly.slice(-n), previous = monthly.slice(-2*n, -n);
    const aggregate = (ms: typeof monthly) => ms.reduce((s,m) => ({premium:s.premium+m.premium,spend:s.spend+m.spend}),{premium:0,spend:0});
    const a = aggregate(previous), b = aggregate(recent);
    delta = b.spend / b.premium * 100 - a.spend / a.premium * 100;
    trend = `Últimos ${n} meses (${recent[0].period} a ${recent[n-1].period}) frente a los ${n} anteriores: siniestralidad de ${fmt(a.spend/a.premium*100)}% a ${fmt(b.spend/b.premium*100)}% (${fmt(delta)} puntos porcentuales); prima de ${fmt(a.premium)} a ${fmt(b.premium)} UF y gasto de ${fmt(a.spend)} a ${fmt(b.spend)} UF.`;
  }
  const gastos = buildGastosReport(expenses, client, coverages, periods);
  if (gastos.comparison.missingCurrentPeriods.length) notes.push(`Sin registros de gastos en: ${gastos.comparison.missingCurrentPeriods.join(', ')}. La ausencia de registros no confirma gasto cero.`);
  const focuses: string[] = [];
  const recommendations = ['Mantener seguimiento mensual de prima, gasto y siniestralidad.'];
  let concentration = false;
  if (gastos.totalUf > 0) {
    const prestation = gastos.rows.find(r => r.totalUf > 0);
    if (prestation) { focuses.push(`${prestation.prestation} aporta ${fmt(prestation.totalUf)} UF (${fmt(prestation.percent)}% del gasto analizado).`); if (prestation.percent >= CONCLUSION_RULES.prestationShare) { concentration = true; recommendations.push(`Revisar la evolución de ${prestation.prestation}.`); } }
    const provider = gastos.topProviders.find(r => r.provider.trim() && !r.provider.startsWith('(Sin'));
    if (provider) { const share = provider.totalUf/gastos.totalUf*100; focuses.push(`Principal prestador identificado: ${provider.provider}, ${fmt(provider.totalUf)} UF (${fmt(share)}%).`); if (share >= CONCLUSION_RULES.providerShare) { concentration = true; recommendations.push(`Monitorear el gasto en ${provider.provider}, sin atribuir causas con estos datos.`); } }
    else focuses.push('Sin identificación suficiente de prestadores.');
    const insured = gastos.topInsured.filter(r => r.insuredRut.trim() && !r.insuredRut.startsWith('(Sin')).slice(0,3);
    if (insured.length) { const share = insured.reduce((s,r) => s+r.totalUf,0)/gastos.totalUf*100; focuses.push(`Los ${insured.length} asegurados identificados de mayor gasto agrupan ${fmt(share)}% (agrupación por RUT asegurado, no necesariamente por paciente).`); if (share >= CONCLUSION_RULES.insuredShare) { concentration = true; recommendations.push('Revisar los casos de mayor gasto con el equipo responsable y preparar acciones preventivas.'); } }
    else focuses.push('Sin identificación suficiente de asegurados de mayor gasto.');
    const growth = gastos.rows.filter(r => r.variationPercent != null && r.variationPercent > 2).slice(0,2);
    if (gastos.comparison.complete) for (const g of growth) focuses.push(`${g.prestation}: gasto ${fmt(g.variationPercent!)}% mayor que en el mismo período del año anterior (${fmt(g.previousTotalUf!)} a ${fmt(g.totalUf)} UF).`);
    else focuses.push('Historia insuficiente para comparar el gasto con el mismo período anterior completo.');
    if (growth.length) recommendations.push(`Seguir la evolución de ${growth.map(g=>g.prestation).join(' y ')}.`);
  } else focuses.push('No hay gasto positivo analizable; no permite inferir ausencia de riesgo.');
  const eligible = !!v && v.month >= 10 && fullValidity && consolidated && !missingCov.length && ratio !== null;
  let risk = delta === null ? 'Riesgo no concluyente por historia insuficiente.' : delta > CONCLUSION_RULES.trendPoints ? 'Riesgo creciente: aumenta la siniestralidad reciente.' : 'Sin aumento relevante de siniestralidad reciente; mantener seguimiento preventivo.';
  if (concentration) risk += ' Existe concentración relevante de gasto que requiere seguimiento.';
  if (eligible && ratio! >= CONCLUSION_RULES.equilibrium - CONCLUSION_RULES.nearBand) risk += ' Existe presión sobre el equilibrio de renovación.';
  const sections = [
    { title: 'Estado general', text: `${consolidated ? 'Consolidado Salud + Dental + Catastrófico' : scope.join(' + ')}: ${ratio === null ? 'sin prima suficiente para calcular siniestralidad' : `siniestralidad observada ${fmt(ratio)}%`}; prima ${fmt(sum.premium)} UF y gasto ${fmt(sum.spend)} UF. ${v ? `Mes ${v.month} estimado al corte, desde ${v.start}.` : 'No se pudo determinar el mes de vigencia.'}` },
    { title: 'Tendencia', text: trend },
    { title: 'Principales focos de gasto', text: focuses.join(' ') },
    { title: 'Nivel de riesgo', text: risk },
    { title: 'Recomendaciones de gestión', text: recommendations.join(' ') },
  ];
  if (eligible) sections.push({ title: 'Consideraciones para renovación', text: ratio! < CONCLUSION_RULES.equilibrium - CONCLUSION_RULES.nearBand
    ? 'La experiencia se encuentra bajo la referencia de equilibrio de 75% definida para mantener precios, sujeta a la evolución de los meses restantes. No constituye garantía de tarifa.'
    : ratio! <= CONCLUSION_RULES.equilibrium + CONCLUSION_RULES.nearBand ? 'La experiencia está cercana a la referencia de equilibrio de 75% (banda de seguimiento 73%–77%); existe presión sobre el equilibrio y debe monitorearse de cara a la renovación.'
    : 'La experiencia está por sobre la referencia de equilibrio de 75%; debe analizarse en la preparación de la renovación y negociación, sin inferir un ajuste de precio específico.' });
  return { month: v?.month ?? null, validityStart: v?.start ?? null, notes, sections };
}
