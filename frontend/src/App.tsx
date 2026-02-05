import { useEffect, useMemo, useState } from "react";
import { fetchFilters, fetchGastosReport, fetchPrimasReport, uploadFile } from "./api";
import { FiltersResponse, GastosReport, PrimasReport } from "./types";
import GastosDistribution from "./components/GastosDistribution";
import PrimasCharts from "./components/PrimasCharts";
import MultiSelect from "./components/MultiSelect";
import TopProvidersTable from "./components/TopProvidersTable";
import TopInsuredTable from "./components/TopInsuredTable";
import SystemHealthReport from "./components/SystemHealthReport";
import HealthByPrestationReport from "./components/HealthByPrestationReport";

export default function App() {
  const [theme, setTheme] = useState("classic");
  const [premiumUploaded, setPremiumUploaded] = useState(false);
  const [claimsUploaded, setClaimsUploaded] = useState(false);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedCoverages, setSelectedCoverages] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [primasReport, setPrimasReport] = useState<PrimasReport | null>(null);
  const [gastosReport, setGastosReport] = useState<GastosReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleReports, setVisibleReports] = useState({
    primas: true,
    gastosDistribution: true,
    systemHealth: true,
    healthByPrestation: true,
    topProviders: true,
    topInsured: true,
  });

  const readyForFilters = premiumUploaded && claimsUploaded;

  useEffect(() => {
    if (theme === "classic") {
      document.documentElement.removeAttribute("data-theme");
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!readyForFilters) return;
    fetchFilters().then((data) => {
      setFilters(data);
      if (data.clients?.length) {
        setSelectedClient(data.clients[0]);
      }
    });
  }, [readyForFilters]);

  useEffect(() => {
    if (!filters || !selectedClient) return;
    const coverages = filters.coveragesByClient[selectedClient] ?? [];
    const periods = filters.periodsByClient[selectedClient] ?? [];
    setSelectedCoverages(coverages);
    setSelectedPeriods(periods);
  }, [filters, selectedClient]);

  useEffect(() => {
    if (!selectedClient || selectedCoverages.length === 0 || selectedPeriods.length === 0) {
      setPrimasReport(null);
      setGastosReport(null);
      return;
    }
    const params: Record<string, string> = {
      client: selectedClient,
      coverages: selectedCoverages.join(","),
      periods: selectedPeriods.join(","),
    };
    Promise.all([fetchPrimasReport(params), fetchGastosReport(params)]).then(([primas, gastos]) => {
      setPrimasReport(primas);
      setGastosReport(gastos);
    });
  }, [selectedClient, selectedCoverages, selectedPeriods]);

  const availableCoverages = useMemo(
    () => (filters && selectedClient ? filters.coveragesByClient[selectedClient] ?? [] : []),
    [filters, selectedClient]
  );

  const availablePeriods = useMemo(
    () => (filters && selectedClient ? filters.periodsByClient[selectedClient] ?? [] : []),
    [filters, selectedClient]
  );

  const handleUpload = async (endpoint: "/upload/primas" | "/upload/gastos", file: File) => {
    setError(null);
    const response = await uploadFile(endpoint, file);
    if (response.status !== "ok") {
      setError(response.error ?? "Error al cargar archivo.");
      return;
    }
    if (endpoint === "/upload/primas") {
      setPremiumUploaded(true);
    } else {
      setClaimsUploaded(true);
    }
  };

  const toggleReportVisibility = (key: keyof typeof visibleReports) => {
    setVisibleReports((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen px-6 py-10 md:px-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-moss">Siniestralidad colectivos</p>
          <h1 className="font-display text-3xl md:text-4xl text-ink">Informe de Siniestralidad</h1>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">
          <select
            className="rounded-full border border-ink/20 bg-white/70 px-3 py-2 text-sm"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="classic">Classic</option>
            <option value="divina">Divina</option>
            <option value="oscuro">Oscuro</option>
            <option value="blue-saas">Blue SaaS</option>
            <option value="light">Light</option>
          </select>
          <button
            className="rounded-full border border-ink/20 bg-white/70 px-4 py-2 text-sm"
            onClick={() => window.print()}
          >
            Exportar PDF
          </button>
        </div>
      </header>

      <section className="no-print grid gap-6 md:grid-cols-2">
        <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Sábana de Primas</h2>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleUpload("/upload/primas", file);
            }}
            className="mt-4 block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:text-sand"
          />
          <p className="mt-3 text-xs text-ink/70">Estado: {premiumUploaded ? "OK" : "Pendiente"}</p>
        </div>
        <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Sábana de Gastos</h2>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleUpload("/upload/gastos", file);
            }}
            className="mt-4 block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:text-sand"
          />
          <p className="mt-3 text-xs text-ink/70">Estado: {claimsUploaded ? "OK" : "Pendiente"}</p>
        </div>
      </section>

      <section className="no-print mt-8 glass-panel rounded-3xl p-6 shadow-soft-xl">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <label className="text-sm font-semibold">Nombre Cliente</label>
            <select
              className="mt-2 w-full rounded-xl border border-ink/20 bg-white/80 px-3 py-2 text-sm"
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
              disabled={!readyForFilters}
            >
              <option value="">Selecciona cliente</option>
              {filters?.clients?.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Cobertura</label>
            <MultiSelect
              options={availableCoverages}
              selected={selectedCoverages}
              onChange={setSelectedCoverages}
              disabled={!selectedClient}
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Periodo</label>
            <MultiSelect
              options={availablePeriods}
              selected={selectedPeriods}
              onChange={setSelectedPeriods}
              disabled={!selectedClient}
            />
          </div>
        </div>
        {error && <p className="mt-4 text-sm text-ember">{error}</p>}
      </section>

      <section className="no-print mt-8 glass-panel rounded-3xl p-6 shadow-soft-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-moss">Panel de reportes</p>
            <h2 className="font-display text-lg text-ink">Selecciona quÃ© reportes mostrar</h2>
          </div>
          <p className="text-xs text-ink/60">Los cambios se aplican al PDF.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>Siniestralidad por cobertura</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.primas}
              onChange={() => toggleReportVisibility("primas")}
              disabled={!primasReport}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>DistribuciÃ³n de prestaciones</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.gastosDistribution}
              onChange={() => toggleReportVisibility("gastosDistribution")}
              disabled={!gastosReport}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>Salud del sistema</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.systemHealth}
              onChange={() => toggleReportVisibility("systemHealth")}
              disabled={!gastosReport}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>Salud por prestaciÃ³n</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.healthByPrestation}
              onChange={() => toggleReportVisibility("healthByPrestation")}
              disabled={!gastosReport}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>Top prestadores</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.topProviders}
              onChange={() => toggleReportVisibility("topProviders")}
              disabled={!gastosReport}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
            <span>Top asegurados</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={visibleReports.topInsured}
              onChange={() => toggleReportVisibility("topInsured")}
              disabled={!gastosReport}
            />
          </label>
        </div>
      </section>

      <div id="report-root" className="mt-10 space-y-10">
        <div className="print-only mb-6">
          <p className="text-sm uppercase tracking-[0.3em] text-moss">Informe de Siniestralidad</p>
          <h2 className="font-display text-2xl text-ink">Resumen del Reporte</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/70">
            <span>Empresa: {selectedClient || "Sin seleccionar"}</span>
            <span>Periodo: {selectedPeriods.length ? selectedPeriods.join(", ") : "Sin seleccionar"}</span>
          </div>
        </div>
        {primasReport && visibleReports.primas && <PrimasCharts report={primasReport} />}
        {gastosReport && visibleReports.gastosDistribution && <GastosDistribution report={gastosReport} />}
        {gastosReport && visibleReports.systemHealth && <SystemHealthReport report={gastosReport} />}
        {gastosReport && visibleReports.healthByPrestation && <HealthByPrestationReport report={gastosReport} />}
        {gastosReport && visibleReports.topProviders && <TopProvidersTable report={gastosReport} />}
        {gastosReport && visibleReports.topInsured && <TopInsuredTable report={gastosReport} />}
      </div>
    </div>
  );
}
