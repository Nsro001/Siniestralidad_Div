import { useState } from "react";
import type {
  Evidence,
  PolicyDocument,
  PortfolioDetail,
} from "../../../shared/portfolio";
import { fetchSnapshot, savePremiumMovement, saveRowLink, removeRowLink } from "../api";
import ContractEvidence from "./ContractEvidence";
export default function PortfolioReconciliation({
  detail,
  editable,
  onUpdated,
}: {
  detail: PortfolioDetail;
  editable: boolean;
  onUpdated: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Awaited<
      ReturnType<typeof fetchSnapshot>
    > | null>(null),
    [snapshotId, setSnapshotId] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [row, setRow] = useState(0),
    [policyId, setPolicyId] = useState(""),
    [versionId, setVersionId] = useState(""),
    [coverage, setCoverage] = useState("Salud"),
    [allocation, setAllocation] = useState("100");
  const [removal,setRemoval]=useState<{rowIndex:number;versionId:string;coverage:string}|null>(null),[removalReason,setRemovalReason]=useState('');
  const [movement, setMovement] = useState({
    id: crypto.randomUUID(),
    policyId: "",
    movement_type: "collected",
    amount: "",
    currency: "UF",
    period: "",
    occurred_on: "",
    source_reference: "",
    evidence: undefined as Evidence | undefined,
  });
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage("Guardado.");
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function load(id: string, offset = 0) {
    setError("");
    try {
      setSnapshot(await fetchSnapshot(id, offset));
      setRow(offset);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="contract-panel account-form">
      <h3>Primas y gastos: conciliación e historia</h3>
      <p className="account-muted">
        Las asociaciones no crean primas ni alteran reportes. La prima
        contractual, la sábana, la estimación y los cobros se conservan
        separados. Los porcentajes de asignación de una fila no pueden superar
        100%.
      </p>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <label>
        Versión de sábana
        <select
          value={snapshotId}
          onChange={(e) => {
            setSnapshotId(e.target.value);
            setRemoval(null);setRemovalReason('');
            setSnapshot(null);
            if (e.target.value) void load(e.target.value);
          }}
        >
          <option value="">Selecciona una versión</option>
          {detail.snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind} · {new Date(s.created_at).toLocaleString("es-CL")} ·{" "}
              {s.row_count} filas
            </option>
          ))}
        </select>
      </label>
      {snapshot && (
        <>
          <div className="portfolio-table">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Período</th>
                  <th>Póliza de origen</th>
                  <th>Cobertura</th>
                  <th>Importe UF de sábana</th>
                  <th>Vínculos registrados</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        type="button"
                        className="portfolio-link"
                        onClick={() => setRow(snapshot.offset + i)}
                        aria-pressed={row === snapshot.offset + i}
                      >
                        {snapshot.offset + i + 1}
                        {row === snapshot.offset + i ? " ✓" : ""}
                      </button>
                    </td>
                    <td>{String(r.period ?? "")}</td>
                    <td>{String(r.policy ?? "Sin número")}</td>
                    <td>{String(r.coverage ?? "")}</td>
                    <td>{String(r.premiumUf ?? r.reembolsoUf ?? "")}</td>
                    <td>
                      {snapshot.links
                        .filter((l) => l.row_index === snapshot.offset + i)
                        .map((l) => (
                          <p key={`${l.policy_version_id}-${l.coverage}`}>
                            {
                              detail.policies.find((p) => p.id === l.policy_id)
                                ?.versions[0]?.contract.number
                            }{" "}
                            · {l.coverage} · {l.allocation_percent}%
                            {editable&&<button className="account-secondary" disabled={busy} onClick={()=>{setRemoval({rowIndex:l.row_index,versionId:l.policy_version_id,coverage:l.coverage});setRemovalReason('');}}>Retirar vínculo erróneo</button>}
                          </p>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="contract-actions">
            <button
              type="button"
              className="account-secondary"
              disabled={!snapshot.offset}
              onClick={() => load(snapshotId, snapshot.offset - 50)}
            >
              Anterior
            </button>
            <span>
              {snapshot.offset + 1}–
              {Math.min(snapshot.offset + 50, snapshot.total)} de{" "}
              {snapshot.total}
            </span>
            <button
              type="button"
              className="account-secondary"
              disabled={snapshot.offset + 50 >= snapshot.total}
              onClick={() => load(snapshotId, snapshot.offset + 50)}
            >
              Siguiente
            </button>
          </div>
          {editable && (
            <>
            {removal&&<section className="contract-panel"><p>Retirar asociación de fila {removal.rowIndex+1} · {removal.coverage}. La fila original se conserva.</p><label>Motivo del retiro sin datos personales<textarea value={removalReason} onChange={e=>setRemovalReason(e.target.value)}/></label><button className="account-secondary" disabled={busy||removalReason.trim().length<3} onClick={()=>act(async()=>{await removeRowLink({snapshotId,...removal,reason:removalReason});setRemoval(null);await load(snapshotId,snapshot.offset);})}>Confirmar retiro de vínculo</button><button className="account-secondary" disabled={busy} onClick={()=>setRemoval(null)}>Cancelar retiro</button></section>}
            <div className="contract-grid">
              <p>Asignar fila {row + 1}</p>
              <label>
                Póliza
                <select
                  value={policyId}
                  onChange={(e) => {
                    setPolicyId(e.target.value);
                    setVersionId("");
                  }}
                >
                  <option value="">Selecciona</option>
                  {detail.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.versions[0]?.contract.insurer} ·{" "}
                      {p.versions[0]?.contract.number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Versión contractual validada
                <select
                  value={versionId}
                  onChange={(e) => setVersionId(e.target.value)}
                >
                  <option value="">Selecciona vigencia / versión</option>
                  {detail.policies
                    .find((p) => p.id === policyId)
                    ?.versions.filter(
                      (v) => v.validation_status === "validated",
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.revision} · {v.contract.startsOn} —{" "}
                        {v.contract.endsOn} · Efecto {v.effective_on}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cobertura
                <select
                  value={coverage}
                  onChange={(e) => setCoverage(e.target.value)}
                >
                  {["Vida", "Salud", "Dental", "Catastrófico"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Asignación (%)
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !policyId || !versionId}
                className="account-secondary"
                onClick={() =>
                  act(async () => {
                    await saveRowLink({
                      snapshotId,
                      rowIndex: row,
                      policyId,
                      versionId,
                      coverage,
                      allocation: Number(allocation),
                    });
                    await load(snapshotId, snapshot.offset);
                  })
                }
              >
                Guardar vínculo
              </button>
            </div>
            </>
          )}
        </>
      )}
      <h3 className="mt-6">Movimientos acreditados</h3>
      <p className="account-muted">
        Un importe cargado en la sábana no se considera cobrado automáticamente.
        Registra cada cobro/factura con referencia única y respaldo.
      </p>
      {editable && (
        <>
          <div className="contract-grid">
            <label>
              Póliza
              <select
                value={movement.policyId}
                onChange={(e) =>
                  setMovement({ ...movement, policyId: e.target.value })
                }
              >
                <option value="">Selecciona</option>
                {detail.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.versions[0]?.contract.insurer} ·{" "}
                    {p.versions[0]?.contract.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={movement.movement_type}
                onChange={(e) =>
                  setMovement({ ...movement, movement_type: e.target.value })
                }
              >
                <option value="collected">Cobro acreditado</option>
                <option value="invoiced">Facturación</option>
                <option value="adjustment">Ajuste (admite negativos)</option>
              </select>
            </label>
            {(
              [
                ["amount", "Importe (punto decimal)", "text"],
                ["period", "Período", "month"],
                ["occurred_on", "Fecha del movimiento", "date"],
                ["source_reference", "Referencia única de origen", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type}
                  value={movement[key]}
                  onChange={(e) =>
                    setMovement({ ...movement, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Moneda
              <select
                value={movement.currency}
                onChange={(e) =>
                  setMovement({ ...movement, currency: e.target.value })
                }
              >
                <option>UF</option>
                <option>CLP</option>
                <option>USD</option>
              </select>
            </label>
          </div>
          <ContractEvidence
            documents={detail.documents as PolicyDocument[]}
            value={movement.evidence}
            onChange={(evidence) => setMovement({ ...movement, evidence })}
          />
          <button
            type="button"
            className="account-secondary"
            disabled={busy || !movement.policyId}
            onClick={() =>
              act(async () => {
                await savePremiumMovement({
                  ...movement,
                  clientId: detail.client.id,
                });
                setMovement({
                  ...movement,
                  id: crypto.randomUUID(),
                  amount: "",
                  source_reference: "",
                });
              })
            }
          >
            Registrar movimiento
          </button>
        </>
      )}
      <div className="portfolio-table">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Período</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {detail.movements?.map((m) => (
              <tr key={m.id}>
                <td>
                  {
                    {
                      collected: "Cobrado",
                      invoiced: "Facturado",
                      adjustment: "Ajuste",
                    }[m.movement_type]
                  }
                </td>
                <td>{m.period}</td>
                <td>{m.occurred_on}</td>
                <td>
                  {m.amount} {m.currency}
                </td>
                <td>{m.source_reference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
