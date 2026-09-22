import { useEffect, useRef, useState } from "react";
import { fetchMonthlyDetail } from "../api";
import type { MonthlyDetail } from "../../../shared/monthly";
const number = (value: number | null) => value === null ? "Sin datos" : value.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const uf = (value: number | null) => value === null ? "Sin datos" : `${number(value)} UF`;
export default function MonthlyDetailPanel({ client, coverage, period, onClose }: { client: string; coverage: string; period: string; onClose: () => void }) {
  const [data, setData] = useState<MonthlyDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(""); panel.current?.focus();
    fetchMonthlyDetail({ client, coverage, period }).then(value => { if (!cancelled) setData(value); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el detalle."); });
    return () => { cancelled = true; };
  }, [client, coverage, period, retry]);
  return <section ref={panel} tabIndex={-1} aria-label={`Detalle de ${period}, ${coverage}`} className="monthly-detail account-ui mt-4" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
  }}>
    <div className="portfolio-heading"><div><h3 className="font-display text-xl">¿Qué pasó en {period}?</h3><p className="account-muted">{coverage} · {client}</p></div><button className="account-secondary" onClick={onClose}>Cerrar detalle</button></div>
    {error ? <div role="alert" className="account-error mt-4">{error} <button onClick={() => setRetry(value => value + 1)}>Reintentar</button></div> : !data ? <p role="status" className="mt-4">Analizando el mes…</p> : <>
      <p className="account-muted text-sm mt-4">Comparación con el promedio de los tres meses calendario anteriores que tienen primas y gastos para esta cobertura. Meses usados: {data.baselinePeriods.join(", ") || "ninguno"}.{data.missingBaselinePeriods.length > 0 && ` Sin datos comparables: ${data.missingBaselinePeriods.join(", ")}.`} Se consulta el historial cargado, aunque esté fuera del período visible del gráfico.</p>
      <div className="portfolio-table mt-4"><table><thead><tr><th>Indicador</th><th>Mes seleccionado</th><th>Referencia anterior</th></tr></thead><tbody>
        {[
          ["Prima", uf(data.premiumUf), uf(data.averagePremiumUf)],
          ["Gasto del gráfico (sábana de primas)", uf(data.chartSpendUf), uf(data.averageChartSpendUf)],
          ["Reembolso analizado", uf(data.analyzedUf), uf(data.averageExpenseUf)],
          ["Líneas con reembolso", number(data.lines), number(data.averageLines)],
          ["Personas identificadas con uso", number(data.patients), number(data.averagePatients)],
          ["Monto por línea", uf(data.perLineUf), uf(data.averagePerLineUf)],
        ].map(([label, value, average]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{average}</td></tr>)}
      </tbody></table></div>
      <p className="account-muted text-sm mt-3">Las líneas no equivalen necesariamente a atenciones o siniestros. Monto de referencia por línea: total reembolsado / total de líneas de los meses comparables. {data.unidentifiedLines} líneas del mes sin identificación de paciente.</p>
      {data.insights.length > 0 && <ul className="monthly-insights mt-4">{data.insights.map(text => <li key={text}>{text}</li>)}</ul>}
      <h4 className="font-display text-lg mt-6">Prestaciones que explican la variación</h4>
      {data.analyzedUf === null ? <p>Sin detalle de gastos para este mes.</p> : <div className="portfolio-table"><table><thead><tr><th>Prestación</th><th>Mes</th><th>Promedio anterior</th><th>Variación UF</th></tr></thead><tbody>{data.prestations.map(row => <tr key={row.name}><td>{row.name}</td><td>{uf(row.amountUf)}</td><td>{uf(row.averageUf)}</td><td>{row.increaseUf !== null && row.increaseUf > 0 ? "+" : ""}{uf(row.increaseUf)}</td></tr>)}</tbody></table></div>}
      <p className="mt-4"><strong>Hospitalización clasificada: {uf(data.hospitalUf)}</strong>{data.hospitalShare !== null && ` (${number(data.hospitalShare * 100)} % del reembolso analizado)`}.</p>
      <p className="account-muted text-sm">Incluye únicamente Clasif.Cob = Hospitalización, Gastos hospitalarios u Hospitalarios (sin distinguir mayúsculas ni tildes). Otras categorías quedan en el desglose.</p>
      <div className="accounts-grid mt-6">{[{ title: "Principales prestadores", rows: data.providers }, { title: "Concentración por paciente", rows: data.cases }].map(group => <section key={group.title}><h4 className="font-display text-lg">{group.title}</h4>{group.rows.length ? <ul className="monthly-ranking">{group.rows.map(row => <li key={row.name}><span>{row.name}</span><strong>{uf(row.amountUf)} · {number(row.share * 100)} %</strong></li>)}</ul> : <p className="account-muted">Sin datos.</p>}</section>)}</div>
      <p className="account-muted text-sm mt-3">Los casos son pacientes identificados, numerados por monto dentro de este mes; no representan episodios clínicos. No se muestran sus RUT.</p>
      <details className="mt-6" open={data.differenceUf !== null && Math.abs(data.differenceUf) > .01}><summary>Conciliación de los montos</summary><p className="mt-2">Gasto del gráfico: {uf(data.chartSpendUf)}. Reembolso total de la sábana de gastos: {uf(data.rawExpenseUf)}. Diferencia (gráfico − reembolsos): {uf(data.differenceUf)}.</p><p className="account-muted text-sm mt-2">Monto neto fuera del análisis: {uf(data.excludedUf)}. El desglose considera reembolsos positivos y aplica las mismas exclusiones de prestaciones que el reporte de distribución. La conciliación usa todas las filas, incluidos ajustes negativos. Si hay diferencias, el detalle no explica por completo el gasto del gráfico.</p></details>
    </>}
  </section>;
}
