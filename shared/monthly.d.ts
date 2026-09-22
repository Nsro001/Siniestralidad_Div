export type MonthlyDetail = {
  period: string; coverage: string; baselinePeriods: string[]; missingBaselinePeriods: string[];
  premiumUf: number | null; chartSpendUf: number | null; rawExpenseUf: number | null;
  differenceUf: number | null; excludedUf: number | null; analyzedUf: number | null;
  averagePremiumUf: number | null; averageChartSpendUf: number | null; averageExpenseUf: number | null;
  lines: number | null; patients: number | null; unidentifiedLines: number;
  averageLines: number | null; averagePatients: number | null; perLineUf: number | null; averagePerLineUf: number | null;
  hospitalUf: number | null; hospitalShare: number | null; insights: string[];
  prestations: Array<{ name: string; amountUf: number; averageUf: number | null; increaseUf: number | null }>;
  providers: Array<{ name: string; amountUf: number; share: number }>;
  cases: Array<{ name: string; amountUf: number; share: number }>;
};
