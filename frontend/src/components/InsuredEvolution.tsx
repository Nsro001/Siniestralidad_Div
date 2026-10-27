import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PrimasReport } from "../types";
import { formatReportMonth } from "../lib/reportPeriods";

const number = (value: number | null) => value == null ? "Sin datos" : value.toLocaleString("es-CL");

export default function InsuredEvolution({ rows }: { rows: NonNullable<PrimasReport["insuredEvolution"]> }) {
  if (!rows.length) return <p className="text-sm text-ink/70">Sin datos de titulares y cargas para los meses seleccionados.</p>;
  return <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
    <p className="text-sm text-ink/70">Población asegurada de Salud · Sábana de primas</p>
    <div className="mt-4" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d7" />
          <XAxis dataKey="period" tickFormatter={formatReportMonth} tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={label => formatReportMonth(String(label))} formatter={value => typeof value === "number" ? number(value) : "Sin datos"} />
          <Legend />
          <Bar dataKey="holders" name="N° de Titulares" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="dependents" name="N° de cargas" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <table className="mt-4 w-full border-collapse text-center" style={{ tableLayout: "fixed", fontSize: rows.length > 18 ? 9 : 11 }}>
      <caption className="sr-only">Evolución mensual de titulares y cargas</caption>
      <thead><tr><th scope="col" className="border border-ink/20 p-2 text-left" style={{ width: 130 }}>Mes</th>{rows.map(row => <th scope="col" key={row.period} className="border border-ink/20 p-1">{formatReportMonth(row.period)}</th>)}</tr></thead>
      <tbody>{([ ["holders", "N° de Titulares"], ["dependents", "N° de cargas"] ] as const).map(([field, label]) => <tr key={field}><th scope="row" className="border border-ink/20 p-2 text-left">{label}</th>{rows.map(row => <td key={row.period} className="border border-ink/20 p-1">{number(row[field])}</td>)}</tr>)}</tbody>
    </table>
    {rows.some(row => row.holders == null || row.dependents == null) && <p className="mt-2 text-xs text-ink/70">Sin datos: el mes no tiene cantidades completas de Salud en la sábana de primas.</p>}
  </div>;
}
