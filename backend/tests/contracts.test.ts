import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { dirname } from "node:path";
import {
  normalizeRut,
  validateContract,
  policyState,
  effectivePolicies,
} from "../src/contracts.js";
import { extractCandidates, extractPdf, tableRows } from "../src/policyPdf.js";
import type { PolicyContract, PolicyVersion } from "../../shared/portfolio.js";
function fixture(): PolicyContract {
  return {
    number: "000123",
    insurer: "Aseguradora de prueba",
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    currency: "UF",
    premium: "100.25",
    periodicity: "monthly",
    commission: "10",
    commissionBasis: "Prima neta",
    broker: "",
    kam: "Ana",
    status: "active",
    cancellationDate: "",
    coverages: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        type: "Salud",
        name: "Salud",
        plans: [
          {
            id: "00000000-0000-4000-8000-000000000102",
            name: "Plan A",
            groups: ["Grupo 1", "Grupo 2"],
            terms: [
              {
                id: "00000000-0000-4000-8000-000000000103",
                label: "Deducible familiar",
                value: "2",
                unit: "UF",
                scope: "Familia",
                period: "Anual",
              },
            ],
          },
        ],
      },
    ],
    evidence: {},
  };
}
test("RUT: normaliza, verifica DV y conserva ausencia", () => {
  assert.equal(normalizeRut("12.345.678-5"), "12345678-5");
  assert.equal(normalizeRut(""), null);
  assert.equal(normalizeRut("01.234.567-4"), "1234567-4");
  assert.throws(() => normalizeRut("12.345.678-4"));
  assert.throws(() => normalizeRut("1234"));
});
test("contrato: rechaza fechas, importes, duplicados y condiciones vacías", () => {
  const c = fixture();
  assert.equal(validateContract(c).number, "000123");
  assert.equal(Object.hasOwn(validateContract({...c,premium:"NaN"}),"premium"),false);
  for (const changes of [
    { endsOn: "2025-01-01" },
    { startsOn: "2026-02-30" },
    { commission: "101" },
    { coverages: [...c.coverages, ...c.coverages] },
  ])
    assert.throws(() => validateContract({ ...c, ...changes }));
  c.coverages[0].plans[0].terms[0].value = "";
  assert.throws(() => validateContract(c));
});
test("versiones: borrador/futuro no desplazan vigente; límites y cancelaciones", () => {
  const c = fixture();
  const base = {
    id: "v1",
    policy_id: "p1",
    client_id: "c",
    revision: 1,
    change_type: "initial",
    effective_on: "2026-01-01",
    validation_status: "validated",
    contract: c,
    created_at: "",
    created_by: "",
    note: "",
  } as PolicyVersion;
  const future = {
    ...base,
    id: "v2",
    revision: 2,
    effective_on: "2027-01-01",
    change_type: "renewal",
    contract: { ...c, startsOn: "2027-01-01", endsOn: "2027-12-31" },
  } as PolicyVersion;
  const draft = {
    ...base,
    id: "v3",
    revision: 3,
    validation_status: "draft",
  } as PolicyVersion;
  assert.equal(
    effectivePolicies([base, future, draft], "2026-10-30")[0].id,
    "v1",
  );
  assert.equal(
    effectivePolicies([base, future, draft], "2027-02-01")[0].id,
    "v2",
  );
  assert.equal(policyState(c, "2026-01-01"), "active");
  assert.equal(policyState(c, "2026-12-31"), "active");
  assert.equal(policyState(c, "2027-01-01"), "expired");
  assert.equal(
    policyState(
      { ...c, status: "cancelled", cancellationDate: "2026-11-01" },
      "2026-10-30",
    ),
    "active",
  );
});
test("PDF: candidatos con cita/página y filas tabulares sin inventar condiciones", () => {
  const fields = extractCandidates([
    {
      page: 2,
      method: "text",
      text: "Razón social: Prueba SpA\nPóliza: 000123\nInicio de vigencia: 01/10/2026\nDeducible: 2 UF",
    },
  ]);
  assert.equal(fields.find((f) => f.key === "number")?.value, "000123");
  assert.equal(fields.find((f) => f.key === "startsOn")?.value, "2026-10-01");
  assert.ok(fields.every((f) => f.page === 2 && f.quote));
  assert.deepEqual(
    tableRows(
      "Prestación   Porcentaje   Tope\nConsulta   80%   2 UF\nTexto simple",
    ),
    [
      ["Prestación", "Porcentaje", "Tope"],
      ["Consulta", "80%", "2 UF"],
    ],
  );
});
test("PDF: OCR local por página y limpieza de temporales", async () => {
  let folder = "";
  const calls: string[] = [];
  const result = await extractPdf(
    Buffer.from("%PDF-1.7\nfixture"),
    async (command, args) => {
      calls.push(command);
      if (command === "pdfinfo") {
        folder = dirname(args[0]);
        return "Pages: 2\nEncrypted: no\n";
      }
      if (command === "pdftotext")
        return args[1] === "1"
          ? "Póliza: 000123\n" + "Texto digital de prueba. ".repeat(5)
          : "";
      if (command === "pdftoppm") return "";
      if (command === "tesseract") return "Deducible: 2 UF\nTexto escaneado";
      throw new Error("Comando inesperado");
    },
  );
  assert.deepEqual(
    result.pages.map((p) => p.method),
    ["text", "ocr"],
  );
  assert.ok(calls.includes("tesseract"));
  assert.equal(result.fields.find((f) => f.key === "condition")?.page, 2);
  await assert.rejects(access(folder));
  await assert.rejects(extractPdf(Buffer.from("no PDF")), /PDF válido/);
  await assert.rejects(
    extractPdf(Buffer.from("%PDF-1.7"), async () => "Pages: 100\n"),
    /80 páginas/,
  );
});

test("PDF mixto: OCR forzado conserva texto digital y agrega texto reconocido", async () => {
  const digital = "Cabecera digital con texto suficiente para no activar OCR automáticamente.";
  const result = await extractPdf(Buffer.from("%PDF-1.7"), async command => {
    if (command === "pdfinfo") return "Pages: 1\nEncrypted: no\n";
    if (command === "pdftotext") return digital;
    if (command === "pdftoppm") return "";
    return "Capital: 500 UF";
  }, true);
  assert.equal(result.pages[0].method, "ocr");
  assert.ok(result.pages[0].text.includes(digital));
  assert.ok(result.fields.some(f => f.key === "condition" && f.quote === "Capital: 500 UF"));
});
