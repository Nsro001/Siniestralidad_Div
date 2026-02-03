export type Period = string; // YYYY-MM

export type PeriodFilter =
  | { mode: "latest" }
  | { mode: "all" }
  | { mode: "range"; from: Period; to: Period };

export type PremiumRow = {
  period: Period;
  clientId: string;
  clientName: string;
  coverage: string;
  premiumAmount: number;
  currency?: string;
  plan?: string;
  collective?: string;
};

export type ClaimRow = {
  period: Period;
  clientId: string;
  clientName: string;
  coverage: string;
  category?: string;
  provider?: string;
  insuredId?: string;
  insuredName?: string;
  amount: number;
  currency?: string;
  date?: string;
};

export type ClientInfo = {
  id: string;
  name: string;
};

export type MappingTemplate = {
  clientId: string;
  premium: ColumnMapping;
  claims: ColumnMapping;
  updatedAt: string;
};

export type ColumnMapping = {
  clientName?: string;
  clientId?: string;
  period?: string;
  date?: string;
  amount?: string;
  coverage?: string;
  insuredId?: string;
  insuredName?: string;
  provider?: string;
  category?: string;
  currency?: string;
  plan?: string;
  collective?: string;
};
