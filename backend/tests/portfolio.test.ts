import { test } from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { parsePremiums } from "../src/parser.js";
import { getPortfolio, summarizeClient } from "../src/portfolio.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function workbook(rows: Record<string, unknown>[]) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet(rows), "Primas");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" });
}
const source = { "Nombe Cliente": "Cliente A", "Rut Cliente": 1234, "Póliza": 123,
  "Periodo": Date.UTC(2025, 9, 1) / 86400000 + 25569, "Cobertura": "Salud", "Prima UF": 100, "Gasto UF": 70,
  "N.º titulares": 10, "N.º carga": 20, "KAM": "Ana", "Jefe": "Juan" };

test("cartera: cada consulta refleja las primas reemplazadas y excluye clientes sin primas", async () => {
  const clients = [{ id: "a", name: "Cliente A" }, { id: "b", name: "Cliente B" }];
  const rows = parsePremiums(workbook([source]));
  let datasets = [{ client_id: "a", kind: "primas", rows }];
  const db = { from(table: string) {
    let kind: string | undefined;
    const query = {
      select() { return query; },
      eq(column: string, value: string) { assert.equal(column, "kind"); kind = value; return query; },
      order() { return query; },
      async range(start: number, end: number) {
        const data = table === "clients" ? clients : datasets.filter(dataset => dataset.kind === kind);
        return { data: data.slice(start, end + 1), error: null };
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  const before = await getPortfolio(db);
  assert.deepEqual(before.clients.map(client => client.id), ["a"]);
  assert.equal(before.clients[0].monthlyPremiumUf, 100);
  datasets = [{ client_id: "b", kind: "primas", rows: [{ ...rows[0], clientName: "Cliente B",
    period: "2026-09", premiumUf: 250, holders: 30, dependents: 40 }] }];
  const after = await getPortfolio(db);
  assert.deepEqual(after.clients.map(client => client.id), ["b"]);
  assert.equal(after.clients[0].latestPeriod, "2026-09");
  assert.equal(after.clients[0].monthlyPremiumUf, 250);
  assert.equal(after.clients[0].annualPremiumUf, 3000);
  assert.equal(after.clients[0].holders, 30);
  assert.equal(after.clients[0].dependents, 40);
});

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
