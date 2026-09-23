import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchClaimantsReport,
  fetchFilters,
  fetchGastosReport,
  fetchPrimasReport,
  uploadFile,
} from "./api";
import { AccountProfile, ClaimantsReport, FiltersResponse, GastosReport, PrimasReport } from "./types";
import ReportPresentation, { type ReportSlide } from "./components/ReportPresentation";
import ExecutiveSummary from "./components/ExecutiveSummary";
import GastosDistribution from "./components/GastosDistribution";
import PrimasCharts from "./components/PrimasCharts";
import MultiSelect from "./components/MultiSelect";
import TopProvidersTable from "./components/TopProvidersTable";
import TopInsuredTable from "./components/TopInsuredTable";
import SystemHealthReport from "./components/SystemHealthReport";
import HealthByPrestationReport from "./components/HealthByPrestationReport";

type PeriodPreset = "vigencia" | "rolling12" | "all" | "custom";

type ReportToggleSectionProps = {
  title: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
};

function ReportToggleSection({ title, checked, onToggle, disabled, children }: ReportToggleSectionProps) {
  return (
    <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">{title}</h2>
        <label className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-ink/60">
          <span>Mostrar</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-ink"
            checked={checked}
            onChange={onToggle}
            disabled={disabled}
          />
        </label>
      </div>
      {checked ? <div className="mt-4">{children}</div> : <p className="mt-4 text-xs text-ink/60">Reporte oculto.</p>}
    </div>
  );
}

const getRolling12 = (periods: string[]) => [...periods].sort().slice(-12);

const getCurrentValidity = (periods: string[]) => {
  const sorted = [...periods].sort();
  if (sorted.length <= 12) return sorted;

  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const renewalMonth = Number(first.slice(5, 7));
  const latestYear = Number(latest.slice(0, 4));
  const latestMonth = Number(latest.slice(5, 7));
  const startYear = latestMonth >= renewalMonth ? latestYear : latestYear - 1;
  const start = `${startYear}-${String(renewalMonth).padStart(2, "0")}`;

  return sorted.filter((period) => period >= start && period <= latest).slice(0, 12);
};

export default function App({ profile, initialClient = "" }: { profile: AccountProfile; initialClient?: string }) {
  const [presenting, setPresenting] = useState(false);
  const [theme, setTheme] = useState("classic");
  const [premiumUploaded, setPremiumUploaded] = useState(false);
  const [claimsUploaded, setClaimsUploaded] = useState(false);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>(initialClient);
  const [selectedCoverages, setSelectedCoverages] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("vigencia");
  const [primasReport, setPrimasReport] = useState<PrimasReport | null>(null);
  const [gastosReport, setGastosReport] = useState<GastosReport | null>(null);
  const [claimantsReport, setClaimantsReport] = useState<ClaimantsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleReports, setVisibleReports] = useState({
    primas: true,
    gastosDistribution: true,
    systemHealth: true,
    healthByPrestation: true,
    topProviders: true,
    topInsured: true,
  });

  const [dataVersion, setDataVersion] = useState(0);
  const [uploadMode, setUploadMode] = useState<"replace" | "merge">("replace");
  const [uploading, setUploading] = useState(false);
  const readyForFilters = filters !== null;

  useEffect(() => {
    if (theme === "classic") {
      document.documentElement.removeAttribute("data-theme");
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetchFilters()
      .then((data) => {
        if (cancelled) return;
        setFilters(data);
        setSelectedClient(current => data.clients.includes(current) ? current : data.clients[0] ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setFilters(null); setSelectedClient("");
        setError(err instanceof Error ? err.message : "Error al cargar filtros.");
      });
    return () => { cancelled = true; };
  }, [dataVersion]);

  useEffect(() => {
    if (!filters || !selectedClient) return;
    const coverages = filters.coveragesByClient[selectedClient] ?? [];
    const periods = filters.periodsByClient[selectedClient] ?? [];
    setSelectedCoverages(coverages);
    setPeriodPreset("vigencia");
    setSelectedPeriods(getCurrentValidity(periods));
  }, [filters, selectedClient]);

  useEffect(() => {
    if (!selectedClient || selectedCoverages.length === 0 || selectedPeriods.length === 0) {
      setPrimasReport(null);
      setGastosReport(null);
      setClaimantsReport(null);
      return;
    }

    const params: Record<string, string> = {
      client: selectedClient,
      coverages: selectedCoverages.join(","),
      periods: selectedPeriods.join(","),
    };

    let cancelled = false;
    setPrimasReport(null); setGastosReport(null); setClaimantsReport(null);
    setError(null);
    Promise.all([
      fetchPrimasReport(params),
      fetchGastosReport(params),
      fetchClaimantsReport(params),
    ])
      .then(([primas, gastos, claimants]) => {
        if (cancelled) return;
        setPrimasReport(primas);
        setGastosReport(gastos);
        setClaimantsReport(claimants);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Error al generar los reportes."); });
    return () => { cancelled = true; };
  }, [selectedClient, selectedCoverages, selectedPeriods, dataVersion]);

  const availableCoverages = useMemo(
    () => (filters && selectedClient ? filters.coveragesByClient[selectedClient] ?? [] : []),
    [filters, selectedClient]
  );

  const availablePeriods = useMemo(
    () => (filters && selectedClient ? filters.periodsByClient[selectedClient] ?? [] : []),
    [filters, selectedClient]
  );

  const handleUpload = async (endpoint: "/upload/primas" | "/upload/gastos", file: File) => {
    setError(null); setUploading(true);
    try {
      const response = await uploadFile(endpoint, file, uploadMode);
      if (response.status !== "ok") {
        setError(response.error ?? "Error al cargar archivo.");
        return;
      }
      if (endpoint === "/upload/primas") setPremiumUploaded(true);
      else setClaimsUploaded(true);
      setDataVersion(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar archivo.");
    } finally { setUploading(false); }
  };

  const applyPeriodPreset = (preset: Exclude<PeriodPreset, "custom">) => {
    setPeriodPreset(preset);
    if (preset === "vigencia") setSelectedPeriods(getCurrentValidity(availablePeriods));
    if (preset === "rolling12") setSelectedPeriods(getRolling12(availablePeriods));
    if (preset === "all") setSelectedPeriods([...availablePeriods].sort());
  };

  const toggleReportVisibility = (key: keyof typeof visibleReports) => {
    setVisibleReports((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const slides: ReportSlide[] = [];
  if (primasReport) {
    slides.push({ id: "summary", title: "Resumen ejecutivo", content: <ExecutiveSummary report={primasReport} claimants={claimantsReport} periods={selectedPeriods} /> });
    if (visibleReports.primas) primasReport.series.forEach(coverage => {
      slides.push({ id: `premium-${coverage.coverage}`, title: `Siniestralidad · ${coverage.coverage}`, content: <PrimasCharts client={selectedClient} report={{ series: [coverage] }} /> });
    });
  }
  if (gastosReport) {
    if (visibleReports.gastosDistribution) slides.push({ id: "distribution", title: "Distribución de prestaciones", content: <GastosDistribution report={gastosReport} /> });
    if (visibleReports.systemHealth) slides.push({ id: "health", title: "Salud del sistema", content: <SystemHealthReport report={gastosReport} /> });
    if (visibleReports.healthByPrestation) slides.push({ id: "prestations", title: "Salud por prestación", content: <HealthByPrestationReport report={gastosReport} /> });
    if (visibleReports.topProviders) slides.push({ id: "providers", title: "Top prestadores", content: <TopProvidersTable report={gastosReport} /> });
    if (visibleReports.topInsured) slides.push({ id: "insured", title: "Top asegurados", content: <TopInsuredTable report={gastosReport} /> });
  }

  const presetButtonClass = (preset: PeriodPreset) =>
    `rounded-full border px-4 py-2 text-xs font-semibold transition ${
      periodPreset === preset
        ? "border-ink bg-ink text-sand"
        : "border-ink/20 bg-white/70 text-ink hover:border-ink/40"
    }`;

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

      {profile.role === "admin" && <>
      <p className="no-print mb-4 text-sm text-ink/70">Máximo 10 MB por archivo. El resumen de cartera muestra los clientes con primas cargadas.</p>
      <label className="no-print block mb-4">Tipo de carga <select value={uploadMode} disabled={uploading} onChange={event => setUploadMode(event.target.value as "replace" | "merge")}><option value="replace">Reemplazar la sábana completa</option><option value="merge">Actualizar solo los clientes del archivo</option></select><span className="block text-sm mt-2">{uploadMode === "replace" ? "Se reemplazan todos los datos del tipo cargado (primas o gastos), incluidos los de clientes ausentes del nuevo archivo. Carga ambos archivos para renovar ambas sábanas." : "Se conservan los datos de los clientes que no aparecen en el archivo."}</span></label>
      <section className="no-print grid gap-6 md:grid-cols-2">
        <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Sábana de Primas</h2>
          <input
            type="file"
            disabled={uploading}
            accept=".xls,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) handleUpload("/upload/primas", file);
            }}
            className="mt-4 block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:text-sand"
          />
          <p className="mt-3 text-xs text-ink/70">Carga en esta sesión: {premiumUploaded ? "Completada" : "Sin cargas nuevas"}</p>
        </div>
        <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Sábana de Gastos</h2>
          <input
            type="file"
            disabled={uploading}
            accept=".xls,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) handleUpload("/upload/gastos", file);
            }}
            className="mt-4 block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:text-sand"
          />
          <p className="mt-3 text-xs text-ink/70">Carga en esta sesión: {claimsUploaded ? "Completada" : "Sin cargas nuevas"}</p>
        </div>
      </section>
      {uploading && <p className="no-print mt-3" role="status">Procesando y guardando sábana…</p>}
      </>}

      <section className="no-print mt-8 glass-panel rounded-3xl p-6 shadow-soft-xl">
        {filters?.clients.length === 0 && <p className="mb-4 text-sm" role="status">{profile.role === "admin" ? "Carga las sábanas para registrar los primeros clientes." : "Todavía no tienes clientes asignados. Contacta al administrador."}</p>}
        <button className="mb-4 text-sm underline" onClick={() => setDataVersion(value => value + 1)}>Actualizar clientes y datos</button>
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
              onChange={(periods) => {
                setSelectedPeriods(periods);
                setPeriodPreset("custom");
              }}
              disabled={!selectedClient}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/55">Vista rápida</span>
          <button className={presetButtonClass("vigencia")} onClick={() => applyPeriodPreset("vigencia")} disabled={!selectedClient}>
            Vigencia actual
          </button>
          <button className={presetButtonClass("rolling12")} onClick={() => applyPeriodPreset("rolling12")} disabled={!selectedClient}>
            Últimos 12 meses
          </button>
          <button className={presetButtonClass("all")} onClick={() => applyPeriodPreset("all")} disabled={!selectedClient}>
            Todo
          </button>
          <span className={presetButtonClass("custom")}>Personalizado</span>
        </div>
        <p className="mt-3 text-xs text-ink/55">
          La vigencia se estima usando como mes de renovación el primer mes disponible en la sábana de primas. Con los archivos actuales corresponde a noviembre 2024–octubre 2025.
        </p>
        {error && <p className="mt-4 text-sm text-ember">{error}</p>}
      </section>

      <section className="no-print account-ui report-view-controls mt-8" aria-label="Vista del reporte">
        <div><h2 className="font-display text-xl">Presentar al cliente</h2><p className="account-muted text-sm">Selecciona las tarjetas con Mostrar. La presentación respeta esa selección y separa cada cobertura.</p></div>
        <button className="account-secondary" onClick={() => setVisibleReports({ primas: true, gastosDistribution: true, systemHealth: true, healthByPrestation: true, topProviders: true, topInsured: true })}>Mostrar todas</button>
        <button className="account-primary" disabled={!slides.length || !!error || uploading} onClick={() => setPresenting(true)}>Modo presentación</button>
      </section>
      {presenting && slides.length > 0 && <ReportPresentation slides={slides} client={selectedClient} periods={selectedPeriods} onClose={() => setPresenting(false)} />}

      <div id="report-root" className="mt-10 space-y-10">
        <div className="print-only mb-6">
          <p className="text-sm uppercase tracking-[0.3em] text-moss">Informe de Siniestralidad</p>
          <h2 className="font-display text-2xl text-ink">Resumen del Reporte</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/70">
            <span>Empresa: {selectedClient || "Sin seleccionar"}</span>
            <span>Periodo: {selectedPeriods.length ? `${selectedPeriods[0]} a ${selectedPeriods[selectedPeriods.length - 1]}` : "Sin seleccionar"}</span>
          </div>
        </div>

        {primasReport && (
          <ExecutiveSummary report={primasReport} claimants={claimantsReport} periods={selectedPeriods} />
        )}

        {primasReport && (
          <ReportToggleSection
            title="Siniestralidad por cobertura"
            checked={visibleReports.primas}
            onToggle={() => toggleReportVisibility("primas")}
          >
            <PrimasCharts client={selectedClient} report={primasReport} />
          </ReportToggleSection>
        )}
        {gastosReport && (
          <ReportToggleSection
            title="Distribución de prestaciones"
            checked={visibleReports.gastosDistribution}
            onToggle={() => toggleReportVisibility("gastosDistribution")}
          >
            <GastosDistribution report={gastosReport} />
          </ReportToggleSection>
        )}
        {gastosReport && (
          <ReportToggleSection
            title="Salud del sistema"
            checked={visibleReports.systemHealth}
            onToggle={() => toggleReportVisibility("systemHealth")}
          >
            <SystemHealthReport report={gastosReport} />
          </ReportToggleSection>
        )}
        {gastosReport && (
          <ReportToggleSection
            title="Salud por prestación"
            checked={visibleReports.healthByPrestation}
            onToggle={() => toggleReportVisibility("healthByPrestation")}
          >
            <HealthByPrestationReport report={gastosReport} />
          </ReportToggleSection>
        )}
        {gastosReport && (
          <ReportToggleSection
            title="Top prestadores"
            checked={visibleReports.topProviders}
            onToggle={() => toggleReportVisibility("topProviders")}
          >
            <TopProvidersTable report={gastosReport} />
          </ReportToggleSection>
        )}
        {gastosReport && (
          <ReportToggleSection
            title="Top asegurados"
            checked={visibleReports.topInsured}
            onToggle={() => toggleReportVisibility("topInsured")}
          >
            <TopInsuredTable report={gastosReport} />
          </ReportToggleSection>
        )}
      </div>
    </div>
  );
}
