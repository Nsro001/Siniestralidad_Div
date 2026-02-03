import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
  const renderDelta = (percent: number, percentCartera?: number) => {
    if (percentCartera === undefined) return null;
    if (percent > percentCartera) {
      return <span className="ml-2 text-ember">↑</span>;
    }
    if (percent < percentCartera) {
      return <span className="ml-2 text-moss">↓</span>;
    }
    return null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <h2 className="font-display text-xl">Distribución de prestaciones</h2>
        <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-ink/10 bg-white/80 text-xs">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-sand">
              <tr>
                <th className="border-b border-ink/10 px-2 py-1 text-left">Prestación</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">Total UF</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">% del total</th>
                <th className="border-b border-ink/10 px-2 py-1 text-right">% cartera</th>
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
                    {renderDelta(row.percent, row.percentCartera)}
                  </td>
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
                data={report.rows}
                dataKey="percent"
                nameKey="prestation"
                outerRadius={110}
                label={({ cx, cy, midAngle, outerRadius, index }) => {
                  const RAD = Math.PI / 180;
                  const radius = outerRadius + 14;
                  const x = cx + radius * Math.cos(-midAngle * RAD);
                  const y = cy + radius * Math.sin(-midAngle * RAD);
                  const item = report.rows[index ?? 0];
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
                {report.rows.map((_, index) => (
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
