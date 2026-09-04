import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
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

export default function SystemHealthReport({ report }: Props) {
  const isapreData = report.isapreDistribution ?? [];
  const metrics = report.systemHealthMetrics;
  const barData = [
    {
      name: "Cliente",
      bonifSalud: metrics.bonifHealthPercent * 100,
      bonifSeguro: metrics.bonifSeguroPercent * 100,
      copago: metrics.copagoUsuarioPercent * 100,
    },
    {
      name: "Esperado",
      bonifSalud: 65,
      bonifSeguro: 25,
      copago: 10,
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <h2 className="font-display text-xl">Distribución del sistema de salud</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={isapreData}
                dataKey="percent"
                nameKey="isapre"
                outerRadius={110}
                label={({ cx, cy, midAngle, outerRadius, index }) => {
                  const RAD = Math.PI / 180;
                  const radius = outerRadius + 12;
                  const x = cx + radius * Math.cos(-midAngle * RAD);
                  const y = cy + radius * Math.sin(-midAngle * RAD);
                  const item = isapreData[index ?? 0];
                  if (!item) return null;
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor={x > cx ? "start" : "end"}
                      fill="var(--text)"
                      fontSize={9}
                    >
                      {`${item.isapre} ${item.percent.toFixed(1)}%`}
                    </text>
                  );
                }}
                labelLine={false}
              >
                {isapreData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-6 shadow-soft-xl">
        <h2 className="font-display text-xl">Porcentajes del sistema de salud</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d7" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="bonifSalud" name="% Bonificación salud" stackId="a" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="bonifSalud"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  formatter={(value: number) => `${value.toFixed(0)}%`}
                />
              </Bar>
              <Bar dataKey="bonifSeguro" name="% Bonificación seguro" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]}>
                <LabelList
                  dataKey="bonifSeguro"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  formatter={(value: number) => `${value.toFixed(0)}%`}
                />
              </Bar>
              <Bar dataKey="copago" name="% Copago usuario" stackId="a" fill="var(--chart-3)" radius={[0, 0, 4, 4]}>
                <LabelList
                  dataKey="copago"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  formatter={(value: number) => `${value.toFixed(0)}%`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
