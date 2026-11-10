import { useEffect, useState } from "react";
import type { Evidence, PolicyDocument } from "../../../shared/portfolio";
import { fetchPolicyDocument } from "../api";
export default function ContractEvidence({
  value,
  documents,
  onChange,
  disabled = false,
}: {
  value?: Evidence;
  documents: PolicyDocument[];
  onChange: (value: Evidence | undefined) => void;
  disabled?: boolean;
}) {
  const [doc, setDoc] = useState<PolicyDocument | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setDoc(null);
    setError("");
    if (value?.documentId)
      void fetchPolicyDocument(value.documentId)
        .then((d) => {
          if (live) setDoc(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [value?.documentId]);
  const page = doc?.pages.find((p) => p.page === value?.page);
  return (
    <details className="contract-evidence">
      <summary>
        {value?.quote
          ? `Respaldo · página ${value.page}`
          : "Agregar respaldo documental"}
      </summary>
      <label>
        Documento
        <select
          disabled={disabled}
          value={value?.documentId ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { documentId: e.target.value, page: 1, quote: "" }
                : undefined,
            )
          }
        >
          <option value="">Sin respaldo</option>
          {documents
            .filter((d) => d.status === "review")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.original_name}
              </option>
            ))}
        </select>
      </label>
      {value && (
        <>
          <label>
            Página
            <select
              disabled={disabled}
              value={value.page}
              onChange={(e) =>
                onChange({ ...value, page: Number(e.target.value), quote: "" })
              }
            >
              {(doc?.pages ?? [{ page: 1 }]).map((p) => (
                <option key={p.page}>{p.page}</option>
              ))}
            </select>
          </label>
          {page && (
            <details>
              <summary>Consultar texto de la página</summary>
              <pre className="contract-page-text">{page.text}</pre>
            </details>
          )}
          <label>
            Cita exacta del documento
            <textarea
              disabled={disabled}
              value={value.quote}
              onChange={(e) => onChange({ ...value, quote: e.target.value })}
              placeholder="Copia el fragmento que respalda este dato, conservando su texto original."
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
