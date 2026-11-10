import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "./DesignSystem";
import { fetchPortfolio } from "../api";
import { selectPortfolioClients } from "../lib/portfolioFilters";
import type { AccountProfile, Portfolio } from "../types";

const uf = (value: number | null) => value === null ? "Sin datos" : `${value.toLocaleString("es-CL", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} UF`;
const dateLabel = (date: string | null) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC" }) : "Sin póliza vigente";
const month = (period: string | null) => period ? new Date(`${period}-01T12:00:00Z`).toLocaleDateString("es-CL", { month: "short", year: "numeric", timeZone: "UTC" }) : "Sin primas";
export default function PortfolioDashboard({ profile, onOpenClient }: { profile: AccountProfile; onOpenClient: (name: string) => void }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [kam, setKam] = useState("");
  const [search, setSearch] = useState("");
  const [insurer, setInsurer] = useState("");
  const [coverage, setCoverage] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");
  const [ascending, setAscending] = useState(true);
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
  const clients = selectPortfolioClients(data?.clients??[], {kam,search,insurer,coverage,status,sort,ascending});
  const insurers=[...new Set(data?.clients.flatMap(c=>c.policies.map(p=>p.insurer))??[])].sort();
  const coverages=[...new Set(data?.clients.flatMap(c=>c.policies.flatMap(p=>p.coverages))??[])].sort();
  const kams = [...new Set(data?.clients.map(c => c.kam) ?? [])].sort();
  const annual = clients.filter(c => c.annualPremiumUf !== null).reduce((sum, c) => sum + c.annualPremiumUf!, 0);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const limit = new Date(`${today}T12:00:00Z`); limit.setUTCDate(limit.getUTCDate() + 90);
  const horizon = limit.toISOString().slice(0, 10);
  const renewals = clients.flatMap(c => c.renewals.map(date => ({ client: c, date })))
    .filter(r => r.date >= `${today.slice(0, 7)}-01` && r.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
  const missing = clients.filter(c => !c.renewals.length).length;
  return <main className="account-ui accounts-page portfolio-page">
    <PageHeader eyebrow="Cartera de clientes" title={profile.role === "manager" ? "Mi equipo" : profile.role === "admin" ? "Vista general" : "Mi cartera"} description="Clientes, primas y vigencias contractuales en un solo lugar." actions={<button className="account-secondary" onClick={() => setReload(value => value + 1)}>Actualizar datos</button>} />
    {updatedAt && <p className="account-muted text-sm mt-3">Última consulta: {updatedAt.toLocaleTimeString("es-CL")} · Actualización automática cada minuto.</p>}
    {error ? <p role="alert" className="account-error mt-4">{error}</p> : !data ? <p role="status" className="mt-6">Cargando cartera…</p> : <>
      <div className="portfolio-filters account-form mt-6">
        {profile.role !== "executive" && <label>KAM<select value={kam} onChange={e => setKam(e.target.value)}><option value="">Todos los KAM</option>{kams.map(name => <option key={name}>{name}</option>)}</select></label>}
        <label>Buscar cliente<input type="search" placeholder="Nombre del cliente" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label>Aseguradora<select value={insurer} onChange={e=>setInsurer(e.target.value)}><option value="">Todas</option>{insurers.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Cobertura<select value={coverage} onChange={e=>setCoverage(e.target.value)}><option value="">Todas</option>{coverages.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Estado de póliza<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos</option><option value="active">Vigente</option><option value="future">Futura</option><option value="expired">Vencida</option><option value="cancelled">Cancelada</option><option value="suspended">Suspendida</option><option value="no_policy">Sin póliza validada</option></select></label>
        <label>Ordenar por<select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Razón social</option><option value="date">Inicio de vigencia</option><option value="premium">Prima mensual</option><option value="kam">KAM</option></select></label>
        <button className="account-secondary" onClick={()=>setAscending(v=>!v)} aria-label="Cambiar sentido del orden">{ascending?"Ascendente ↑":"Descendente ↓"}</button>
      </div>
      <div className="portfolio-stats mt-6">
        <StatCard label="Clientes" value={clients.length} detail="En la cartera seleccionada" />
        <StatCard label="Prima anual estimada" value={uf(clients.some(c => c.annualPremiumUf !== null) ? annual : null)} detail="Último mes de cada cliente × 12" />
        <StatCard label="Términos de vigencia próximos" value={renewals.length} detail={`Mes en curso y próximos 90 días · ${missing} sin fecha contractual`} />
      </div>
      <section className="glass-panel account-card mt-6">
        <h2 className="font-display text-xl">Términos de vigencia próximos</h2>
        <p className="account-muted text-sm mt-2">Fechas de término de pólizas vigentes validadas. La renovación requiere confirmación documental.</p>
        {renewals.length ? <ul className="portfolio-renewals mt-4">{renewals.map(({ client, date }) => <li key={`${client.id}-${date}`}><div><button className="portfolio-link" onClick={() => onOpenClient(client.reportName)}>{client.name}</button><p className="account-muted text-sm">{client.kam}</p></div><time dateTime={date}>{dateLabel(date)}</time></li>)}</ul> : <p className="account-muted mt-3">{missing === clients.length && clients.length ? "Registra y valida las pólizas para consultar sus vigencias." : "No hay términos de vigencia registrados en el mes en curso ni en los próximos 90 días."}</p>}
      </section>
      <section className="glass-panel account-card mt-6">
        <h2 className="font-display text-xl">Clientes de la cartera</h2>
        <p className="account-muted text-sm mt-2">Clientes registrados, con o sin primas. Prima mensual: suma de coberturas del último período disponible. Titulares y cargas: suma por póliza de Salud del último mes; puede incluir personas repetidas.</p>
        {!clients.length ? <p className="mt-6">{data.clients.length ? "No hay clientes para estos filtros." : "Todavía no tienes clientes en tu cartera. El administrador debe cargar las primas y vincular las cuentas a sus KAM o jefes."}</p> : <div className="portfolio-table mt-4"><table><thead><tr><th>Cliente / KAM</th><th>Inicio de vigencia</th><th>Prima mensual</th><th>Prima anual estimada</th><th>Titulares / cargas · Salud</th></tr></thead><tbody>
          {clients.map(client => <tr key={client.id}><td><button className="portfolio-link" onClick={() => onOpenClient(client.reportName)}>{client.name}</button><p className="account-muted text-sm">{client.kam} · Jefe: {client.manager}</p></td><td>{dateLabel(client.startsOn)}<details className="mt-2"><summary>Todas las vigencias ({client.policyDates.length})</summary>{client.policyDates.length ? client.policyDates.map(p=><p key={`${p.policyId}-${p.revision}`} className="portfolio-insured">{p.insurer} · {p.number} · v{p.revision}<br/>{dateLabel(p.startsOn)} — {dateLabel(p.endsOn)}</p>) : <p>Sin información contractual validada.</p>}</details></td><td>{uf(client.monthlyPremiumUf)}<p className="account-muted text-sm">{month(client.latestPeriod)} · Sábana</p></td><td><strong>{uf(client.annualPremiumUf)}</strong></td><td><strong>{client.holders ?? "—"} / {client.dependents ?? "—"}</strong><details className="mt-2"><summary>Detalle Salud</summary>{client.insured.length ? client.insured.map((group, index) => <div className="portfolio-insured" key={index}><span>{group.coverage} · Póliza {group.policy}</span><strong>{group.holders ?? "—"} / {group.dependents ?? "—"}</strong></div>) : "Sin datos"}</details></td></tr>)}
        </tbody></table></div>}
      </section>
    </>}
  </main>;
}
