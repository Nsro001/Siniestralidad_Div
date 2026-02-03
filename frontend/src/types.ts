export type FiltersResponse = {
  clients: string[];
  coveragesByClient: Record<string, string[]>;
  periodsByClient: Record<string, string[]>;
};

export type PrimasReport = {
  series: Array<{
    coverage: string;
    series: Array<{ period: string; premiumUf: number; spendUf: number }>;
  }>;
};

export type GastosReport = {
  rows: Array<{ prestation: string; totalUf: number; percent: number; percentCartera?: number }>;
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
