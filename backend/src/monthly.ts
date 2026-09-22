import type { MonthlyDetail } from "../../shared/monthly.js";
import type { PremiumRow, ExpenseRow } from "./types.js";
import { EXCLUDED_PRESTATIONS } from "./report.js";
const normalize = (text: string) => text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
// Clasificación explícita; no se infiere hospitalización a partir del importe.
const HOSPITAL = new Set(["HOSPITALIZACION", "GASTOS HOSPITALARIOS", "HOSPITALARIOS"]);
const sum = <T>(rows: T[], amount: (row: T) => number) => rows.reduce((total, row) => total + amount(row), 0);
const identity = (row: ExpenseRow) => row.patientRut && !row.patientRut.startsWith("(Sin ") ? row.patientRut.replace(/[.\s-]/g, "").toUpperCase() : null;
export function buildMonthlyDetail(premiums: PremiumRow[], expenses: ExpenseRow[], client: string, coverage: string, period: string): MonthlyDetail {
  const coverages = coverage === "Consolidado S+D+C" ? ["Salud", "Dental", "Catastrófico"] : [coverage];
  const p = premiums.filter(row => row.clientName === client && coverages.includes(row.coverage));
  const e = expenses.filter(row => row.clientName === client && coverages.includes(row.coverage));
  const previous = [3, 2, 1].map(offset => {
    const date = new Date(`${period}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - offset);
    return date.toISOString().slice(0, 7);
  });
  const baselinePeriods = previous.filter(month => p.some(row => row.period === month) && e.some(row => row.period === month));
  const eligible = (row: ExpenseRow) => row.reembolsoUf > 0 && !EXCLUDED_PRESTATIONS.has(row.descCober);
  const currentP = p.filter(row => row.period === period);
  const currentE = e.filter(row => row.period === period);
  const current = currentE.filter(eligible);
  const baseline = baselinePeriods.map(month => e.filter(row => row.period === month && eligible(row)));
  const average = (value: (rows: ExpenseRow[]) => number) => baseline.length ? sum(baseline, value) / baseline.length : null;
  const premiumUf = currentP.length ? sum(currentP, row => row.premiumUf) : null;
  const chartSpendUf = currentP.length ? sum(currentP, row => row.spendUf) : null;
  const rawExpenseUf = currentE.length ? sum(currentE, row => row.reembolsoUf) : null;
  const analyzedUf = currentE.length ? sum(current, row => row.reembolsoUf) : null;
  const averageExpenseUf = average(rows => sum(rows, row => row.reembolsoUf));
  const averagePremiumUf = baselinePeriods.length ? sum(p.filter(row => baselinePeriods.includes(row.period)), row => row.premiumUf) / baselinePeriods.length : null;
  const averageChartSpendUf = baselinePeriods.length ? sum(p.filter(row => baselinePeriods.includes(row.period)), row => row.spendUf) / baselinePeriods.length : null;
  const countPatients = (rows: ExpenseRow[]) => new Set(rows.map(identity).filter(Boolean)).size;
  const names = new Set([...current, ...baseline.flat()].map(row => row.descCober));
  const prestations = [...names].map(name => {
    const amountUf = sum(current.filter(row => row.descCober === name), row => row.reembolsoUf);
    const averageUf = average(rows => sum(rows.filter(row => row.descCober === name), row => row.reembolsoUf));
    return { name, amountUf, averageUf, increaseUf: averageUf === null || analyzedUf === null ? null : amountUf - averageUf };
  }).sort((a, b) => (b.increaseUf ?? b.amountUf) - (a.increaseUf ?? a.amountUf));
  const ranking = (key: (row: ExpenseRow) => string | null, anonymous = false) => {
    const totals = new Map<string, number>();
    for (const row of current) { const name = key(row); if (name) totals.set(name, (totals.get(name) ?? 0) + row.reembolsoUf); }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, amountUf], index) => ({ name: anonymous ? `Caso ${index + 1}` : name, amountUf, share: analyzedUf ? amountUf / analyzedUf : 0 }));
  };
  const hospitalUf = analyzedUf === null ? null : sum(current.filter(row => HOSPITAL.has(normalize(row.descCober))), row => row.reembolsoUf);
  const insights: string[] = [];
  if (analyzedUf !== null && averageExpenseUf !== null) {
    const increase = analyzedUf - averageExpenseUf;
    if (increase > 0) {
      const leader = prestations.find(row => (row.increaseUf ?? 0) > 0);
      if (leader) insights.push(`${leader.name} aporta ${leader.increaseUf!.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF al aumento neto de ${increase.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF frente al promedio. Otras prestaciones pueden compensar parte del aumento.`);
    } else insights.push("El reembolso analizado no supera el promedio de los meses comparables.");
  }
  if (premiumUf !== null && averagePremiumUf !== null && premiumUf < averagePremiumUf) insights.push("La prima del mes es menor que el promedio comparable; esto puede elevar la siniestralidad incluso sin un aumento del gasto.");
  const averageLines = average(rows => rows.length);
  const perLineUf = current.length ? analyzedUf! / current.length : null;
  const averagePerLineUf = baseline.flat().length ? sum(baseline.flat(), row => row.reembolsoUf) / baseline.flat().length : null;
  if (currentE.length && averageLines !== null && current.length > averageLines) insights.push("Hay más líneas con reembolso que en el promedio comparable. Es una señal de mayor actividad registrada, no una medida de atenciones únicas.");
  if (perLineUf !== null && averagePerLineUf !== null && perLineUf > averagePerLineUf) insights.push("El reembolso promedio por línea es mayor que en la referencia. Esto puede reflejar prestaciones más costosas o un cambio en su composición.");
  if (!currentE.length) insights.push("No hay filas de gastos para este mes y cobertura. No se interpreta su ausencia como gasto cero.");
  if (!baseline.length) insights.push("No hay meses comparables con primas y gastos entre los tres meses anteriores.");
  return { period, coverage, baselinePeriods, missingBaselinePeriods: previous.filter(month => !baselinePeriods.includes(month)),
    premiumUf, chartSpendUf, rawExpenseUf, analyzedUf, excludedUf: rawExpenseUf === null ? null : rawExpenseUf - analyzedUf!,
    differenceUf: chartSpendUf === null || rawExpenseUf === null ? null : chartSpendUf - rawExpenseUf,
    averagePremiumUf, averageChartSpendUf, averageExpenseUf,
    lines: currentE.length ? current.length : null, patients: currentE.length ? countPatients(current) : null,
    unidentifiedLines: current.filter(row => !identity(row)).length,
    averageLines, averagePatients: average(countPatients),
    perLineUf, averagePerLineUf,
    hospitalUf, hospitalShare: analyzedUf ? hospitalUf! / analyzedUf : null, insights, prestations,
    providers: ranking(row => row.provider), cases: ranking(identity, true) };
}
