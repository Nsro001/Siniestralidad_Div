import { sanitizeFunctionalContract } from "../../shared/contractPolicy.mjs";
import { HttpError } from "./supabase.js";
import type {
  Evidence,
  PolicyContract,
  PolicyVersion,
} from "../../shared/portfolio.js";
export const coverageTypes = ["Vida", "Salud", "Dental", "Catastrófico"];
export function normalizeRut(input: string): string | null {
  const value = input.replace(/[.\s-]/g, "").toUpperCase();
  if (!value) return null;
  if (!/^\d{1,8}[\dK]$/.test(value))
    throw new HttpError(400, "RUT inválido: incluye dígito verificador.");
  const body = String(Number(value.slice(0, -1)));
  let sum = 0,
    factor = 2;
  for (const digit of [...body].reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const mod = 11 - (sum % 11),
    dv = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  if (value.slice(-1) !== dv || Number(body) === 0)
    throw new HttpError(400, "Dígito verificador del RUT inválido.");
  return `${body}-${dv}`;
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function uuid(value: unknown) {
  if (!isUuid(value)) throw new HttpError(400, "Identificador inválido.");
  return value;
}
const text = (value: unknown, limit: number) =>
  typeof value === "string" && value.length <= limit;
export function validateEvidence(value: unknown): value is Evidence {
  const e = value as Evidence | undefined;
  return (
    !!e &&
    isUuid(e.documentId) &&
    Number.isInteger(e.page) &&
    e.page > 0 &&
    text(e.quote, 12000) &&
    e.quote.trim().length >= 3 &&
    (!e.region || [e.region.x,e.region.y,e.region.width,e.region.height].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && e.region.width > 0 && e.region.height > 0 && e.region.x + e.region.width <= 1.001 && e.region.y + e.region.height <= 1.001)
  );
}
export function validateContract(value: unknown): PolicyContract {
  const c = sanitizeFunctionalContract(value);
  if (
    !c ||
    !text(c.number, 120) ||
    !c.number.trim() ||
    !text(c.insurer, 200) ||
    !c.insurer.trim() ||
    !["UF", "CLP", "USD"].includes(c.currency) ||
    !["monthly", "quarterly", "semiannual", "annual", "single"].includes(
      c.periodicity,
    ) ||
    !["active", "cancelled", "suspended"].includes(c.status) ||
    !Array.isArray(c.coverages) ||
    c.coverages.length > 40 ||
    !c.evidence ||
    typeof c.evidence !== "object" ||
    Array.isArray(c.evidence)
  )
    throw new HttpError(400, "Datos de póliza inválidos.");
  for (const field of ["startsOn", "endsOn", "cancellationDate"] as const)
    if (c[field] !== "" && !validDate(c[field]))
      throw new HttpError(400, "Fecha contractual inválida.");
  if (c.startsOn && c.endsOn && c.startsOn > c.endsOn)
    throw new HttpError(400, "El término debe ser posterior al inicio.");
  if (c.status === "cancelled" && !c.cancellationDate)
    throw new HttpError(400, "Indica la fecha de cancelación.");
  for (const [v, max] of [
    [c.commission, 100],
  ] as const) {
    if (
      !text(v, 50) ||
      (v !== "" &&
        (!/^\d+(\.\d+)?$/.test(v) ||
          !Number.isFinite(Number(v)) ||
          Number(v) > max))
    )
      throw new HttpError(400, "Prima o comisión inválida. Usa punto decimal.");
  }
  for (const field of ["commissionBasis", "broker", "kam"] as const)
    if (!text(c[field], 500))
      throw new HttpError(400, "Texto contractual inválido.");
  const ids = new Set<string>();
  const id = (v: unknown) => {
    uuid(v);
    if (ids.has(v as string))
      throw new HttpError(
        400,
        "Identificadores de cobertura/plan/condición duplicados.",
      );
    ids.add(v as string);
  };
  for (const cv of c.coverages) {
    id(cv.id);
    if (
      !coverageTypes.includes(cv.type) ||
      !text(cv.name, 240) ||
      !cv.name.trim() ||
      !Array.isArray(cv.plans) ||
      cv.plans.length > 100
    )
      throw new HttpError(400, "Cobertura inválida.");
    for (const plan of cv.plans) {
      id(plan.id);
      if (
        !text(plan.name, 240) ||
        !plan.name.trim() ||
        !Array.isArray(plan.groups) ||
        plan.groups.length > 100 ||
        plan.groups.some((g) => !text(g, 240) || !g.trim()) ||
        !Array.isArray(plan.terms) ||
        plan.terms.length > 500
      )
        throw new HttpError(400, "Plan o grupo inválido.");
      for (const term of plan.terms) {
        id(term.id);
        if (
          !text(term.label, 240) ||
          !term.label.trim() ||
          !text(term.value, 12000) ||
          !term.value.trim() ||
          !text(term.unit, 120) ||
          !text(term.scope, 240) ||
          !text(term.period, 120)
        )
          throw new HttpError(400, "Condición vacía o inválida.");
        if(term.tariff){
          const t=term.tariff;
          if(!['person_premium','family_premium','plan_tariff','capital_rate','insured_capital','tax'].includes(t.concept)||!['net','gross','tax','unspecified'].includes(t.component)||!['','fixed_amount','salary_multiple'].includes(t.capitalBasis))throw new HttpError(400,'Concepto de tarificación inválido.');
          if(t.concept==='capital_rate'&&t.rateUnit!==term.unit)throw new HttpError(400,'La unidad de tasa y la unidad del valor deben coincidir.');
          for(const key of ['componentLabel','category','currency','rateUnit','calculationBasis','periodicity','ageBand','incomeBand'] as const)if(!text(t[key],12000))throw new HttpError(400,'Campo de tarificación inválido.');
          if(t.contextEvidence!==undefined&&(!Array.isArray(t.contextEvidence)||t.contextEvidence.length>20||t.contextEvidence.some(e=>!Number.isInteger(e.page)||e.page<1||!text(e.quote,12000))))throw new HttpError(400,'Contexto de tarificación inválido.');
        }
        if (term.reviewStatus !== undefined && !["pending","reviewed"].includes(term.reviewStatus)) throw new HttpError(400,"Estado de revisión inválido.");
        if (term.sourceCandidateId !== undefined && !text(term.sourceCandidateId,500)) throw new HttpError(400,"Referencia de extracción inválida.");
        for (const values of [term.sourceNotes,term.sourceWarnings,term.alternatives,term.sourceGroups])
          if (values !== undefined && (!Array.isArray(values) || values.length > 100 || values.some(v => !text(v,12000)))) throw new HttpError(400,"Notas de extracción inválidas.");
        if (term.evidence && !validateEvidence(term.evidence))
          throw new HttpError(400, "Evidencia de condición inválida.");
      }
    }
  }
  if (Object.values(c.evidence).some((e) => !validateEvidence(e)))
    throw new HttpError(400, "Evidencia inválida.");
  return c;
}
// Versión efectiva a la fecha consultada; un borrador nunca desplaza un contrato validado.
export function effectivePolicies<
  T extends Pick<
    PolicyVersion,
    "policy_id" | "revision" | "effective_on" | "validation_status"
  >,
>(versions: T[], today: string): T[] {
  const chosen = new Map<string, T>();
  for (const v of versions) {
    if (v.validation_status !== "validated" || v.effective_on > today) continue;
    const old = chosen.get(v.policy_id);
    if (
      !old ||
      v.effective_on > old.effective_on ||
      (v.effective_on === old.effective_on && v.revision > old.revision)
    )
      chosen.set(v.policy_id, v);
  }
  return [...chosen.values()];
}
export function policyState(
  c: Pick<
    PolicyContract,
    "status" | "cancellationDate" | "startsOn" | "endsOn"
  >,
  today: string,
) {
  if (
    c.status === "cancelled" &&
    c.cancellationDate &&
    c.cancellationDate <= today
  )
    return "cancelled";
  if (c.status === "suspended") return "suspended";
  if (!c.startsOn || !c.endsOn) return "unknown";
  return c.startsOn > today
    ? "future"
    : c.endsOn < today
      ? "expired"
      : "active";
}

export function assertContractReviewComplete(contract:PolicyContract):void {
  for(const coverage of contract.coverages)for(const plan of coverage.plans){
    const values=new Map<string,string>();
    for(const term of plan.terms){
      if(term.reviewStatus==='pending')throw new HttpError(400,'Hay condiciones extraídas pendientes de revisión. Resuelve las ambigüedades antes de confirmar.');
      if(!term.sourceCandidateId)continue;
      const key=[term.label,term.unit,term.scope,term.period,JSON.stringify(term.sourceGroups??[])].join('|');
      const previous=values.get(key);
      if(previous!==undefined&&previous!==term.value)throw new HttpError(400,'Persisten condiciones contradictorias para el mismo alcance. Conserva el respaldo y resuelve el valor vigente antes de confirmar.');
      values.set(key,term.value);
    }
  }
}
