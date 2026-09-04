import {
  ExpenseRow,
  PremiumRow,
  PrimasReportSeries,
  GastosDistributionRow,
  TopProviderRow,
  TopInsuredRow,
  IsapreDistributionRow,
  SystemHealthMetrics,
  HealthByPrestationRow,
} from "./types.js";

const CONSOLIDATED = "Consolidado S+D+C";
const CONSOLIDATED_SET = new Set(["Salud", "Dental", "Catastrófico"]);
const EXCLUDED_PRESTATIONS = new Set([
  "COBERTURA I-MED CONDICIONES RESTRINGIDAS",
  "COBERTURA I-MED SIN CONVENIO",
  "PRESTACIONES SIN BONIFICACION (S)",
  "BONO ELECTRONICO I-MED YA BONIFICADO",
  "VALORES EXCEDEN ARANCEL UCO CONTRATADO",
]);
const EXCLUDED_HEALTH_METRICS_PRESTATIONS = new Set(["MEDICAMENTOS", "PSICOLOGIA", "AUD OPT", "DENTALES"]);
const CARTERA_PERCENT_BY_PRESTATION: Record<string, number> = {
  MEDICAMENTOS: 25,
  EXAMENES: 20,
  DENTALES: 10,
  CONSULTAS: 12,
  HOSPITALIZACION: 20,
  PSICOLOGIA: 7,
  "AUD OPT": 6,
};
const EXCLUDED_ISAPRE = "SIN PREVISION DECLARADA";

export const buildFilters = (premiums: PremiumRow[], expenses: ExpenseRow[]) => {
  const clientSet = new Set<string>();
  for (const row of premiums) {
    clientSet.add(row.clientName);
  }
  for (const row of expenses) {
    clientSet.add(row.clientName);
  }
  const clients = Array.from(clientSet.values()).sort();

  const coveragesByClient: Record<string, string[]> = {};
  const periodsByClient: Record<string, string[]> = {};

  for (const client of clients) {
    const coverageSet = new Set<string>();
    const periodSet = new Set<string>();
    for (const row of premiums) {
      if (row.clientName !== client) continue;
      coverageSet.add(row.coverage);
      periodSet.add(row.period);
    }
    for (const row of expenses) {
      if (row.clientName !== client) continue;
      periodSet.add(row.period);
    }
    const coverageList = Array.from(coverageSet.values());
    if (coverageList.some((coverage) => CONSOLIDATED_SET.has(coverage))) {
      coverageList.push(CONSOLIDATED);
    }
    coveragesByClient[client] = coverageList.sort();
    periodsByClient[client] = Array.from(periodSet.values()).sort();
  }

  return { clients, coveragesByClient, periodsByClient };
};

const normalizeSelection = (value?: string) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const buildPeriodSeries = (rows: PremiumRow[], periods: string[]) => {
  const byPeriod = new Map<string, { premiumUf: number; spendUf: number }>();
  for (const row of rows) {
    if (!periods.includes(row.period)) continue;
    const current = byPeriod.get(row.period) ?? { premiumUf: 0, spendUf: 0 };
    current.premiumUf += row.premiumUf;
    current.spendUf += row.spendUf;
    byPeriod.set(row.period, current);
  }
  return periods.map((period) => ({
    period,
    premiumUf: byPeriod.get(period)?.premiumUf ?? 0,
    spendUf: byPeriod.get(period)?.spendUf ?? 0,
  }));
};

export const buildPrimasReport = (
  premiums: PremiumRow[],
  client: string,
  coveragesRaw?: string,
  periodsRaw?: string
): PrimasReportSeries[] => {
  const selectedCoverages = normalizeSelection(coveragesRaw);
  const selectedPeriods = normalizeSelection(periodsRaw);
  const clientRows = premiums.filter((row) => row.clientName === client);

  const coverages = selectedCoverages.length > 0 ? selectedCoverages : Array.from(new Set(clientRows.map((row) => row.coverage)));
  const periods =
    selectedPeriods.length > 0 ? selectedPeriods : Array.from(new Set(clientRows.map((row) => row.period))).sort();

  const series: PrimasReportSeries[] = [];
  for (const coverage of coverages) {
    if (coverage === CONSOLIDATED) {
      const consolidatedRows = clientRows.filter((row) => CONSOLIDATED_SET.has(row.coverage));
      if (consolidatedRows.length === 0) continue;
      series.push({ coverage, series: buildPeriodSeries(consolidatedRows, periods) });
      continue;
    }
    const filteredRows = clientRows.filter((row) => row.coverage === coverage);
    if (filteredRows.length === 0) continue;
    series.push({ coverage, series: buildPeriodSeries(filteredRows, periods) });
  }
  return series;
};

export const buildGastosReport = (
  expenses: ExpenseRow[],
  client: string,
  coveragesRaw?: string,
  periodsRaw?: string
) => {
  const selectedCoverages = normalizeSelection(coveragesRaw);
  const selectedPeriods = normalizeSelection(periodsRaw);

  const coverageSet = new Set<string>();
  for (const coverage of selectedCoverages) {
    if (coverage === CONSOLIDATED) {
      CONSOLIDATED_SET.forEach((item) => coverageSet.add(item));
    } else {
      coverageSet.add(coverage);
    }
  }

  const filtered = expenses.filter((row) => {
    if (row.clientName !== client) return false;
    if (selectedPeriods.length > 0 && !selectedPeriods.includes(row.period)) return false;
    if (coverageSet.size > 0 && !coverageSet.has(row.coverage)) return false;
    return true;
  });

  const totals = new Map<string, number>();
  for (const row of filtered) {
    if (EXCLUDED_PRESTATIONS.has(row.descCober)) continue;
    if (row.reembolsoUf <= 0) continue;
    totals.set(row.descCober, (totals.get(row.descCober) ?? 0) + row.reembolsoUf);
  }

  const totalUf = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  const rows: GastosDistributionRow[] = Array.from(totals.entries())
    .map(([prestation, totalUfRow]) => ({
      prestation,
      totalUf: totalUfRow,
      percent: totalUf > 0 ? (totalUfRow / totalUf) * 100 : 0,
      percentCartera: CARTERA_PERCENT_BY_PRESTATION[prestation],
    }))
    .sort((a, b) => b.totalUf - a.totalUf);

  const prestationOrder = rows.map((row) => row.prestation);

  const providerMap = new Map<string, TopProviderRow>();
  for (const row of filtered) {
    if (EXCLUDED_PRESTATIONS.has(row.descCober)) continue;
    if (row.reembolsoUf <= 0) continue;
    const provider = row.provider;
    const current = providerMap.get(provider) ?? { provider, totalUf: 0, byPrestation: {} };
    current.totalUf += row.reembolsoUf;
    current.byPrestation[row.descCober] = (current.byPrestation[row.descCober] ?? 0) + row.reembolsoUf;
    providerMap.set(provider, current);
  }

  const topProviders = Array.from(providerMap.values())
    .sort((a, b) => b.totalUf - a.totalUf)
    .slice(0, 10);

  const insuredMap = new Map<string, TopInsuredRow>();
  for (const row of filtered) {
    if (EXCLUDED_PRESTATIONS.has(row.descCober)) continue;
    if (row.reembolsoUf <= 0) continue;
    const insuredRut = row.insuredRut;
    const current = insuredMap.get(insuredRut) ?? { insuredRut, totalUf: 0, byPrestation: {} };
    current.totalUf += row.reembolsoUf;
    current.byPrestation[row.descCober] = (current.byPrestation[row.descCober] ?? 0) + row.reembolsoUf;
    insuredMap.set(insuredRut, current);
  }

  const topInsured = Array.from(insuredMap.values())
    .sort((a, b) => b.totalUf - a.totalUf)
    .slice(0, 20);

  const isapreCounts = new Map<string, number>();
  let totalIsapreCount = 0;
  for (const row of filtered) {
    const isapre = row.isapre.trim();
    if (!isapre || isapre === EXCLUDED_ISAPRE) continue;
    isapreCounts.set(isapre, (isapreCounts.get(isapre) ?? 0) + 1);
    totalIsapreCount += 1;
  }
  const isapreDistribution: IsapreDistributionRow[] = Array.from(isapreCounts.entries())
    .map(([isapre, count]) => ({
      isapre,
      count,
      percent: totalIsapreCount > 0 ? (count / totalIsapreCount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  let sumValPrest = 0;
  let sumValBonif = 0;
  let sumReembolso = 0;
  let sumCopago = 0;
  const prestationHealthMap = new Map<string, { valPrest: number; valBonif: number; reembolso: number; copago: number }>();
  for (const row of filtered) {
    if (EXCLUDED_HEALTH_METRICS_PRESTATIONS.has(row.descCober)) continue;
    if (row.valPrest <= 0) continue;
    sumValPrest += row.valPrest;
    sumValBonif += row.valBonif;
    sumReembolso += row.reembolsoUf;
    sumCopago += row.mtoReclam - row.reembolsoUf;
    const current = prestationHealthMap.get(row.descCober) ?? { valPrest: 0, valBonif: 0, reembolso: 0, copago: 0 };
    current.valPrest += row.valPrest;
    current.valBonif += row.valBonif;
    current.reembolso += row.reembolsoUf;
    current.copago += row.mtoReclam - row.reembolsoUf;
    prestationHealthMap.set(row.descCober, current);
  }
  const systemHealthMetrics: SystemHealthMetrics = {
    bonifHealthPercent: sumValPrest > 0 ? sumValBonif / sumValPrest : 0,
    bonifSeguroPercent: sumValPrest > 0 ? sumReembolso / sumValPrest : 0,
    copagoUsuarioPercent: sumValPrest > 0 ? Math.max(0, sumCopago) / sumValPrest : 0,
  };
  const healthByPrestation: HealthByPrestationRow[] = Array.from(prestationHealthMap.entries())
    .map(([prestation, values]) => ({
      prestation,
      bonifHealthPercent: values.valPrest > 0 ? values.valBonif / values.valPrest : 0,
      bonifSeguroPercent: values.valPrest > 0 ? values.reembolso / values.valPrest : 0,
      copagoUsuarioPercent: values.valPrest > 0 ? Math.max(0, values.copago) / values.valPrest : 0,
    }))
    .sort((a, b) => b.bonifSeguroPercent - a.bonifSeguroPercent);

  return {
    rows,
    totalUf,
    prestationOrder,
    topProviders,
    topInsured,
    isapreDistribution,
    systemHealthMetrics,
    healthByPrestation,
  };
};
