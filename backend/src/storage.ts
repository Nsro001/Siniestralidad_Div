import { ExpenseRow, PremiumRow } from "./types.js";

type DataStore = {
  premiums: PremiumRow[];
  expenses: ExpenseRow[];
  lastUploadAt?: string;
};

const store: DataStore = {
  premiums: [],
  expenses: [],
};

export const dataStore = {
  getPremiums: () => store.premiums,
  getExpenses: () => store.expenses,
  replacePremiums: (rows: PremiumRow[]) => {
    store.premiums = rows;
    store.lastUploadAt = new Date().toISOString();
  },
  replaceExpenses: (rows: ExpenseRow[]) => {
    store.expenses = rows;
    store.lastUploadAt = new Date().toISOString();
  },
  getLastUploadAt: () => store.lastUploadAt,
};
