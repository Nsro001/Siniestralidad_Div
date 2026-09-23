import { useEffect, useState } from "react";
import { fetchPortfolio } from "../api";
import type { AccountProfile, Portfolio } from "../types";

const uf = (value: number | null) => value === null ? "Sin datos" : `${value.toLocaleString("es-CL", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} UF`;
const month = (period: string | null) => period ? new Date(`${period}-01T12:00:00Z`).toLocaleDateString("es-CL", { month: "short", year: "numeric", timeZone: "UTC" }) : "Sin primas";
export default function PortfolioDashboard({ profile, onOpenClient }: { profile: AccountProfile; onOpenClient: (name: string) => void }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [kam, setKam] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    setData(null); setError("");
    setUpdatedAt(null);
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const result = await fetchPortfolio();
        if (!cancelled) {
          setData(result); setError(""); setUpdatedAt(new Date());
          setKam(current => result.clients.some(client => client.kam === current) ? current : "");
        }
      } catch (err) {
        if (!cancelled) {
          setData(null); setUpdatedAt(null);
          setError(err instanceof Error ? err.message : "No se pudo cargar la cartera.");
        }
      } finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload, profile.id]);
  const clients = (data?.clients ?? []).filter(c => (!kam || c.kam === kam) && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const kams = [...new Set(data?.clients.map(c => c.kam) ?? [])].sort();
  const annual = clients.filter(c => c.annualPremiumUf !== null).reduce((sum, c) => sum + c.annualPremiumUf!, 0);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const limit = new Date(`${today}T12:00:00Z`); limit.setUTCDate(limit.getUTCDate() + 90);
  const horizon = limit.toISOString().slice(0, 10);
  const renewals = clients.flatMap(c => c.renewals.map(date => ({ client: c, date })))
    .filter(r => r.date >= `${today.slice(0, 7)}-01` && r.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
  const missing = clients.filter(c => !c.renewals.length).length;
  return <main className="account-ui accounts-page portfolio-page">
    <div className="portfolio-heading">
      <div><p className="account-eyebrow">Cartera de clientes</p><h1 className="font-display text-3xl mt-2">{profile.role === "manager" ? "Mi equipo" : profile.role === "admin" ? "Vista general" : "Mi cartera"}</h1>
        <p className="account-muted mt-3">Clientes, primas y próximas renovaciones en un solo lugar.</p></div>
      <button className="account-secondary" onClick={() => setReload(value => value + 1)}>Actualizar</button>
    </div>
    {updatedAt && <p className="account-muted text-sm mt-3">Última consulta: {updatedAt.toLocaleTimeString("es-CL")} · Actualización automática cada minuto.</p>}
    {error ? <p role="alert" className="account-error mt-4">{error}</p> : !data ? <p role="status" className="mt-6">Cargando cartera…</p> : <>
      <div className="portfolio-filters account-form mt-6">
        {profile.role !== "executive" && <label>KAM<select value={kam} onChange={e => setKam(e.target.value)}><option value="">Todos los KAM</option>{kams.map(name => <option key={name}>{name}</option>)}</select></label>}
        <label>Buscar cliente<input type="search" placeholder="Nombre del cliente" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      <div className="portfolio-stats mt-6">
        <section className="glass-panel account-card"><p className="account-muted">Clientes</p><strong>{clients.length}</strong><span>en la cartera seleccionada</span></section>
        <section className="glass-panel account-card"><p className="account-muted">Prima anual estimada</p><strong>{uf(clients.some(c => c.annualPremiumUf !== null) ? annual : null)}</strong><span>Último mes de cada cliente × 12</span></section>
        <section className="glass-panel account-card"><p className="account-muted">Renovaciones próximas</p><strong>{renewals.length}</strong><span>Mes en curso y próximos 90 días · {missing} sin período</span></section>
      </div>
      <section className="glass-panel account-card mt-6">
        <h2 className="font-display text-xl">Próximas renovaciones</h2>
        <p className="account-muted text-sm mt-2">Estimadas por el mes del primer período disponible de cada cliente; se repiten anualmente.</p>
        {renewals.length ? <ul className="portfolio-renewals mt-4">{renewals.map(({ client, date }) => <li key={`${client.id}-${date}`}><div><button className="portfolio-link" onClick={() => onOpenClient(client.name)}>{client.name}</button><p className="account-muted text-sm">{client.kam}</p></div><time dateTime={date}>{month(date.slice(0, 7))}</time></li>)}</ul> : <p className="account-muted mt-3">{missing === clients.length && clients.length ? "Carga los períodos de primas para estimar las renovaciones." : "No hay renovaciones estimadas en el mes en curso ni en los próximos 90 días."}</p>}
      </section>
      <section className="glass-panel account-card mt-6">
        <h2 className="font-display text-xl">Clientes de la cartera</h2>
        <p className="account-muted text-sm mt-2">Clientes con primas cargadas. Prima mensual: suma de coberturas del último período disponible. Titulares y cargas: solo Salud del último mes disponible.</p>
        {!clients.length ? <p className="mt-6">{data.clients.length ? "No hay clientes para estos filtros." : "Todavía no tienes clientes en tu cartera. El administrador debe cargar las primas y vincular las cuentas a sus KAM o jefes."}</p> : <div className="portfolio-table mt-4"><table><thead><tr><th>Cliente / KAM</th><th>Último mes</th><th>Prima mensual</th><th>Prima anual estimada</th><th>Titulares / cargas · Salud</th></tr></thead><tbody>
          {clients.map(client => <tr key={client.id}><td><button className="portfolio-link" onClick={() => onOpenClient(client.name)}>{client.name}</button><p className="account-muted text-sm">{client.kam} · Jefe: {client.manager}</p></td><td>{month(client.latestPeriod)}</td><td>{uf(client.monthlyPremiumUf)}</td><td><strong>{uf(client.annualPremiumUf)}</strong></td><td><strong>{client.holders ?? "—"} / {client.dependents ?? "—"}</strong><details className="mt-2"><summary>Detalle Salud</summary>{client.insured.length ? client.insured.map((group, index) => <div className="portfolio-insured" key={index}><span>{group.coverage} · Póliza {group.policy}</span><strong>{group.holders ?? "—"} / {group.dependents ?? "—"}</strong></div>) : "Sin datos"}</details></td></tr>)}
        </tbody></table></div>}
      </section>
    </>}
  </main>;
}
