import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrimasReport, buildGastosReport } from "../src/report.js";
import type { PremiumRow, ExpenseRow } from "../src/types.js";
const p = (period: string, premiumUf: number, spendUf: number, coverage = "Salud"): PremiumRow => ({ clientName: "A", clientRut: undefined, period, coverage, premiumUf, spendUf });
const e = (period: string, reembolsoUf: number, descCober = "CONSULTAS", extras: Partial<ExpenseRow> = {}): ExpenseRow => ({ clientName: "A", period, coverage: "Salud", descCober, reembolsoUf, provider: "P", insuredRut: "", patientRut: "", relation: "T", isapre: "", valPrest: 0, valBonif: 0, mtoReclam: 0, ...extras });
test("compara el mismo mes previo y calcula el consolidado ponderado", () => {
 const rows = [p("2024-11", 100, 50), p("2024-11", 300, 300, "Dental"), p("2025-11", 100, 90), p("2024-12", 0, 20)];
 const result = buildPrimasReport(rows, "A", "Consolidado S+D+C", "2025-11,2025-12,2026-01")[0].series;
 assert.equal(result[0].previousLossRatio, 350 / 400);
 assert.equal(result[0].spendUf, 90);
 assert.equal(result[0].previousPeriod, "2024-11");
 assert.equal(result[1].previousLossRatio, null);
 assert.equal(result[2].previousLossRatio, null);
});
test("umbral estricto de 2 %, desapariciones y nuevas prestaciones", () => {
 for (const [amount, trend] of [[97.99, "down"], [98, "stable"], [100, "stable"], [102, "stable"], [102.01, "up"]] as const) {
  const r = buildGastosReport([e("2024-11", 100), e("2025-11", amount)], "A", "Salud", "2025-11");
  assert.equal(r.rows[0].trend, trend);
  assert.equal(r.rows[0].previousTotalUf, 100);
 }
 const r = buildGastosReport([e("2024-11", 100, "EXAMENES"), e("2025-11", 50)], "A", "Salud", "2025-11");
 assert.equal(r.rows.find(x => x.prestation === "EXAMENES")?.variationPercent, -100);
 assert.equal(r.rows.find(x => x.prestation === "EXAMENES")?.trend, "down");
 assert.equal(r.rows[0].trend, "up"); assert.equal(r.rows[0].variationPercent, null);
 assert.equal(r.totalUf, 50);
 assert.deepEqual(r.prestationOrder, ["CONSULTAS"]);
});
test("faltantes no equivalen a cero; respeta cliente, cobertura y exclusiones", () => {
 const rows = [e("2025-11", 90), e("2024-11", 100), e("2024-12", 200, "CONSULTAS", {clientName:"B"}), e("2024-12", 200, "CONSULTAS", {coverage:"Dental"}), e("2024-11", 999, "PRESTACIONES SIN BONIFICACION (S)"), e("2024-11", -50)];
 const partial = buildGastosReport(rows, "A", "Salud", "2025-11,2025-12");
 assert.equal(partial.comparison.complete, false);
 assert.deepEqual(partial.comparison.missingPreviousPeriods, ["2024-12"]);
 assert.equal(partial.rows[0].previousTotalUf, null);
 assert.equal(partial.rows[0].trend, "unavailable");
 const complete = buildGastosReport(rows, "A", "Salud", "2025-11");
 assert.equal(complete.rows[0].previousTotalUf, 100);
 assert.equal(complete.rows[0].variationPercent, -10);
 assert.equal(buildGastosReport([], "A").comparison.complete, false);
});
