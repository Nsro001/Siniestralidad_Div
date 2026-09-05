import { ClaimantsReport, PrimasReport } from "../types";

type Props = {
  report: PrimasReport;
  claimants: ClaimantsReport | null;
  periods: string[];
};

const fmtUf = (value: number) =>
  new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const fmtPct = (value: number) => `${(value * 100).toFixed(1)}%`;

const totalsFor = (report: PrimasReport, coverageName: string) => {
  const row = report.series.find((item) => item.coverage === coverageName);
  if (!row) return null;
  const premiumUf = row.series.reduce((sum, item) => sum + item.premiumUf, 0);
  const spendUf = row.series.reduce((sum, item) => sum + item.spendUf, 0);
  return { coverage: coverageName, premiumUf, spendUf, lossRatio: premiumUf > 0 ? spendUf / premiumUf : 0 };
};

export default function ExecutiveSummary({ report, claimants, periods }: Props) {
  const coverageRows = report.series
    .filter((item) => item.coverage !== "Consolidado S+D+C")
    .map((item) => {
      const premiumUf = item.series.reduce((sum, row) => sum + row.premiumUf, 0);
      const spendUf = item.series.reduce((sum, row) => sum + row.spendUf, 0);
      return {
        coverage: item.coverage,
        premiumUf,
        spendUf,
        lossRatio: premiumUf > 0 ? spendUf / premiumUf : 0,
      };
    });

  const consolidated =
    totalsFor(report, "Consolidado S+D+C") ??
    (() => {
      const eligible = coverageRows.filter((row) => ["Salud", "Dental", "Catastrófico"].includes(row.coverage));
      const premiumUf = eligible.reduce((sum, row) => sum + row.premiumUf, 0);
      const spendUf = eligible.reduce((sum, row) => sum + row.spendUf, 0);
      return {
        coverage: "Consolidado S+D+C",
        premiumUf,
        spendUf,
        lossRatio: premiumUf > 0 ? spendUf / premiumUf : 0,
      };
    })();

  const sortedPeriods = [...periods].sort();
  const shortPeriod = (period: string) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) return period;
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${months[Number(match[2]) - 1]} ${match[1]}`;
  };
  const periodLabel = sortedPeriods.length
    ? sortedPeriods.length === 1
      ? shortPeriod(sortedPeriods[0])
      : `${shortPeriod(sortedPeriods[0])} a ${shortPeriod(sortedPeriods[sortedPeriods.length - 1])}`
    : "Sin período";
  const indicators = [
    { coverage: "Consolidado S+D+C", totals: consolidated },
    { coverage: "Salud", totals: totalsFor(report, "Salud") },
    { coverage: "Dental", totals: totalsFor(report, "Dental") },
  ];

  return (
    <section className="executive-summary glass-panel rounded-3xl p-6 shadow-soft-xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-moss">Resumen ejecutivo</p>
          <h2 className="mt-1 font-display text-2xl">Siniestralidad totalizada</h2>
        </div>
        <p className="text-sm text-ink/60">{periodLabel}</p>
      </div>

      <div className="executive-indicators">
        {indicators.map(({ coverage, totals }) => (
          <div key={coverage} className="executive-indicator">
            <div className="executive-circle font-display" aria-label={`Siniestralidad ${coverage}`}>
              {totals ? fmtPct(totals.lossRatio) : "—"}
            </div>
            <p className="mt-3 font-semibold">{coverage}</p>
            <p className="mt-1 text-xs text-ink/60">{periodLabel}</p>
          </div>
        ))}
      </div>

      <div className="executive-claimants mt-6 rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full text-sm">
          <caption className="px-4 py-2 text-left text-xs text-ink/60">
            Personas únicas con uso · {periods.length} períodos incluidos
          </caption>
          <tbody>
            <tr className="border-t border-ink/10">
              <th scope="row" className="px-4 py-2 text-left font-medium">Titulares con uso</th>
              <td className="px-4 py-2 text-right font-semibold">{claimants?.titularClaimants ?? "—"}</td>
            </tr>
            <tr className="border-t border-ink/10">
              <th scope="row" className="px-4 py-2 text-left font-medium">Cargas con uso</th>
              <td className="px-4 py-2 text-right font-semibold">{claimants?.dependentClaimants ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="executive-totals mt-6 overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.18em] text-ink/55">
            <tr>
              <th className="px-4 py-3">Cobertura</th>
              <th className="px-4 py-3 text-right">Prima UF</th>
              <th className="px-4 py-3 text-right">Gasto UF</th>
              <th className="px-4 py-3 text-right">Siniestralidad</th>
            </tr>
          </thead>
          <tbody>
            {coverageRows.map((row) => (
              <tr key={row.coverage} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-3 font-semibold">{row.coverage}</td>
                <td className="px-4 py-3 text-right">{fmtUf(row.premiumUf)}</td>
                <td className="px-4 py-3 text-right">{fmtUf(row.spendUf)}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtPct(row.lossRatio)}</td>
              </tr>
            ))}
            <tr className="bg-ink/[0.04]">
              <td className="px-4 py-3 font-bold">Consolidado S+D+C</td>
              <td className="px-4 py-3 text-right font-semibold">{fmtUf(consolidated.premiumUf)}</td>
              <td className="px-4 py-3 text-right font-semibold">{fmtUf(consolidated.spendUf)}</td>
              <td className="px-4 py-3 text-right font-bold">{fmtPct(consolidated.lossRatio)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink/55">
        Nota: la sábana de gastos permite contar personas que registraron uso/siniestros. Para mostrar el total real de titulares y cargas vigentes, se necesita una nómina de asegurados o censo de póliza.
      </p>
    </section>
  );
}
