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

  const periodLabel = periods.length
    ? `${periods[0]} a ${periods[periods.length - 1]}`
    : "Sin período";

  return (
    <section className="glass-panel rounded-3xl p-6 shadow-soft-xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-moss">Resumen ejecutivo</p>
          <h2 className="mt-1 font-display text-2xl">Siniestralidad totalizada</h2>
        </div>
        <p className="text-sm text-ink/60">{periodLabel}</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-ink/10 bg-white/65 p-5 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">Consolidado Salud + Dental + Catastrófico</p>
          <p className="mt-3 font-display text-4xl">{fmtPct(consolidated.lossRatio)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-ink/55">Prima</p>
              <p className="font-semibold">UF {fmtUf(consolidated.premiumUf)}</p>
            </div>
            <div>
              <p className="text-ink/55">Gasto</p>
              <p className="font-semibold">UF {fmtUf(consolidated.spendUf)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/65 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">Titulares con uso</p>
          <p className="mt-3 font-display text-4xl">{claimants?.titularClaimants ?? "—"}</p>
          <p className="mt-2 text-xs text-ink/55">Titulares únicos presentes en la sábana de gastos.</p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/65 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">Cargas con uso</p>
          <p className="mt-3 font-display text-4xl">{claimants?.dependentClaimants ?? "—"}</p>
          <p className="mt-2 text-xs text-ink/55">Cargas únicas presentes en la sábana de gastos.</p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/65 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">Períodos</p>
          <p className="mt-3 font-display text-4xl">{periods.length}</p>
          <p className="mt-2 text-xs text-ink/55">Meses incluidos en el cálculo.</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
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
