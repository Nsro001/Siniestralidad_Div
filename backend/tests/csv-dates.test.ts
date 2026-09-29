import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUpload } from "../src/parser.js";
import { buildGastosReport } from "../src/report.js";

test("CSV: fechas locales con año corto conservan los doce meses y la comparación anual", async () => {
  const lines: string[] = [];
  for (const year of [24, 25]) for (let month = 1; month <= 12; month++) {
    lines.push(`A;01/${String(month).padStart(2, "0")}/${year};CONSULTAS;${year === 24 ? 10 : 20}`);
  }
  const expenses = await parseUpload(Buffer.from('Nombre Con;PERIODO;Clasif.Cob;Reembolso\n' + lines.join('\n')), "gastos", "gastos.csv");
  assert.equal(new Set(expenses.map(row => row.period)).size, 24);
  const periods = Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, "0")}`);
  const report = buildGastosReport(expenses, "A", "Salud", periods.join(','));
  assert.equal(report.comparison.complete, true);
  assert.equal(report.rows[0].previousTotalUf, 120);
  assert.equal(report.rows[0].variationPercent, 100);
});

test("CSV: primas y renovación, días mayores a 12, años completos y bisiestos", async () => {
  const lines = [
    'A;01/02/25;Salud;100;10;31/12/25',
    'A;29-02-24;Salud;100;10;29/02/24',
    'A;01/11/2024;Salud;100;10;01/11/2025',
    'A;2025-03-01;Salud;100;10;2025-03-01',
    'A;01/01/99;Salud;100;10;01/01/99',
    'A;31/02/25;Salud;100;10;31/02/25',
    'A;29/02/25;Salud;100;10;29/02/25',
  ];
  const rows = await parseUpload(Buffer.from('Nombre Cliente;Periodo;Cobertura;Prima UF;Gasto UF;Renovación\n' + lines.join('\n')), "primas", "primas.csv");
  assert.deepEqual(rows.map(row => row.period), ['2025-02', '2024-02', '2024-11', '2025-03', '1999-01']);
  assert.equal(rows[0].renewalDate, '2025-12-31');
  assert.equal(rows[1].renewalDate, '2024-02-29');
});
