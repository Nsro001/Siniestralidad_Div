import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseUpload } from "../src/parser.js";

test("CSV grande: 25.472 filas y 62 columnas con heap limitado, sin perder filas", () => {
  // Proceso aislado: detecta la regresión de retener todas las celdas crudas.
  // Datos sintéticos; el archivo del usuario nunca se incorpora al repositorio.
  const parser = new URL("../src/parser.ts", import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { parseUpload } from ${JSON.stringify(parser)};
    const extra = Array.from({length:58}, (_, i) => 'Auxiliar ' + i);
    const header = ['Nombre Con','PERIODO','Clasif.Cob','Reembolso',...extra].join(';');
    const line = ['Cliente prueba','2025-01','Consulta','1,5',...extra.map(() => 'Contenido auxiliar')].join(';');
    const buffer = Buffer.from(header + '\\n' + (line + '\\n').repeat(25472));
    const rows = await parseUpload(buffer, 'gastos', 'grande.csv');
    assert.equal(rows.length, 25472);
    assert.ok(rows.every(row => row.reembolsoUf === 1.5 && row.period === '2025-01'));
  `;
  const result = spawnSync(process.execPath, ["--max-old-space-size=128", "--import", "tsx", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("CSV por bloques: conserva comillas y saltos; rechaza errores después de varios bloques", async () => {
  const header = 'Nombre Con;PERIODO;Clasif.Cob;Reembolso\r\n';
  const line = '"Cliente ""Uno""\nSur";2025-01;"Consulta; médica";"1,5"\r\n';
  const rows = await parseUpload(Buffer.from(header + line.repeat(501)), "gastos", "gastos.csv");
  assert.equal(rows.length, 501);
  assert.ok(rows.every(row => row.clientName === 'Cliente "Uno"\nSur' && row.descCober === 'Consulta; médica' && row.reembolsoUf === 1.5));
  await assert.rejects(parseUpload(Buffer.from(header + line.repeat(500) + '"Sin cierre'), "gastos", "gastos.csv"), /sin cierre/);
  await assert.rejects(parseUpload(Buffer.from(header + line.repeat(500) + 'columnas;faltantes'), "gastos", "gastos.csv"), /columnas/);
});
