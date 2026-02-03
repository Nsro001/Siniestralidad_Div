import { GastosReport } from "../types";

type Props = {
  report: GastosReport;
};

export default function TopInsuredTable({ report }: Props) {
  if (report.topInsured.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <p className="text-sm text-ink/70">Sin datos de mayores gastadores para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
      <h2 className="font-display text-xl">Top 20 mayores gastadores</h2>
      <div className="mt-4 overflow-auto rounded-2xl border border-ink/10 bg-white/80 text-xs">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 bg-sand">
            <tr>
              <th className="border-b border-ink/10 px-2 py-1 text-left">Rut</th>
              <th className="border-b border-ink/10 px-2 py-1 text-right">Total UF</th>
              {report.prestationOrder.map((prestation) => (
                <th key={prestation} className="border-b border-ink/10 px-2 py-1 text-right">
                  {prestation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.topInsured.map((insured) => (
              <tr key={insured.insuredRut} className="odd:bg-white">
                <td className="border-b border-ink/10 px-2 py-1">{insured.insuredRut}</td>
                <td className="border-b border-ink/10 px-2 py-1 text-right">{insured.totalUf.toFixed(2)}</td>
                {report.prestationOrder.map((prestation) => (
                  <td key={`${insured.insuredRut}-${prestation}`} className="border-b border-ink/10 px-2 py-1 text-right">
                    {(insured.byPrestation[prestation] ?? 0).toFixed(2)}
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
