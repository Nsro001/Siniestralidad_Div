import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { PrimasReport } from "../types";

type Props = {
  report: PrimasReport;
};

export default function PrimasCharts({ report }: Props) {
  if (report.series.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <p className="text-sm text-ink/70">Sin datos de primas para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {report.series.map((coverage) => {
        const seriesWithRatio = coverage.series.map((row) => ({
          ...row,
          lossRatio: row.premiumUf > 0 ? row.spendUf / row.premiumUf : 0,
        }));
        return (
          <div key={coverage.coverage} className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Siniestralidad - {coverage.coverage}</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={seriesWithRatio}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d7" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "lossRatio" ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)
                    }
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="premiumUf"
                    name="Prima UF"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="spendUf"
                    name="Gasto UF"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="lossRatio"
                    name="% Siniestralidad"
                    stroke="var(--text)"
                    strokeWidth={2}
                    dot={false}
                  >
                    <LabelList
                      dataKey="lossRatio"
                      position="top"
                      formatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                      fill="var(--text)"
                      fontSize={10}
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
