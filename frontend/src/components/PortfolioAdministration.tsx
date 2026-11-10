import { sanitizeFunctionalContract } from "../../../shared/contractPolicy.mjs";
import { useEffect, useRef, useState } from "react";
import type {
  ExtractedField,
  ManagedClient,
  PolicyDocument,
  PolicyVersion,
  PortfolioDetail,
} from "../../../shared/portfolio";
import type { AccountProfile } from "../types";
import {
  assignPolicyDocument,
  extractPolicyDocument,
  fetchClientDetail,
  fetchManagedClients,
  fetchPolicyDocument,
  fetchUnassignedDocuments,
  saveManagedClient,
  saveManagedPolicy,
  uploadPolicyDocument,
} from "../api";
import { incorporateConditions } from "../lib/contractCandidates";
import { PageHeader } from "./DesignSystem";
import PolicyContractForm, {
  emptyContract,
  type PolicyDraft,
} from "./PolicyContractForm";
import PolicyDocumentReview from "./PolicyDocumentReview";
import PortfolioReconciliation from "./PortfolioReconciliation";
import PolicyTechnicalPanel from './PolicyTechnicalPanel';
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
const newDraft = (): PolicyDraft => ({
  policyId: null,
  expectedRevision: 0,
  changeType: "initial",
  effectiveOn: today(),
  note: "",
  contract: emptyContract(),
});
const blankClient = () => ({
  id: "",
  revision: 0,
  legal_name: "",
  rut: "",
  portfolio_status: "prospect",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
});
const tabs = [["client", "Cliente"], ["policies", "Pólizas"], ["coverages", "Coberturas"], ["documents", "Documentos"], ["review", "Revisión"]];
const coverageTypes = ["Vida", "Salud", "Dental", "Catastrófico"] as const;
export default function PortfolioAdministration({
  profile,
}: {
  profile: AccountProfile;
}) {
  const editable = profile.role === "admin";
  const [clients, setClients] = useState<ManagedClient[]>([]),
    [detail, setDetail] = useState<PortfolioDetail | null>(null),
    [selected, setSelected] = useState("");
  const [client, setClient] = useState(blankClient),
    [tab, setTab] = useState("client"),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<PolicyDraft>(newDraft),
    [unassigned, setUnassigned] = useState<PolicyDocument[]>([]),
    [document, setDocument] = useState<PolicyDocument | null>(null);
  const [coverageTab, setCoverageTab] = useState("Salud");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  const autosaveBaseline = useRef("");
  useEffect(() => {
    const signature = JSON.stringify(draft);
    if (!editable || !selected || !detail || !draft.contract.number.trim() || !draft.contract.insurer.trim() || busy) return;
    if (!autosaveBaseline.current && draft.policyId) { autosaveBaseline.current = signature; return; }
    if (autosaveBaseline.current === signature) return;
    const timer = window.setTimeout(() => {
      autosaveBaseline.current = signature;
      void savePolicy("draft");
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [draft, selected, detail, busy, editable]);
  const list = async () => {
    const [c, d] = await Promise.all([
      fetchManagedClients(),
      editable
        ? fetchUnassignedDocuments()
        : Promise.resolve({ documents: [] }),
    ]);
    setClients(c.clients);
    setUnassigned(d.documents);
  };
  useEffect(() => {
    let live = true;
    void list()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      loadSequence.current++;
    };
  }, [profile.id]);
  async function load(id: string, reset = false) {
    const sequence = ++loadSequence.current;
    const result = await fetchClientDetail(id);
    if (sequence !== loadSequence.current) return result;
    setDetail(result);
    if (reset) {
      const c = result.client;
      setClient({
        id: c.id,
        revision: c.revision,
        legal_name: c.legal_name || c.name,
        rut: c.rut || "",
        portfolio_status: c.portfolio_status,
        contact_name: c.contact_name || "",
        contact_email: c.contact_email || "",
        contact_phone: c.contact_phone || "",
      });
    }
    return result;
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  };
  async function chooseClient(id: string) {
    autosaveBaseline.current = "";
    setSelected(id);
    setDetail(null);
    setClient(blankClient());
    setDocument(null);
    setDraft(newDraft());
    setTab("client");
    setNotice("");
    if (!id) {
      ++loadSequence.current;
      setDetail(null);
      setClient(blankClient());
      return;
    }
    await act(async () => {
      await load(id, true);
    });
  }
  function choosePolicy(id: string, version?: PolicyVersion) {
    autosaveBaseline.current = "";
    if (!id) {
      setDraft(newDraft());
      return;
    }
    const policy = detail?.policies.find((p) => p.id === id),
      v = version ?? policy?.versions[0];
    if (!policy || !v) return;
    setCoverageTab(v.contract.coverages[0]?.type ?? "Salud");
    setDraft({
      policyId: id,
      expectedRevision: policy.versions[0].revision,
      changeType: policy.versions.some(
        (v) => v.validation_status === "validated",
      )
        ? "endorsement"
        : "initial",
      effectiveOn: today(),
      note: "",
      contract: structuredClone(sanitizeFunctionalContract(v.contract)),
    });
  }
  async function saveClient() {
    await act(async () => {
      const { id } = await saveManagedClient({
        ...client,
        id: client.id || null,
      });
      if (document && !document.client_id) {
        await assignPolicyDocument(document.id, id);
        setDocument({ ...document, client_id: id });
      }
      setSelected(id);
      await list();
      await load(id, true);
      setNotice(
        "Cliente guardado. Su nombre histórico de reportes y sus asignaciones se conservan.",
      );
    });
  }
  async function savePolicy(validationStatus: "draft" | "validated") {
    await act(async () => {
      if (!selected || !detail)
        throw new Error(
          "Guarda o selecciona el cliente antes de registrar pólizas.",
        );
      const contract = structuredClone(sanitizeFunctionalContract(draft.contract));
      // Un respaldo parcial no es un respaldo verificado; se puede completar después en borrador.
      for (const [key, e] of Object.entries(contract.evidence))
        if (!e.documentId || !e.quote.trim()) delete contract.evidence[key];
      for (const c of contract.coverages)
        for (const p of c.plans) {
          p.groups = p.groups.map((g) => g.trim()).filter(Boolean);
          for (const term of p.terms)
            if (!term.evidence?.quote.trim()) delete term.evidence;
        }
      const result = await saveManagedPolicy(selected, {
        ...draft,
        contract,
        validationStatus,
      });
      const updated = await load(selected);
      const policy = updated.policies.find((p) => p.id === result.id),
        v = policy?.versions[0];
      if (policy && v) {
        autosaveBaseline.current = "";
        setDraft({
          policyId: policy.id,
          expectedRevision: v.revision,
          changeType:
            validationStatus === "validated" ? "endorsement" : draft.changeType,
          effectiveOn: today(),
          note: "",
          contract: structuredClone(sanitizeFunctionalContract(v.contract)),
        });
      }
      setNotice(
        validationStatus === "validated"
          ? "Versión validada. Sus fechas contractuales ya están disponibles en la cartera."
          : "Nueva versión de borrador guardada. No modifica la vigencia verificada.",
      );
    });
  }
  async function applyFields(fields: ExtractedField[], doc: PolicyDocument) {
    if (selected && doc.client_id !== selected) {
      setError(
        "Asocia primero el documento a este cliente usando el botón de asociación.",
      );
      return;
    }
    if (!selected) {
      const get = (k: string) => { const values = fields.filter(f => f.key === k); return new Set(values.map(f => f.value)).size === 1 ? values[0]?.value ?? "" : ""; };
      const rutKey = (value: string) => value.replace(/[.\s-]/g, "").toUpperCase();
      const existing = clients.find(c => c.rut && rutKey(c.rut) === rutKey(get("rut")));
      if (existing) {
        await act(async () => {
          await assignPolicyDocument(doc.id, existing.id);
          setSelected(existing.id);
          await load(existing.id, true);
          setDocument(await fetchPolicyDocument(doc.id));
          await list();
          setNotice("Cliente existente identificado por RUT. Documento asociado; incorpora los datos revisados para preparar la póliza.");
        });
        return;
      }
      setClient((c) => ({
        ...c,
        legal_name: get("legal_name") || c.legal_name,
        rut: get("rut") || c.rut,
      }));
      setTab("client");
      setNotice(
        "Revisa razón social y RUT. Si el cliente ya existe, selecciónalo y asocia el documento en Documentos y renovaciones.",
      );
      return;
    }
    let contract = structuredClone(sanitizeFunctionalContract(draft.contract));
    try { contract = incorporateConditions(contract, doc.pages.flatMap(p => p.contractCandidates ?? []), doc.id); }
    catch (e) { setError((e as Error).message); return; }
    for (const key of [
      "number",
      "insurer",
      "startsOn",
      "endsOn",
      "commission",
      "broker",
    ] as const) {
      if (draft.policyId && (key === "number" || key === "insurer")) continue;
      const candidates = fields.filter((f) => f.key === key);
      const f = new Set(candidates.map(f => f.value)).size === 1 ? candidates[0] : undefined;
      if (!f) continue;
      contract[key] = f.value;
      contract.evidence[key] = {
        documentId: doc.id,
        page: f.page,
        quote: f.quote,
      };
    }
    for (const key of ["currency", "periodicity"] as const) {
      const candidates = fields.filter((f) => f.key === key);
      const f = new Set(candidates.map(f => f.value)).size === 1 ? candidates[0] : undefined;
      if (
        f &&
        (key === "currency"
          ? ["UF", "CLP", "USD"]
          : ["monthly", "quarterly", "semiannual", "annual", "single"]
        ).includes(f.value)
      ) {
        (contract as unknown as Record<string, unknown>)[key] = f.value;
        contract.evidence[key] = {
          documentId: doc.id,
          page: f.page,
          quote: f.quote,
        };
      }
    }
    for (const type of coverageTypes) {
      const f = fields.find(f => f.key === "coverage" && f.value === type);
      if (f && !contract.coverages.some(c => c.type === type)) {
        const id = crypto.randomUUID();
        contract.coverages.push({ id, type, name: type, plans: [] });
        contract.evidence[id] = { documentId: doc.id, page: f.page, quote: f.quote };
      }
    }
    setDraft({
      ...draft,
      contract,
      effectiveOn:
        draft.changeType !== "endorsement" && contract.startsOn
          ? contract.startsOn
          : draft.effectiveOn,
    });
    setCoverageTab(contract.coverages[0]?.type ?? "Salud");
    autosaveBaseline.current = "";
    setTab("policies");
    setNotice(
      "Datos revisados incorporados al formulario, aún sin guardar. Revisa importes, moneda, periodicidad, coberturas y evidencia antes de validar. Las condiciones extraídas se incorporaron por cobertura y plan; las ambiguas quedan pendientes de revisión.",
    );
  }
  const documents = detail?.documents ?? [];
  const visible = clients.filter((c) =>
    `${c.legal_name || c.name} ${c.rut || ""}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const duplicates = client.rut
    ? clients.filter(
        (c) =>
          c.id !== client.id &&
          c.rut?.replace(/[.\s-]/g, "").toUpperCase() ===
            client.rut.replace(/[.\s-]/g, "").toUpperCase(),
      )
    : [];
  const activeStep = notice.startsWith("Versión validada") ? 5 : tab === "documents" ? (document?.pages?.length ? 1 : 0) : tab === "client" ? 2 : tab === "review" ? 4 : 3;
  return (
    <main className="account-ui accounts-page portfolio-admin">
      <PageHeader
        eyebrow="Administración de cartera"
        title={
          selected
            ? detail?.client.legal_name || detail?.client.name || "Cliente"
            : "Clientes, pólizas y coberturas"
        }
        description="Gestiona contratos con respaldo documental, conserva sus versiones y vincula las sábanas históricas."
        actions={
          editable ? (
            <button
              className="account-primary"
              disabled={busy}
              onClick={() => chooseClient("")}
            >
              Nuevo cliente
            </button>
          ) : undefined
        }
      />
      <section className="portfolio-workflow" aria-label="Flujo documental">
        <div><span className="portfolio-kicker">NOERGON · CARTERA</span><h2>Del documento al contrato</h2><p>Sube tu póliza y construye una ficha con respaldo en cada paso.</p></div>
        <button className="account-primary" onClick={() => setTab("documents")}>↑ Subir póliza</button>
        <ol>{["Subir póliza", "Extraer información", "Identificar cliente", "Completar pestañas", "Revisar", "Guardar"].map((step, i) => <li key={step} aria-current={i === activeStep ? "step" : undefined}><span>{i + 1}</span>{step}</li>)}</ol>
        <progress className="portfolio-progress" max={6} value={activeStep + 1} aria-label="Paso del flujo documental"/>
        <small>Procesamiento local · Originales privados · Confirmación con evidencia</small>
      </section>
      <div className="contract-client-picker account-form mt-6">
        <label>
          Buscar por razón social o RUT
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Cliente
          <select
            disabled={busy}
            value={selected}
            onChange={(e) => chooseClient(e.target.value)}
          >
            <option value="">
              {editable
                ? "Crear cliente / importar PDF"
                : "Selecciona un cliente"}
            </option>
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name || c.name}
                {c.rut ? ` · ${c.rut}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p role="status">Consultando cartera…</p>}
      {error && (
        <p role="alert" className="account-error mt-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="contract-notice mt-4">
          {notice}
        </p>
      )}
      <nav aria-label="Secciones del cliente" className="contract-tabs mt-6">
        {tabs.map(([key, label]) => (
          <button
            disabled={busy}
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="glass-panel account-card mt-4" aria-busy={busy}>
        {tab === "review" && <div className="account-form">
          <h2>Revisión antes de confirmar</h2><p>Los candidatos extraídos siguen pendientes hasta su revisión documental. Guarda versiones de borrador durante la preparación.</p>
          <div className="portfolio-review-summary">{[["Cliente", client.legal_name], ["RUT", client.rut], ["Póliza", draft.contract.number], ["Aseguradora", draft.contract.insurer], ["Inicio", draft.contract.startsOn], ["Término", draft.contract.endsOn]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "Pendiente"}</strong></div>)}</div>
          <h3>Respaldo pendiente</h3>
          <ul>{["number", "insurer", "startsOn", "endsOn", "currency", "periodicity", ...[]].filter(key => !draft.contract.evidence[key]?.quote).map(key => <li key={key}>{({number:"Número de póliza",insurer:"Aseguradora",startsOn:"Inicio de vigencia",endsOn:"Término de vigencia",currency:"Moneda",periodicity:"Periodicidad"} as Record<string,string>)[key]}</li>)}</ul>
          <p>{draft.contract.coverages.length} coberturas · {draft.contract.coverages.reduce((n,c) => n + c.plans.length,0)} planes. Revisa condiciones, grupos y citas en Coberturas.</p>
          {editable && <div className="contract-actions"><button className="account-secondary" disabled={busy || !selected} onClick={() => savePolicy("draft")}>Guardar borrador</button><button className="account-primary" disabled={busy || !selected} onClick={() => savePolicy("validated")}>Confirmar contrato con respaldo</button></div>}
          <details><summary>Indicadores técnicos por póliza</summary>{detail ? <PolicyTechnicalPanel key={detail.client.id} detail={detail} editable={editable} onReviewAssignments={() => setTab("documents")}/> : <p>Selecciona un cliente.</p>}</details>
        </div>}
        {tab === "coverages" && <div className="account-form"><h2>Coberturas de esta póliza</h2><nav className="contract-tabs" aria-label="Coberturas">{coverageTypes.filter(type => draft.contract.coverages.some(c => c.type === type)).map(type => <button key={type} aria-current={coverageTab === type ? "page" : undefined} onClick={() => setCoverageTab(type)}>{type}</button>)}</nav>{editable && <label>Añadir cobertura presente en el documento<select value="" onChange={e => {const type = e.target.value as typeof coverageTypes[number]; if (!type) return; setCoverageTab(type); setDraft({...draft, contract:{...draft.contract, coverages:[...draft.contract.coverages,{id:crypto.randomUUID(),type,name:type,plans:[]}]}});}}><option value="">Seleccionar cobertura…</option>{coverageTypes.filter(type => !draft.contract.coverages.some(c => c.type === type)).map(type => <option key={type}>{type}</option>)}</select></label>}</div>}

        {tab === 'technical' ? (detail ? <PolicyTechnicalPanel key={detail.client.id} detail={detail} editable={editable} onReviewAssignments={()=>setTab('documents')}/> : <p>Selecciona un cliente para consultar una póliza individual.</p>) : tab === "review" ? null : tab === "client" ? (
          <div className="account-form">
            <h2>Datos del cliente</h2>
            <div className="contract-grid">
              {(
                [
                  ["legal_name", "Razón social"],
                  ["rut", "RUT con dígito verificador"],
                  ["contact_name", "Contacto"],
                  ["contact_email", "Correo del contacto"],
                  ["contact_phone", "Teléfono"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    disabled={!editable || busy}
                    type={key === "contact_email" ? "email" : "text"}
                    value={client[key]}
                    onChange={(e) =>
                      setClient({ ...client, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Estado del cliente
                <select
                  disabled={!editable || busy}
                  value={client.portfolio_status}
                  onChange={(e) =>
                    setClient({ ...client, portfolio_status: e.target.value })
                  }
                >
                  <option value="prospect">Prospecto</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
            </div>
            {duplicates.length > 0 && (
              <p role="alert">
                Ese RUT ya está registrado:{" "}
                {duplicates.map((c) => (
                  <button
                    className="portfolio-link"
                    key={c.id}
                    disabled={busy}
                    onClick={() => chooseClient(c.id)}
                  >
                    {c.legal_name || c.name}
                  </button>
                ))}
                . Selecciona el cliente existente.
              </p>
            )}
            {selected && (
              <p className="account-muted">
                KAM de cartera: {detail?.client.kam_name || "Sin asignar"} ·
                Jefe: {detail?.client.manager_name || "Sin asignar"}. Las
                asignaciones de acceso se administran en Usuarios y clientes; el
                KAM contractual se registra en cada póliza.
              </p>
            )}
            {editable && (
              <div className="contract-actions">
                <button
                  className="account-primary"
                  disabled={
                    busy ||
                    !client.legal_name.trim() ||
                    !!duplicates.length ||
                    (!!selected && !detail)
                  }
                  onClick={saveClient}
                >
                  {busy ? "Guardando…" : "Guardar cliente"}
                </button>
                <button
                  className="account-secondary"
                  onClick={() => setTab("documents")}
                >
                  Crear desde un PDF
                </button>
              </div>
            )}
          </div>
        ) : tab === "documents" ? (
          <div className="account-form">
            <h2>Documentos, renovaciones y endosos</h2>
            <p className="account-muted">
              Originales privados. Extracción y OCR locales; los documentos no
              se envían a servicios de extracción externos.
            </p>
            {editable && (
              <label>
                Cargar póliza PDF (hasta 20 MB, 80 páginas para extracción)
                <input
                  disabled={busy}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void act(async () => {
                        if (file.size > 20 * 1024 * 1024)
                          throw new Error("El PDF supera 20 MB.");
                        const result = await uploadPolicyDocument(
                          file,
                          selected,
                        );
                        setDocument(await fetchPolicyDocument(result.id));
                        await list();
                        if (selected) await load(selected);
                        if (!result.duplicate) {
                          setNotice("Original guardado. Extrayendo texto y tablas localmente; se aplicará OCR si hace falta…");
                          await extractPolicyDocument(result.id);
                          setDocument(await fetchPolicyDocument(result.id));
                          await list();
                          if (selected) await load(selected);
                        }
                        setNotice(result.duplicate ? "Documento existente recuperado; no se duplicó." : "Extracción local terminada. Revisa candidatos, campos pendientes y páginas antes de incorporarlos.");
                      });
                  }}
                />
              </label>
            )}
            {[...documents, ...unassigned].map((d) => (
              <div className="contract-document" key={d.id}>
                <button
                  className="portfolio-link"
                  onClick={() =>
                    act(async () => {
                      setDocument(await fetchPolicyDocument(d.id));
                    })
                  }
                >
                  {d.original_name}
                </button>
                <span>
                  {
                    {
                      uploaded: "Original guardado",
                      processing: "Procesando",
                      review: "Pendiente de revisión",
                      failed: "Extracción fallida",
                    }[d.status]
                  }
                  {!d.client_id ? " · Sin cliente" : ""}
                </span>
                {editable && selected && !d.client_id && (
                  <button
                    className="account-secondary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await assignPolicyDocument(d.id, selected);
                        await list();
                        await load(selected);
                        if (document?.id === d.id)
                          setDocument(await fetchPolicyDocument(d.id));
                      })
                    }
                  >
                    Asociar a este cliente
                  </button>
                )}
              </div>
            ))}
            {document && (
              <PolicyDocumentReview
                key={document.id}
                document={document}
                editable={editable && !busy}
                onApply={applyFields}
                onUpdated={() => {
                  void list().catch((e) => setError(e.message));
                  if (selected)
                    void load(selected).catch((e) => setError(e.message));
                }}
              />
            )}
            {detail && (
              <>
                <h3 className="mt-6">Historial de contratos</h3>
                <div className="portfolio-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Aseguradora / póliza</th>
                        <th>Versión / cambio</th>
                        <th>Vigencia</th>
                        <th>Efecto</th>
                        <th>Validación</th>
                        <th>Consulta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.policies.flatMap((p) =>
                        p.versions.map((v) => (
                          <tr key={v.id}>
                            <td>
                              {v.contract.insurer} · {v.contract.number}
                            </td>
                            <td>
                              {v.revision} ·{" "}
                              {
                                {
                                  initial: "Inicial",
                                  renewal: "Renovación",
                                  endorsement: "Endoso",
                                }[v.change_type]
                              }
                            </td>
                            <td>
                              {v.contract.startsOn || "Pendiente"} —{" "}
                              {v.contract.endsOn || "Pendiente"}
                            </td>
                            <td>{v.effective_on}</td>
                            <td>
                              {v.validation_status === "validated"
                                ? "Validada"
                                : "Borrador"}
                            </td>
                            <td>
                              <button
                                className="portfolio-link"
                                onClick={() => {
                                  choosePolicy(p.id, v);
                                  setTab("policies");
                                }}
                              >
                                Consultar / preparar nueva versión
                              </button>
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <PortfolioReconciliation
                  detail={detail}
                  editable={editable}
                  onUpdated={() => {
                    void load(selected).catch((e) => setError(e.message));
                  }}
                />
                <details className="mt-6">
                  <summary>
                    Auditoría de cambios ({detail.audit.length})
                  </summary>
                  {detail.audit.map((a) => (
                    <p key={a.id}>
                      {new Date(a.created_at).toLocaleString("es-CL")} ·{" "}
                      {a.entity} · {a.action} · Usuario{" "}
                      {a.actor_id || "Migración / sistema"}
                    </p>
                  ))}
                </details>
              </>
            )}
          </div>
        ) : (
          <>
            {!selected ? (
              <p>
                Selecciona o guarda un cliente para administrar sus pólizas.
              </p>
            ) : (
              <>
                <div className="contract-actions account-form">
                  <label>
                    Póliza
                    <select
                      disabled={busy}
                      value={draft.policyId ?? ""}
                      onChange={(e) => choosePolicy(e.target.value)}
                    >
                      <option value="">Nueva póliza</option>
                      {detail?.policies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.versions[0]?.contract.insurer} ·{" "}
                          {p.versions[0]?.contract.number} · v
                          {p.versions[0]?.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.policyId && (
                    <p className="account-muted">
                      Se creará la versión {draft.expectedRevision + 1}. Las
                      versiones anteriores se conservan.
                    </p>
                  )}
                </div>
                <PolicyContractForm
                  draft={draft}
                  onChange={setDraft}
                  documents={documents}
                  tab={tab === "coverages" ? coverageTab : tab}
                  editable={editable && !busy}
                />
                {editable && (
                  <div className="contract-actions contract-save">
                    <button
                      className="account-secondary"
                      disabled={busy}
                      onClick={() => savePolicy("draft")}
                    >
                      Guardar nueva versión como borrador
                    </button>
                    <button
                      className="account-primary"
                      disabled={busy}
                      onClick={() => setTab("review")}
                    >
                      Ir a revisión
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
