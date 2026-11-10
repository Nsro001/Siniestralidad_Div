import { isExcludedContractCandidate } from "../../../shared/contractPolicy.mjs";
import { useEffect, useState } from "react";
import type { ExtractedField, PolicyDocument } from "../../../shared/portfolio";
import {
  extractPolicyDocument,
  fetchPolicyDocument,
  openPolicyOriginal,
} from "../api";
import ContractExtractionReview from "./ContractExtractionReview";
const statusLabels: Record<string, string> = {
  uploaded: "Original guardado",
  processing: "Procesando",
  review: "Pendiente de revisión",
  failed: "Extracción fallida",
};
const fieldLabels: Record<string, string> = {
  legal_name: "Razón social",
  rut: "RUT",
  insurer: "Aseguradora",
  number: "Número de póliza",
  startsOn: "Inicio de vigencia",
  endsOn: "Término de vigencia",
  commission: "Comisión",
  broker: "Corredor",
  currency: "Moneda",
  periodicity: "Periodicidad",
  plan: "Plan / grupo",
  condition: "Condición / prestación",
  coverage: "Cobertura",
  premiumPerInsured: "Prima por asegurado (no es prima total)",
  cmf: "Código CMF",
  renewal: "Renovación",
};
export default function PolicyDocumentReview({
  document,
  onApply,
  onUpdated,
  editable,
}: {
  document: PolicyDocument;
  onApply: (fields: ExtractedField[], doc: PolicyDocument) => void;
  onUpdated: () => void;
  editable: boolean;
}) {
  const [password, setPassword] = useState("");
  const [doc, setDoc] = useState(document),
    [fields, setFields] = useState((document.fields ?? []).filter(f=>!isExcludedContractCandidate(f))),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => { setDoc(document); setFields((document.fields ?? []).filter(f=>!isExcludedContractCandidate(f))); }, [document]);
  const load = async () => {
    const d = await fetchPolicyDocument(doc.id);
    setDoc(d);
    setFields(d.fields.filter(f=>!isExcludedContractCandidate(f)));
  };
  async function process() {
    setBusy(true);
    setError("");
    try {
      await extractPolicyDocument(doc.id, forceOcr, password);
      await load();
      onUpdated();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo extraer el documento.",
      );
      await load().catch(() => {});
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function original() {
    try {
      const result = await openPolicyOriginal(doc.id);
      window.open(`${result.url}#page=${page}`,  "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const [forceOcr, setForceOcr] = useState(false);
  const current = doc.pages?.find((p) => p.page === page);
  return (
    <section className="contract-review">
      <div className="contract-actions">
        <h3>{doc.original_name}</h3>
        <button type="button" className="account-secondary" onClick={original}>
          Abrir original privado
        </button>
        {editable && (
          <button
            type="button"
            className="account-secondary"
            disabled={busy}
            onClick={process}
          >
            {busy ? "Procesando localmente…" : "Extraer texto y OCR"}
          </button>
        )}
        <button
          type="button"
          className="account-secondary"
          disabled={busy}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Consultar resultado
        </button>
      </div>
      <p className="account-muted">
        Estado: {statusLabels[doc.status] || doc.status}. La extracción propone
        datos; revisa cada valor con su página antes de incorporarlo. Tablas
        disponibles como filas del texto original.
      </p>
      {(error || doc.error) && (
        <p role="alert" className="account-error">
          {error || doc.error}
        </p>
      )}
      {editable && <label>Contraseña de apertura (solo si el PDF la solicita)<input type="password" autoComplete="off" value={password} disabled={busy} maxLength={256} onChange={e => setPassword(e.target.value)} /><small>Se usa únicamente durante esta extracción y se elimina del formulario al terminar.</small></label>}
      {editable && (
        <label>
          <input
            type="checkbox"
            checked={forceOcr}
            disabled={busy}
            onChange={(e) => setForceOcr(e.target.checked)}
          />{" "}
          Aplicar OCR también a páginas con texto digital (documentos mixtos)
        </label>
      )}
      {busy && (
        <p role="status">
          El original está guardado. El OCR puede tardar varios minutos; puedes
          volver a consultar el resultado.
        </p>
      )}
      {!!doc.pages?.length && <aside className="contract-notice"><strong>Extracción pendiente de validación</strong><p>No detectados: {["legal_name","rut","insurer","number","startsOn","endsOn","currency","periodicity"].filter(key => !fields.some(f => f.key === key)).map(key => fieldLabels[key]).join(", ") || "Sin ausencias en los campos básicos; revisa condiciones y evidencia."}</p><p>Valores en conflicto: {["legal_name","rut","insurer","number","startsOn","endsOn"].filter(key => new Set(fields.filter(f => f.key === key).map(f => f.value)).size > 1).map(key => fieldLabels[key]).join(", ") || "Sin conflictos detectados en campos básicos"}.</p></aside>}
      <ContractExtractionReview document={doc} editable={editable && !busy} password={password} onApply={updated=>onApply(fields,updated)}/>
      {!!doc.pages?.length && (
        <div className="contract-review-grid">
          <div>
            <label>
              Página
              <select
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {doc.pages.map((p) => (
                  <option key={p.page}>{p.page}</option>
                ))}
              </select>
            </label>
            <p className="account-muted">
              Método:{" "}
              {current?.method === "ocr" ? "OCR local" : "Texto digital"}
            </p>
            <p className="account-muted">{current?.sections?.join(" · ") || "Sección sin clasificar"}</p>
            <pre className="contract-page-text">{current?.text}</pre>
            {!!current?.tables?.length && (
              <details>
                <summary>
                  Filas tabulares detectadas ({current.tables.length})
                </summary>
                <div className="portfolio-table">
                  <table>
                    <tbody>
                      {current.tables.map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
          <div>
            <h4>Datos propuestos y correcciones</h4>
            <p className="account-muted">
              Las correcciones se guardan al crear/guardar el cliente o la
              versión de póliza. La cita original se conserva.
            </p>
            {fields.length ? (
              <>
                {fields.map((field, i) => (
                  <label key={i} className="contract-candidate">
                    {fieldLabels[field.key] || field.key} ·{" "}
                    <button
                      type="button"
                      className="portfolio-link"
                      onClick={() => setPage(field.page)}
                    >
                      pág. {field.page}
                    </button>
                    <input
                      disabled={!editable}
                      value={field.value}
                      onChange={(e) =>
                        setFields((old) =>
                          old.map((f, n) =>
                            n === i ? { ...f, value: e.target.value } : f,
                          ),
                        )
                      }
                    />
                    <small>{field.quote}</small>
                  </label>
                ))}
                {editable && (
                  <button
                    type="button"
                    className="account-primary"
                    onClick={() => onApply(fields, doc)}
                  >
                    Usar datos revisados en el formulario
                  </button>
                )}
              </>
            ) : (
              <p>
                No se identificaron campos automáticamente. Puedes consultar las
                páginas y completar el formulario con su respaldo.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
