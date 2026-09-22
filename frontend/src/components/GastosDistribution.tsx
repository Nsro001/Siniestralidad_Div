import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatReportPeriods } from "../lib/reportPeriods";
import { GastosReport } from "../types";

type Props = {
  report: GastosReport;
};

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export default function GastosDistribution({ report }: Props) {
  const chartRows = report.rows.filter(row => row.totalUf > 0);
  const renderDelta = (row: GastosReport["rows"][number]) => {
    if (!row.trend || row.trend === "unavailable") return <span>Sin datos</span>;
    const label = row.variationPercent == null ? (row.trend === "up" ? "Nuevo gasto" : "0,0 %")
      : `${row.variationPercent > 0 ? "+" : ""}${row.variationPercent.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`;
    return <span style={{ color: row.trend === "up" ? "#dc2626" : row.trend === "down" ? "#15803d" : "inherit" }}
      aria-label={`${row.trend === "up" ? "Aumento" : row.trend === "down" ? "Disminución" : "Sin cambio significativo"}: ${label}`}>
      {row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : "—"} {label}
    </span>;
  };

  return (
    <div className="grid gap-6">
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <h2 className="font-display text-xl">Distribución de prestaciones</h2>
        <p className="mt-2 text-xs text-ink/70">Variación del gasto UF frente a los mismos meses del año anterior: ↓ baja más de 2 %, ↑ sube más de 2 %, — entre −2 % y +2 %.</p>
        {report.comparison && <p className="mt-2 text-xs text-ink/70">Actual: {formatReportPeriods(report.comparison.periods)} · Anterior: {formatReportPeriods(report.comparison.previousPeriods)}.
          {!report.comparison.complete && " Comparación incompleta: no se calcula variación."}
          {!!report.comparison.missingPreviousPeriods.length && ` Sin datos anteriores: ${report.comparison.missingPreviousPeriods.join(", ")}.`}
          {!!report.comparison.missingCurrentPeriods.length && ` Sin datos actuales: ${report.comparison.missingCurrentPeriods.join(", ")}.`}
        </p>}
        <div className="expense-comparison-table mt-4 max-h-80 overflow-auto rounded-2xl border border-ink/10 bg-white/80 text-xs">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-sand">
              <tr>
                <th className="border-b border-ink/10 px-2 py-1 text-left">Prestación</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">UF actual</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">% actual</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">% cartera</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">UF anterior</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">% anterior</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">Variación UF</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.prestation} className="odd:bg-white">
                  <td className="border-b border-ink/10 px-2 py-1">{row.prestation}</td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">{row.totalUf.toFixed(2)}</td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">{row.percent.toFixed(1)}%</td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">
                    {row.percentCartera === undefined ? "-" : `${row.percentCartera}%`}
                  </td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">{row.previousTotalUf == null ? "Sin datos" : row.previousTotalUf.toFixed(2)}</td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">{row.previousPercent == null ? "Sin datos" : `${row.previousPercent.toFixed(1)}%`}</td>
                  <td className="border-b border-ink/10 px-2 py-1 text-right">{renderDelta(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <h2 className="font-display text-xl">Torta de prestaciones</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartRows}
                dataKey="percent"
                nameKey="prestation"
                outerRadius={110}
                label={({ cx, cy, midAngle, outerRadius, index }) => {
                  const RAD = Math.PI / 180;
                  const radius = outerRadius + 14;
                  const x = cx + radius * Math.cos(-midAngle * RAD);
                  const y = cy + radius * Math.sin(-midAngle * RAD);
                  const item = chartRows[index ?? 0];
                  if (!item) return null;
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor={x > cx ? "start" : "end"}
                      fill="var(--text)"
                      fontSize={10}
                    >
                      {`${item.prestation} ${item.percent.toFixed(1)}%`}
                    </text>
                  );
                }}
              >
                {chartRows.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
