import { useState } from "react";
import { openPolicyOriginal } from "../api";
import TariffReviewTable from "./TariffReviewTable";
import type { ContractCandidate } from "../../../shared/portfolio";
import type {
  ContractCoverage,
  CoverageType,
  PolicyContract,
  PolicyDocument,
  PolicyVersion,
} from "../../../shared/portfolio";
import { COVERAGE_FIELDS, COVERAGE_TYPES } from "../lib/coverageFields";
import ContractEvidence from "./ContractEvidence";
export type PolicyDraft = {
  policyId: string | null;
  expectedRevision: number;
  changeType: PolicyVersion["change_type"];
  effectiveOn: string;
  note: string;
  contract: PolicyContract;
};
export const emptyContract = (): PolicyContract => ({
  number: "",
  insurer: "",
  startsOn: "",
  endsOn: "",
  currency: "UF",
  periodicity: "monthly",
  commission: "",
  commissionBasis: "",
  broker: "",
  kam: "",
  status: "active",
  cancellationDate: "",
  coverages: [],
  evidence: {},
});
export default function PolicyContractForm({
  draft,
  onChange,
  documents,
  tab,
  editable,
}: {
  draft: PolicyDraft;
  onChange: (draft: PolicyDraft) => void;
  documents: PolicyDocument[];
  tab: string;
  editable: boolean;
}) {
  const [originalError,setOriginalError]=useState("");
  const c = draft.contract;
  const set = (contract: PolicyContract) => onChange({ ...draft, contract });
  const evidence = (key: string) => (
    <ContractEvidence
      disabled={!editable}
      documents={documents}
      value={c.evidence[key]}
      onChange={(value) => {
        const next = { ...c.evidence };
        if (value) next[key] = value;
        else delete next[key];
        set({ ...c, evidence: next });
      }}
    />
  );
  const field = (
    label: string,
    key: keyof PolicyContract,
    type = "text",
    backed = true,
  ) => (
    <div className="contract-field" key={key}>
      <label>
        {label}
        <input
          disabled={
            !editable ||
            (!!draft.policyId && ["number", "insurer"].includes(key))
          }
          type={type}
          value={String(c[key] ?? "")}
          onChange={(e) =>
            key === "startsOn" && draft.changeType !== "endorsement"
              ? onChange({
                  ...draft,
                  effectiveOn: e.target.value,
                  contract: { ...c, startsOn: e.target.value },
                })
              : set({ ...c, [key]: e.target.value })
          }
        />
      </label>
      {backed && evidence(key)}
    </div>
  );
  const updateCoverage = (index: number, coverage: ContractCoverage) =>
    set({
      ...c,
      coverages: c.coverages.map((v, i) => (i === index ? coverage : v)),
    });
  const shown = c.coverages
    .map((coverage, index) => ({ coverage, index }))
    .filter((v) => v.coverage.type === tab);
  return (
    <div className="account-form contract-form">
      {originalError&&<p role="alert">{originalError}</p>}
      {tab === "policies" ? (
        <>
          <div className="contract-grid">
            {field("Número de póliza", "number")}
            {field("Aseguradora", "insurer")}
            {field("Inicio de vigencia", "startsOn", "date")}
            {field("Término de vigencia", "endsOn", "date")}
            <div>
              <label>
                Moneda
                <select
                  disabled={!editable}
                  value={c.currency}
                  onChange={(e) =>
                    set({
                      ...c,
                      currency: e.target.value as PolicyContract["currency"],
                    })
                  }
                >
                  <option>UF</option>
                  <option>CLP</option>
                  <option>USD</option>
                </select>
              </label>
              {evidence("currency")}
            </div>
            <div>
              <label>
                Periodicidad
                <select
                  disabled={!editable}
                  value={c.periodicity}
                  onChange={(e) =>
                    set({
                      ...c,
                      periodicity: e.target
                        .value as PolicyContract["periodicity"],
                    })
                  }
                >
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="semiannual">Semestral</option>
                  <option value="annual">Anual</option>
                  <option value="single">Única</option>
                </select>
              </label>
              {evidence("periodicity")}
            </div>
            {field("Comisión (%)", "commission")}
            {field("Base de la comisión", "commissionBasis")}
            {field("Corredor contractual", "broker")}
            {field("Ejecutivo / KAM contractual", "kam", "text", false)}
            <label>
              Estado administrativo
              <select
                disabled={!editable}
                value={c.status}
                onChange={(e) =>
                  set({
                    ...c,
                    status: e.target.value as PolicyContract["status"],
                  })
                }
              >
                <option value="active">Activa</option>
                <option value="suspended">Suspendida</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
            {c.status === "cancelled" &&
              field("Fecha de cancelación", "cancellationDate", "date")}
          </div>
          <p className="account-muted">
            Solo se registran tarifas individuales por categoría y reglas de Vida. No se incorporan totales ni subtotales. El período y la moneda deben verificarse aunque el formulario
            muestre una selección inicial. La prima total no se suma nuevamente
            con las primas de planes.
          </p>
          <div className="contract-grid">
            <label>
              Tipo de versión
              <select
                disabled={!editable}
                value={draft.changeType}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    changeType: e.target.value as PolicyDraft["changeType"],
                  })
                }
              >
                <option value="initial">
                  Inicial / corrección de borrador
                </option>
                {draft.policyId && (
                  <>
                    <option value="renewal">Renovación</option>
                    <option value="endorsement">Endoso</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Fecha de efecto de la versión
              <input
                disabled={!editable}
                type="date"
                value={draft.effectiveOn}
                onChange={(e) =>
                  onChange({ ...draft, effectiveOn: e.target.value })
                }
              />
            </label>
            {draft.changeType === "endorsement" && evidence("effectiveOn")}
            <label>
              Motivo / observación
              <textarea
                disabled={!editable}
                value={draft.note}
                maxLength={2000}
                onChange={(e) => onChange({ ...draft, note: e.target.value })}
              />
            </label>
          </div>
          <p>
            Coberturas registradas:{" "}
            {c.coverages.map((v) => v.name).join(", ") ||
              "Ninguna. Añade solo coberturas presentes en los documentos."}
          </p>
        </>
      ) : (
        COVERAGE_TYPES.includes(tab as CoverageType) && (
          <>
            <div className="contract-actions">
              <h3>{tab}</h3>
              {editable && (
                <button
                  type="button"
                  className="account-secondary"
                  onClick={() =>
                    set({
                      ...c,
                      coverages: [
                        ...c.coverages,
                        {
                          id: crypto.randomUUID(),
                          type: tab as CoverageType,
                          name: tab,
                          plans: [],
                        },
                      ],
                    })
                  }
                >
                  Añadir cobertura {tab}
                </button>
              )}
            </div>
            {!shown.length && (
              <p className="account-muted">
                No hay cobertura {tab} registrada en esta póliza. Añádela
                únicamente si consta en sus documentos.
              </p>
            )}
            {shown.map(({ coverage, index }) => (
              <section className="contract-panel" key={coverage.id}>
                <label>
                  Nombre contractual de cobertura
                  <input
                    disabled={!editable}
                    value={coverage.name}
                    onChange={(e) =>
                      updateCoverage(index, {
                        ...coverage,
                        name: e.target.value,
                      })
                    }
                  />
                </label>
                {evidence(coverage.id)}
                <div className="contract-actions">
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="account-secondary"
                        onClick={() =>
                          updateCoverage(index, {
                            ...coverage,
                            plans: [
                              ...coverage.plans,
                              {
                                id: crypto.randomUUID(),
                                name: "",
                                groups: [],
                                terms: [],
                              },
                            ],
                          })
                        }
                      >
                        Añadir plan / conjunto de condiciones
                      </button>
                      <button
                        type="button"
                        className="account-secondary"
                        onClick={() =>
                          set({
                            ...c,
                            coverages: c.coverages.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        Retirar de esta versión
                      </button>
                    </>
                  )}
                </div>
                {coverage.plans.map((plan, pi) => {
                  const setPlan = (p: typeof plan) =>
                    updateCoverage(index, {
                      ...coverage,
                      plans: coverage.plans.map((v, i) => (i === pi ? p : v)),
                    });
                  return (
                    <section className="contract-plan" key={plan.id}>
                      <div className="contract-grid">
                        <label>
                          Nombre de plan / condiciones
                          <input
                            disabled={!editable}
                            value={plan.name}
                            onChange={(e) =>
                              setPlan({ ...plan, name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Grupos (uno por línea)
                          <textarea
                            disabled={!editable}
                            value={plan.groups.join("\n")}
                            onChange={(e) =>
                              setPlan({
                                ...plan,
                                groups: e.target.value.split("\n"),
                              })
                            }
                          />
                        </label>
                      </div>
                      {evidence(plan.id)}
                      <TariffReviewTable candidates={plan.terms.filter(t=>t.tariff).map(t=>({id:t.id,coverage:coverage.type,plan:plan.name,groups:t.sourceGroups??plan.groups,benefit:t.label,kind:t.tariff!.concept==='capital_rate'?'rate':t.tariff!.concept==='insured_capital'?'capital':'tariff',value:t.value,unit:t.unit,scope:t.scope,period:t.period,page:t.evidence?.page??1,quote:t.evidence?.quote??'',region:t.evidence?.region,notes:t.sourceNotes??[],warnings:t.sourceWarnings??[],alternatives:t.alternatives??[],eligibility:'benefit',reviewed:t.reviewStatus==='reviewed',tariff:t.tariff} as ContractCandidate))} editable={editable} onChange={(id,patch)=>setPlan({...plan,terms:plan.terms.map(t=>t.id===id?{...t,...(patch.value!==undefined?{value:patch.value}:{}),...(patch.unit!==undefined?{unit:patch.unit}:{}),...(patch.period!==undefined?{period:patch.period}:{}),...(patch.tariff?{tariff:patch.tariff}:{}),reviewStatus:patch.reviewed?'reviewed':'pending'}:t)})} onInspect={c=>{const e=plan.terms.find(t=>t.id===c.id)?.evidence;if(e)void openPolicyOriginal(e.documentId).then(r=>window.open(`${r.url}#page=${e.page}`,'_blank','noopener,noreferrer')).catch(error=>setOriginalError(error.message));}}/>

                      {plan.terms.map((term, ti) => (
                        <div className="contract-term" key={term.id}>
                          <div className="contract-grid">
                            <label>
                              Prestación / condición
                              <input
                                disabled={!editable}
                                list={`fields-${term.id}`}
                                value={term.label}
                                onChange={(e) =>
                                  setPlan({
                                    ...plan,
                                    terms: plan.terms.map((v, i) =>
                                      i === ti
                                        ? { ...v, label: e.target.value }
                                        : v,
                                    ),
                                  })
                                }
                              />
                              <datalist id={`fields-${term.id}`}>
                                {COVERAGE_FIELDS[coverage.type].map((v) => (
                                  <option key={v} value={v} />
                                ))}
                              </datalist>
                            </label>
                            <label>
                              Valor / descripción contractual
                              <textarea
                                disabled={!editable}
                                value={term.value}
                                onChange={(e) =>
                                  setPlan({
                                    ...plan,
                                    terms: plan.terms.map((v, i) =>
                                      i === ti
                                        ? { ...v, value: e.target.value }
                                        : v,
                                    ),
                                  })
                                }
                              />
                            </label>
                            {(
                              [
                                ["unit", "Unidad / moneda"],
                                [
                                  "scope",
                                  "Ámbito (individual, familiar, grupo…)",
                                ],
                                [
                                  "period",
                                  "Por evento / año / otra periodicidad",
                                ],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key}>
                                {label}
                                <input
                                  disabled={!editable}
                                  value={term[key]}
                                  onChange={(e) =>
                                    setPlan({
                                      ...plan,
                                      terms: plan.terms.map((v, i) =>
                                        i === ti
                                          ? { ...v, [key]: e.target.value }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          {term.sourceCandidateId && <aside className="contract-notice"><p>Condición extraída · {term.reviewStatus === "pending" ? "Pendiente de revisión" : "Revisada"}</p>{term.sourceGroups?.length ? <p>Grupos de esta condición: {term.sourceGroups.join(", ")}</p> : null}{term.sourceWarnings?.map((w,i)=><p key={i}>{w}</p>)}{term.alternatives?.length ? <p>Alternativas originales: {term.alternatives.join(" / ")}</p> : null}{term.sourceNotes?.map((n,i)=><p key={i}>{n}</p>)}{editable&&<label><input type="checkbox" checked={term.reviewStatus === "reviewed"} onChange={e=>setPlan({...plan,terms:plan.terms.map((v,i)=>i===ti?{...v,reviewStatus:e.target.checked?"reviewed":"pending"}:v)})}/>Revisé el valor, su ámbito y las notas</label>}</aside>}
                          <ContractEvidence
                            disabled={!editable}
                            documents={documents}
                            value={term.evidence}
                            onChange={(ev) =>
                              setPlan({
                                ...plan,
                                terms: plan.terms.map((v, i) =>
                                  i === ti ? { ...v, evidence: ev } : v,
                                ),
                              })
                            }
                          />
                          {editable && (
                            <button
                              type="button"
                              className="account-secondary"
                              onClick={() =>
                                setPlan({
                                  ...plan,
                                  terms: plan.terms.filter((_, i) => i !== ti),
                                })
                              }
                            >
                              Retirar condición
                            </button>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <div className="contract-actions">
                          <button
                            type="button"
                            className="account-secondary"
                            onClick={() =>
                              setPlan({
                                ...plan,
                                terms: [
                                  ...plan.terms,
                                  {
                                    id: crypto.randomUUID(),
                                    label: "",
                                    value: "",
                                    unit: "",
                                    scope: "",
                                    period: "",
                                  },
                                ],
                              })
                            }
                          >
                            Añadir prestación, tope, capital, deducible o
                            condición
                          </button>
                          <button
                            type="button"
                            className="account-secondary"
                            onClick={() =>
                              updateCoverage(index, {
                                ...coverage,
                                plans: coverage.plans.filter(
                                  (_, i) => i !== pi,
                                ),
                              })
                            }
                          >
                            Retirar plan
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </section>
            ))}
          </>
        )
      )}
    </div>
  );
}
