import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyDetail } from "../src/monthly.js";
import type { PremiumRow, ExpenseRow } from "../src/types.js";
const premium = (period: string, premiumUf = 100, spendUf = 100): PremiumRow => ({ clientName: "A", clientRut: undefined, period, coverage: "Salud", premiumUf, spendUf });
const expense = (period: string, amount: number, extras: Partial<ExpenseRow> = {}): ExpenseRow => ({ clientName: "A", period, coverage: "Salud", descCober: "CONSULTAS", reembolsoUf: amount, provider: "Clínica", patientRut: "123-4", insuredRut: "999-9", relation: "T", isapre: "", valPrest: 0, valBonif: 0, mtoReclam: 0, ...extras });
test("detalle mensual: variación, caída de prima, hospitalización y conciliación con ajustes", () => {
  const p = [premium("2025-01"), premium("2025-02"), premium("2025-03"), premium("2025-04", 80, 350)];
  const e = [expense("2025-01", 100), expense("2025-02", 100), expense("2025-03", 100), expense("2025-04", 100),
    expense("2025-04", 200, { descCober: "Hospitalización", patientRut: "456-7" }), expense("2025-04", -10),
    expense("2025-04", 20, { descCober: "PRESTACIONES SIN BONIFICACION (S)" }),
    expense("2025-04", 9999, { clientName: "Otro" }), expense("2025-04", 9999, { coverage: "Dental" })];
  const result = buildMonthlyDetail(p, e, "A", "Salud", "2025-04");
  assert.equal(result.analyzedUf, 300); assert.equal(result.rawExpenseUf, 310);
  assert.equal(result.differenceUf, 40); assert.equal(result.excludedUf, 10);
  assert.equal(result.averageExpenseUf, 100); assert.equal(result.hospitalUf, 200);
  assert.equal(result.lines, 2); assert.equal(result.patients, 2);
  assert.equal(result.prestations[0].increaseUf, 200);
  assert.ok(result.insights.some(text => text.includes("prima del mes es menor")));
  assert.ok(result.insights.some(text => text.includes("más líneas")));
  assert.ok(result.insights.some(text => text.includes("promedio por línea es mayor")));
  assert.equal(result.cases[0].name, "Caso 1");
  assert.ok(!JSON.stringify(result).includes("456-7"));
});
test("meses faltantes no se consideran ceros ni se sustituyen por meses antiguos", () => {
  const result = buildMonthlyDetail([premium("2024-09"), premium("2024-12"), premium("2025-02")],
    [expense("2024-09", 900), expense("2024-12", 60)], "A", "Salud", "2025-02");
  assert.deepEqual(result.baselinePeriods, ["2024-12"]);
  assert.deepEqual(result.missingBaselinePeriods, ["2024-11", "2025-01"]);
  assert.equal(result.averageExpenseUf, 60); assert.equal(result.analyzedUf, null);
  assert.equal(result.lines, null); assert.equal(result.differenceUf, null);
  assert.ok(result.prestations.every(row => row.increaseUf === null));
});
test("consolidado incluye Salud Dental Catastrófico; personas sin RUT no cuentan como identificadas", () => {
  const result = buildMonthlyDetail([premium("2025-04")], [expense("2025-04", 10),
    expense("2025-04", 20, { coverage: "Dental", patientRut: "(Sin rut paciente)" }),
    expense("2025-04", 30, { coverage: "Vida" })], "A", "Consolidado S+D+C", "2025-04");
  assert.equal(result.analyzedUf, 30); assert.equal(result.patients, 1); assert.equal(result.unidentifiedLines, 1);
  assert.equal(result.averageExpenseUf, null); assert.equal(result.cases.length, 1);
});
