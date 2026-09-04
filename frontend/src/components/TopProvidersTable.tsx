import { GastosReport } from "../types";

type Props = {
  report: GastosReport;
};

export default function TopProvidersTable({ report }: Props) {
  if (report.topProviders.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <p className="text-sm text-ink/70">Sin datos de prestadores para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
      <h2 className="font-display text-xl">Top 10 prestadores</h2>
      <div className="mt-4 overflow-auto rounded-2xl border border-ink/10 bg-white/80 text-xs">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 bg-sand">
            <tr>
              <th className="border-b border-ink/10 px-2 py-1 text-left">Prestador</th>
              <th className="border-b border-ink/10 px-2 py-1 text-right">Total UF</th>
              {report.prestationOrder.map((prestation) => (
                <th key={prestation} className="border-b border-ink/10 px-2 py-1 text-right">
                  {prestation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.topProviders.map((provider) => (
              <tr key={provider.provider} className="odd:bg-white">
                <td className="border-b border-ink/10 px-2 py-1">{provider.provider}</td>
                <td className="border-b border-ink/10 px-2 py-1 text-right">{provider.totalUf.toFixed(2)}</td>
                {report.prestationOrder.map((prestation) => (
                  <td key={`${provider.provider}-${prestation}`} className="border-b border-ink/10 px-2 py-1 text-right">
                    {(provider.byPrestation[prestation] ?? 0).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
