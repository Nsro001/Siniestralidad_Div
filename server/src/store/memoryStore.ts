export interface ClientData {
  name: string;
  normalizedName: string;
}

export interface PrimasRecord {
  clientName: string;
  rut: string;
  poliza: string;
  period: string; // YYYY-MM
  coverage: string;
  primaUF: number;
  gastoUF: number;
}

export interface GastosRecord {
  clientName: string;
  period: string; // YYYY-MM
  coverageCode: number | string;
  coverageName: string;
  description: string;
  reembolsoUF: number;
}

export interface StoreState {
  primas: PrimasRecord[];
  gastos: GastosRecord[];
  clients: string[]; // Normalized list of available clients
}

// Global In-Memory Store
export const store: StoreState = {
  primas: [],
  gastos: [],
  clients: [],
};

export const resetStore = () => {
  store.primas = [];
  store.gastos = [];
  store.clients = [];
};
