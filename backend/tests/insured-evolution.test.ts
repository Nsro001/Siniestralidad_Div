import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsuredEvolution } from "../src/report.js";
import type { PremiumRow } from "../src/types.js";

const row: PremiumRow = { clientName: "A", clientRut: undefined, period: "2026-01", coverage: "Salud", premiumUf: 100, spendUf: 50, holders: 10, dependents: 4 };
test("evolución suma pólizas de Salud sin duplicar coberturas y ordena los meses seleccionados", () => {
  const rows = [row, { ...row, policy: "2", holders: 3, dependents: 2 }, { ...row, coverage: "Dental" }, { ...row, clientName: "B" }];
  assert.deepEqual(buildInsuredEvolution(rows, "A", "2026-02,2026-01,2026-01"), [
    { period: "2026-01", holders: 13, dependents: 6 }, { period: "2026-02", holders: null, dependents: null },
  ]);
});
test("evolución conserva ceros y no presenta sumas parciales como completas", () => {
  assert.deepEqual(buildInsuredEvolution([{ ...row, holders: 0, dependents: null }], "A"), [{ period: "2026-01", holders: 0, dependents: null }]);
  assert.deepEqual(buildInsuredEvolution([row, { ...row, holders: undefined }], "A")[0], { period: "2026-01", holders: null, dependents: 8 });
});
