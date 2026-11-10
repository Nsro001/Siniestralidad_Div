// Prueba real opcional de Poppler/Tesseract, solo con documentos sintéticos.
// Ejecutar en backend: node --import tsx tests/pdf-local-smoke.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import assert from "node:assert/strict";
import { extractPdf, renderPolicyPage } from "../src/policyPdf.ts";
if (process.env.PORTFOLIO_TEST_TOOL_DIR)
  process.env.PATH = `${process.env.PORTFOLIO_TEST_TOOL_DIR}:${process.env.PATH}`;
const exec = promisify(execFile),
  folder = await mkdtemp(join(tmpdir(), "portfolio-pdf-smoke-"));
function pdf(objects) {
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(object) ? object : Buffer.from(object),
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(part);
    length += part.length;
  });
  const xref = length;
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
const text =
  "BT /F1 18 Tf 60 740 Td (Poliza: 000123) Tj 0 -40 Td (Razon social: Empresa Sintetica SpA) Tj 0 -40 Td (Inicio de vigencia: 01/01/2026) Tj 0 -40 Td (Deducible: 2 UF) Tj ET\n" +
  "BT /F1 12 Tf 50 650 Td (Cuadro de Condiciones Plan de Reembolsos MODTEST) Tj ET\n" +
  "0 G 0.5 w 50 590 m 550 590 l S 50 560 m 550 560 l S 50 530 m 420 530 l S 50 500 m 550 500 l S 50 500 m 50 590 l S 300 500 m 300 590 l S 420 500 m 420 590 l S 550 500 m 550 590 l S\n" +
  "BT /F1 11 Tf 60 570 Td (Cobertura) Tj ET BT /F1 10 Tf 305 570 Td (Porcentaje Reembolso) Tj ET BT /F1 11 Tf 425 570 Td (Tope anual UF) Tj ET\n" +
  "BT /F1 12 Tf 60 540 Td (Consulta de prueba) Tj ET BT /F1 12 Tf 320 540 Td (88%) Tj ET BT /F1 12 Tf 450 535 Td (5UF) Tj ET BT /F1 12 Tf 60 510 Td (Examen de prueba) Tj ET BT /F1 12 Tf 320 510 Td (77%) Tj ET\n";
const catalog = "<< /Type /Catalog /Pages 2 0 R >>",
  pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const stream = (content) =>
  Buffer.concat([
    Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n`),
    Buffer.from(content),
    Buffer.from("\nendstream"),
  ]);
try {
  const digital = pdf([
    catalog,
    pages,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream(text),
  ]);
  const digitalResult = await extractPdf(digital);
  assert.equal(digitalResult.pages[0].method, "text");
  assert.equal(
    digitalResult.fields.find((f) => f.key === "number")?.value,
    "000123",
  );
  assert.ok(digitalResult.pages[0].benefitTables.some(t => t.method === "grid" && t.cells.some(c => c.rowSpan === 2)));
  assert.ok(digitalResult.pages[0].contractCandidates.some(c => c.value === "88%"));
  const preview = await renderPolicyPage(digital,1);
  assert.equal(preview.subarray(1,4).toString(),"PNG");
  const file = join(folder, "digital.pdf");
  await writeFile(file, digital);
  await exec(
    "pdftoppm",
    ["-singlefile", "-scale-to", "2400", file, join(folder, "raster")],
    { timeout: 45000 },
  );
  // Fixtures cifrados creados por esta prueba; nunca documentos del usuario.
  const restricted = join(folder, "restricted.pdf");
  await exec("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-sOwnerPassword=synthetic-owner", "-dEncryptionR=3", "-dKeyLength=128", "-dPermissions=-3904", `-sOutputFile=${restricted}`, file], {timeout:45000});
  const restrictedResult = await extractPdf(await readFile(restricted));
  assert.equal(restrictedResult.pages[0].method, "ocr");
  assert.match(restrictedResult.pages[0].text, /000123/);
  assert.ok(restrictedResult.pages[0].benefitTables.some(t=>t.method==="grid"),"Cuadrícula del PDF restringido con OCR local");
  const protectedFile = join(folder, "password.pdf");
  await exec("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-sOwnerPassword=synthetic-owner", "-sUserPassword=synthetic-open", "-dEncryptionR=3", "-dKeyLength=128", `-sOutputFile=${protectedFile}`, file], {timeout:45000});
  const protectedBuffer = await readFile(protectedFile);
  await assert.rejects(extractPdf(protectedBuffer), /contraseña de apertura/);
  await assert.rejects(extractPdf(protectedBuffer, undefined, false, "incorrect"), /contraseña de apertura/);
  const unlocked = await extractPdf(protectedBuffer, undefined, false, "synthetic-open");
  assert.ok(unlocked.fields.some(f => f.key === "number"));
  console.log("PDF restringido: OCR permitido OK. Contraseña ausente/incorrecta: rechazada. Contraseña válida: lectura OK.");
  const ppm = await readFile(join(folder, "raster.ppm"));
  const match = /^P6\s+(\d+)\s+(\d+)\s+255\n/.exec(
    ppm.subarray(0, 100).toString("ascii"),
  );
  assert.ok(match, "PPM no reconocido");
  const pixels = deflateSync(ppm.subarray(match[0].length));
  const image = Buffer.concat([
    Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${match[1]} /Height ${match[2]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`,
    ),
    pixels,
    Buffer.from("\nendstream"),
  ]);
  const scanned = pdf([
    catalog,
    pages,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    image,
    stream("q 612 0 0 792 0 0 cm /Im0 Do Q"),
  ]);
  const scannedResult = await extractPdf(scanned);
  assert.equal(scannedResult.pages[0].method, "ocr");
  assert.match(scannedResult.pages[0].text, /000123/);
  assert.ok(scannedResult.fields.some((f) => f.key === "condition"));
  console.log(
    "PDF digital y PDF escaneado: extracción y OCR locales reales OK, con página y cita.",
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
