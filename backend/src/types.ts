export type PremiumRow = {
  clientName: string;
  clientRut: string | undefined;
  period: string; // YYYY-MM
  coverage: string;
  premiumUf: number;
  spendUf: number;
};

export type ExpenseRow = {
  clientName: string;
  period: string; // YYYY-MM
  coverage: string;
  descCober: string;
  reembolsoUf: number;
  provider: string;
  insuredRut: string;
  isapre: string;
  valPrest: number;
  valBonif: number;
  mtoReclam: number;
};

export type FiltersResponse = {
  clients: string[];
  coveragesByClient: Record<string, string[]>;
  periodsByClient: Record<string, string[]>;
};

export type PrimasReportSeries = {
  coverage: string;
  series: Array<{ period: string; premiumUf: number; spendUf: number }>;
};

export type GastosDistributionRow = {
  prestation: string;
  totalUf: number;
  percent: number;
  percentCartera?: number;
};

export type TopProviderRow = {
  provider: string;
  totalUf: number;
  byPrestation: Record<string, number>;
};

export type TopInsuredRow = {
  insuredRut: string;
  totalUf: number;
  byPrestation: Record<string, number>;
};

export type IsapreDistributionRow = {
  isapre: string;
  count: number;
  percent: number;
};

export type SystemHealthMetrics = {
  bonifHealthPercent: number;
  bonifSeguroPercent: number;
  copagoUsuarioPercent: number;
};

export type HealthByPrestationRow = {
  prestation: string;
  bonifHealthPercent: number;
  bonifSeguroPercent: number;
  copagoUsuarioPercent: number;
};
