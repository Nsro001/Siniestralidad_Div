import { test } from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { parsePremiums } from "../src/parser.js";
import { summarizeClient } from "../src/portfolio.js";

function workbook(rows: Record<string, unknown>[]) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet(rows), "Primas");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" });
}
const source = { "Nombe Cliente": "Cliente A", "Rut Cliente": 1234, "Póliza": 123,
  "Periodo": Date.UTC(2025, 9, 1) / 86400000 + 25569, "Cobertura": "Salud", "Prima UF": 100, "Gasto UF": 70,
  "N.º titulares": 10, "N.º carga": 20, "KAM": "Ana", "Jefe": "Juan" };

test("Excel: conserva KAM, jefe, póliza y asegurados; distingue cero de dato ausente", () => {
  const rows = parsePremiums(workbook([source, { ...source, "N.º titulares": 0, "N.º carga": "" }]));
  assert.equal(rows[0].holders, 10); assert.equal(rows[0].dependents, 20);
  assert.equal(rows[0].kam, "Ana"); assert.equal(rows[0].manager, "Juan");
  assert.equal(rows[0].policy, "123"); assert.equal(rows[0].renewalDate, null);
  assert.equal(rows[1].holders, 0); assert.equal(rows[1].dependents, null);
  assert.throws(() => parsePremiums(workbook([{ ...source, "N.º titulares": -1 }])));
});

test("prima anual usa todas las coberturas del último mes del cliente, sin sumar meses anteriores", () => {
  const rows = parsePremiums(workbook([source, { ...source, "Cobertura": "Dental", "Prima UF": 25 },
    { ...source, "Periodo": Date.UTC(2025, 8, 1) / 86400000 + 25569, "Prima UF": 900 }]));
  const result = summarizeClient({ id: "a", name: "Cliente A", kam_name: "Ana", manager_name: "Juan" }, rows, "2026-09-17");
  assert.equal(result.latestPeriod, "2025-10"); assert.equal(result.monthlyPremiumUf, 125);
  assert.equal(result.annualPremiumUf, 1500); assert.equal(result.insured.length, 1);
  assert.deepEqual(result.renewals, ["2026-09-01"]);
  assert.equal(result.holders, 10); assert.equal(result.dependents, 20);
});

test("datos históricos sin nuevas columnas y clientes sin primas no inventan cantidades ni fechas", () => {
  const old = { clientName: "A", clientRut: undefined, period: "2024-11", coverage: "Salud", premiumUf: 5, spendUf: 1 };
  const result = summarizeClient({ id: "a", name: "A" }, [old]);
  assert.equal(result.annualPremiumUf, 60); assert.equal(result.insured[0].holders, null);
  const empty = summarizeClient({ id: "a", name: "A" }, []);
  assert.equal(empty.monthlyPremiumUf, null); assert.equal(empty.annualPremiumUf, null);
});

test("renovación anual: mes inicial, cambio de año y mes en curso", () => {
  const rows = parsePremiums(workbook([source]));
  const client = { id: "a", name: "Cliente A" };
  assert.deepEqual(summarizeClient(client, rows, "2026-09-17").renewals, ["2026-10-01"]);
  assert.deepEqual(summarizeClient(client, rows, "2026-10-20").renewals, ["2026-10-01"]);
  assert.deepEqual(summarizeClient(client, rows, "2026-11-01").renewals, ["2027-10-01"]);
});

test("asegurados: solo Salud del último mes, sin usar Dental ni Salud de meses anteriores", () => {
  const rows = parsePremiums(workbook([source,
    { ...source, "Cobertura": "Dental", "N.º titulares": 103, "N.º carga": 133 },
    { ...source, "Periodo": Date.UTC(2025, 8, 1) / 86400000 + 25569, "N.º titulares": 900 }]));
  const client = { id: "a", name: "Cliente A" };
  const result = summarizeClient(client, rows);
  assert.equal(result.holders, 10); assert.equal(result.dependents, 20);
  const missingHealth = summarizeClient(client, rows.filter(row => row.period !== "2025-10" || row.coverage !== "Salud"));
  assert.equal(missingHealth.holders, null); assert.equal(missingHealth.dependents, null);
  assert.deepEqual(missingHealth.insured, []);
});
