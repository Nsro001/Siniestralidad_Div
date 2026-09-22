export type FiltersResponse = {
  clients: string[];
  coveragesByClient: Record<string, string[]>;
  periodsByClient: Record<string, string[]>;
};

export type PrimasReport = {
  series: Array<{
    coverage: string;
    series: Array<{ period: string; premiumUf: number; spendUf: number; previousPeriod?: string; previousLossRatio?: number | null }>;
  }>;
};

export type ClaimantsReport = {
  titularClaimants: number;
  dependentClaimants: number;
  source: "gastos";
};

export type GastosReport = {
  comparison?: { periods: string[]; previousPeriods: string[]; missingPreviousPeriods: string[]; missingCurrentPeriods: string[]; complete: boolean };
  rows: Array<{ prestation: string; totalUf: number; percent: number; percentCartera?: number; previousTotalUf?: number | null; previousPercent?: number | null; variationPercent?: number | null; trend?: "up" | "down" | "stable" | "unavailable"; }>;
  prestationOrder: string[];
  topProviders: Array<{
    provider: string;
    totalUf: number;
    byPrestation: Record<string, number>;
  }>;
  topInsured: Array<{
    insuredRut: string;
    totalUf: number;
    byPrestation: Record<string, number>;
  }>;
  isapreDistribution: Array<{ isapre: string; count: number; percent: number }>;
  systemHealthMetrics: {
    bonifHealthPercent: number;
    bonifSeguroPercent: number;
    copagoUsuarioPercent: number;
  };
  healthByPrestation: Array<{
    prestation: string;
    bonifHealthPercent: number;
    bonifSeguroPercent: number;
    copagoUsuarioPercent: number;
  }>;
  totalUf: number;
};

export type AccountProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "executive" | "manager";
  portfolio_name?: string | null;
  active: boolean;
};
export type AdminAccounts = {
  users: AccountProfile[];
  clients: Array<{ id: string; name: string; kam_name?: string | null; manager_name?: string | null }>;
  assignments: Array<{ user_id: string; client_id: string }>;
};

export type PortfolioClient = {
  id: string; name: string; kam: string; manager: string;
  latestPeriod: string | null; monthlyPremiumUf: number | null; annualPremiumUf: number | null;
  insured: Array<{ policy: string; coverage: string; holders: number | null; dependents: number | null }>;
  holders: number | null; dependents: number | null; firstPeriod: string | null;
  renewals: string[];
};
export type Portfolio = { clients: PortfolioClient[] };
