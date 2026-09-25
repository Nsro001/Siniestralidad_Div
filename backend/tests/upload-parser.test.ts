import { test } from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { parseExpenses, parsePremiums, parseUpload } from "../src/parser.js";

function workbook(rows: Record<string, unknown>[], bookType: "xlsx" | "xls" = "xlsx") {
  const book = xlsx.utils.book_new();
  const sheet = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(book, sheet, "Datos");
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{ auxiliar: "Ignorar" }]), "Auxiliar");
  return { book, sheet, buffer: () => xlsx.write(book, { type: "buffer", bookType }) as Buffer };
}

test("streaming de gastos conserva valores, fórmulas y filas entre bloques; ignora hojas auxiliares", async () => {
  const file = workbook(Array.from({ length: 601 }, (_, index) => ({
    "Nombre Con": "Cliente de prueba", PERIODO: 45536, "Clasif.Cob": "Consulta",
    Reembolso: index / 10, "Desc.Plan": "Dental", "Desc.Insti": "Clínica",
    Rut: "11111111", Paciente: "22222222", dvg: "K", Parentesco: "T",
    "Dsc.Isapre": "Prueba", "Val.Prest.": 10, "Val.Bonif.": 3, "Mto.Reclam": 7,
  })));
  file.sheet.D2 = { t: "n", f: "1+2", v: 3 };
  file.sheet["!ref"] = "A1:O1048576";
  const buffer = file.buffer();
  const expected = parseExpenses(buffer);
  assert.equal(expected.length, 601);
  assert.deepEqual(await parseUpload(buffer, "gastos"), expected);
});

test("streaming de primas conserva fechas, ceros y campos opcionales", async () => {
  const buffer = workbook([{
    "Nombre Cliente": "Cliente de prueba", Periodo: 45536, Cobertura: "Salud",
    "Prima UF": 100, "Gasto UF": 0, "N.º titulares": 0, "N.º cargas": "",
    KAM: "Ejecutivo", Jefe: "Jefe", "Fecha renovación": 45600,
  }]).buffer();
  assert.deepEqual(await parseUpload(buffer, "primas"), parsePremiums(buffer));
});

test("la carga mantiene compatibilidad XLS y rechaza archivos vacíos o columnas incorrectas", async () => {
  const buffer = workbook([{
    "Nombre Con": "Cliente de prueba", PERIODO: 45536, "Clasif.Cob": "Consulta", Reembolso: 1,
  }], "xls").buffer();
  assert.deepEqual(await parseUpload(buffer, "gastos"), parseExpenses(buffer));
  await assert.rejects(parseUpload(Buffer.alloc(0), "gastos"));
  await assert.rejects(parseUpload(workbook([{ incorrecto: 1 }]).buffer(), "gastos"), /Headers/);
});
