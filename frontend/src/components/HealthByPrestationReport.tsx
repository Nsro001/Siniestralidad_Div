import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { GastosReport } from "../types";

type Props = {
  report: GastosReport;
};

const ALLOWED_PRESTATIONS = new Set(["HOSPITALIZACION", "CONSULTAS", "EXAMENES", "PSICOLOGIA"]);

export default function HealthByPrestationReport({ report }: Props) {
  const data = (report.healthByPrestation ?? [])
    .filter((row) => ALLOWED_PRESTATIONS.has(row.prestation.trim().toUpperCase()))
    .map((row) => ({
      ...row,
      bonifHealthPercentDisplay: row.bonifHealthPercent * 100,
      bonifSeguroPercentDisplay: row.bonifSeguroPercent * 100,
      copagoUsuarioPercentDisplay: row.copagoUsuarioPercent * 100,
    }));

  if (data.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <p className="text-sm text-ink/70">Sin datos para porcentajes por prestación.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
      <h2 className="font-display text-xl">Porcentajes por prestación</h2>
      <div className="mt-4 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={12}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d7" />
            <XAxis dataKey="prestation" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
            <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            <Legend />
            <Bar
              dataKey="bonifHealthPercentDisplay"
              name="% Bonificación salud"
              stackId="a"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
            >
              <LabelList dataKey="bonifHealthPercentDisplay" position="center" fill="#ffffff" fontSize={9} formatter={(value: number) => `${value.toFixed(0)}%`} />
            </Bar>
            <Bar
              dataKey="bonifSeguroPercentDisplay"
              name="% Bonificación seguro"
              stackId="a"
              fill="var(--chart-2)"
              radius={[0, 0, 0, 0]}
            >
              <LabelList dataKey="bonifSeguroPercentDisplay" position="center" fill="#ffffff" fontSize={9} formatter={(value: number) => `${value.toFixed(0)}%`} />
            </Bar>
            <Bar
              dataKey="copagoUsuarioPercentDisplay"
              name="% Copago usuario"
              stackId="a"
              fill="var(--chart-3)"
              radius={[0, 0, 4, 4]}
            >
              <LabelList dataKey="copagoUsuarioPercentDisplay" position="center" fill="#ffffff" fontSize={9} formatter={(value: number) => `${value.toFixed(0)}%`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
