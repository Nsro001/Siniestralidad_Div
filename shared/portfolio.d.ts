export type CoverageType = "Vida" | "Salud" | "Dental" | "Catastrófico";
export type Evidence = { documentId: string; page: number; quote: string; region?: EvidenceRegion };
export type ContractTerm = {
  id: string;
  label: string;
  value: string;
  unit: string;
  scope: string;
  period: string;
  evidence?: Evidence;
  tariff?: ContractTariff;
  sourceCandidateId?: string;
  reviewStatus?: "pending" | "reviewed";
  sourceNotes?: string[];
  sourceGroups?: string[];
  sourceWarnings?: string[];
  alternatives?: string[];
};
export type CoveragePlan = {
  id: string;
  name: string;
  groups: string[];
  terms: ContractTerm[];
};
export type ContractCoverage = {
  id: string;
  type: CoverageType;
  name: string;
  plans: CoveragePlan[];
};
export type PolicyContract = {
  number: string;
  insurer: string;
  startsOn: string;
  endsOn: string;
  currency: "UF" | "CLP" | "USD";
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual" | "single";
  commission: string;
  commissionBasis: string;
  broker: string;
  kam: string;
  status: "active" | "cancelled" | "suspended";
  cancellationDate: string;
  coverages: ContractCoverage[];
  evidence: Record<string, Evidence>;
};
export type PolicyVersion = {
  id: string;
  policy_id: string;
  client_id: string;
  revision: number;
  change_type: "initial" | "renewal" | "endorsement";
  effective_on: string;
  validation_status: "draft" | "validated";
  contract: PolicyContract;
  created_at: string;
  created_by: string;
  note: string;
};
export type ManagedClient = {
  id: string;
  name: string;
  legal_name: string | null;
  rut: string | null;
  portfolio_status: "active" | "inactive" | "prospect";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  kam_name: string | null;
  manager_name: string | null;
  revision: number;
};
export type PageText = {
  page: number;
  text: string;
  method: "text" | "ocr";
  tables?: string[][];
  sections?: string[];
  benefitTables?: DocumentTable[];
  contractCandidates?: ContractCandidate[];
  extractionWarnings?: string[];
};
export type ExtractedField = {
  key: string;
  value: string;
  page: number;
  quote: string;
  confidence: "candidate";
};
export type PolicyDocument = {
  id: string;
  client_id: string | null;
  original_name: string;
  sha256: string;
  status: "uploaded" | "processing" | "review" | "failed";
  error: string | null;
  pages: PageText[];
  fields: ExtractedField[];
  created_at: string;
};
export type DatasetSnapshot = {
  id: string;
  client_id: string;
  kind: "primas" | "gastos";
  created_at: string;
  row_count: number;
};
export type RowLink = {
  snapshot_id: string;
  row_index: number;
  policy_id: string;
  policy_version_id: string;
  coverage: string;
  allocation_percent: number;
};
export type PortfolioDetail = {
  client: ManagedClient;
  policies: Array<{ id: string; versions: PolicyVersion[] }>;
  documents: PolicyDocument[];
  snapshots: DatasetSnapshot[];
  movements: Array<{
    id: string;
    policy_id: string;
    movement_type: "collected" | "invoiced" | "adjustment";
    amount: string | number;
    currency: string;
    period: string;
    occurred_on: string;
    source_reference: string;
  }>;
  audit: Array<{
    id: number;
    entity: string;
    action: string;
    created_at: string;
    actor_id: string | null;
  }>;
};

export type EvidenceRegion = { x: number; y: number; width: number; height: number }; // Fracciones de página, origen superior izquierdo.
export type DocumentCell = {
  id: string; text: string; row: number; column: number; rowSpan: number; columnSpan: number;
  region: EvidenceRegion; quote: string;
};
export type DocumentTable = {
  id: string; page: number; cells: DocumentCell[]; headers: string[]; notes: string[];
  region: EvidenceRegion; method: 'grid' | 'layout'; warnings: string[]; context?: string;
};
export type ContractCandidate = {
  id: string; coverage: CoverageType | null; plan: string; groups: string[]; benefit: string;
  kind: 'reimbursement' | 'limit' | 'deductible' | 'capital' | 'rate' | 'age' | 'waiting' | 'exclusion' | 'special' | 'cmf' | 'tariff';
  value: string; unit: string; scope: string; period: string;
  page: number; quote: string; region?: EvidenceRegion; tableId?: string; cellId?: string;
  notes: string[]; warnings: string[]; alternatives: string[];
  eligibility: 'benefit' | 'restriction' | 'reference';
  reviewed?: boolean;
  tariff?: ContractTariff;
};

// Se conserva dentro de terms[] / contractCandidates[], sin reemplazar primas observadas.
export type ContractTariff = {
  concept: 'person_premium' | 'family_premium' | 'plan_tariff' | 'capital_rate' | 'insured_capital' | 'tax';
  component: 'net' | 'gross' | 'tax' | 'unspecified';
  componentLabel: string;
  category: string;
  currency: string; // Vacío si no está indicada. Independiente de la moneda general de la póliza.
  rateUnit: string;
  calculationBasis: string;
  periodicity: string; // Texto explícito del contrato; vacío si no está indicado.
  ageBand: string;
  incomeBand: string;
  capitalBasis: 'fixed_amount' | 'salary_multiple' | '';
  contextEvidence?: { page: number; quote: string }[];
};
