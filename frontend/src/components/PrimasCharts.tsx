import { useState } from "react";
import { formatReportMonth, formatReportPeriods } from "../lib/reportPeriods";
import MonthlyDetailPanel from "./MonthlyDetailPanel";
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
  client: string;
};

export default function PrimasCharts({ report, client }: Props) {
  const [selected, setSelected] = useState<{ coverage: string; period: string } | null>(null);
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
          lossRatio: row.premiumUf > 0 ? row.spendUf / row.premiumUf : null,
        }));
        const previousPeriods = coverage.series.flatMap(row => row.previousPeriod ? [row.previousPeriod] : []);
        const missingPrevious = coverage.series.filter(row => row.previousLossRatio == null);
        return (
          <div key={coverage.coverage} className="glass-panel rounded-3xl p-6 shadow-soft-xl">
          <h2 className="font-display text-xl">Siniestralidad - {coverage.coverage}</h2>
            <p className="mt-2 text-sm text-ink/70">Actual: {formatReportPeriods(coverage.series.map(row => row.period))} · Anterior: {formatReportPeriods(previousPeriods)}</p>
            {missingPrevious.length > 0 && <p className="mt-1 text-xs text-ink/70">Sin comparación disponible en {missingPrevious.length} de {coverage.series.length} meses.</p>}
            <p className="mt-2 text-xs text-ink/70">Comparación con el mismo mes del año anterior. Los meses sin prima válida no muestran punto comparativo.</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={seriesWithRatio} onClick={state => {
                  const period = state?.activeLabel;
                  if (typeof period === "string" && coverage.series.some(row => row.period === period)) setSelected({ coverage: coverage.coverage, period });
                }}>
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
                    labelFormatter={(label) => {
                      const row = coverage.series.find(item => item.period === String(label));
                      return `${formatReportMonth(String(label))}${row?.previousPeriod ? ` · Anterior: ${formatReportMonth(row.previousPeriod)}` : ""}`;
                    }}
                    formatter={(value: number, name: string) =>
                      name.startsWith("% Siniestralidad") ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)
                    }
                  />
                  <Legend />
                  <Line yAxisId="right" dataKey="previousLossRatio" name="% Siniestralidad año anterior"
                    stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} />
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
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList
                      dataKey="lossRatio"
                      position="top"
                      formatter={(value: number | null) => value == null ? "" : `${(value * 100).toFixed(0)}%`}
                      fill="var(--text)"
                      fontSize={10}
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="account-ui account-form mt-4"><label>Explorar mes (también puedes pulsar el gráfico)
              <select value={selected?.coverage === coverage.coverage ? selected.period : ""} onChange={event => setSelected(event.target.value ? { coverage: coverage.coverage, period: event.target.value } : null)}>
                <option value="">Selecciona un mes</option>{coverage.series.map(row => <option key={row.period} value={row.period}>{row.period}</option>)}
              </select>
            </label></div>
            {selected?.coverage === coverage.coverage && coverage.series.some(row => row.period === selected.period) && <MonthlyDetailPanel key={`${client}-${selected.coverage}-${selected.period}`} client={client} coverage={selected.coverage} period={selected.period} onClose={() => setSelected(null)} />}
          </div>
        );
      })}
    </div>
  );
}
