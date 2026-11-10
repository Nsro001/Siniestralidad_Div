import { isExcludedContractCandidate } from "../../shared/contractPolicy.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageText, ExtractedField } from "../../shared/portfolio.js";
import { HttpError } from "./supabase.js";
import { bboxWords, gridTables, tsvWords, retainedLayout } from "./policyTableGeometry.js";
import { extractContractConditions } from "./policyConditions.js";
const exec = promisify(execFile);
export type LocalRunner = (command: string, args: string[]) => Promise<string>;
const run: LocalRunner = async (command, args) => {
  try {
    const result = await exec(command, args, {
      timeout: 45000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, OMP_THREAD_LIMIT: "1" },
    });
    return result.stdout;
  } catch (error: any) {
    if (error.code === "ENOENT")
      throw new HttpError(
        503,
        "Extracción local no disponible. Instala Poppler y Tesseract (spa y eng), o usa la imagen Docker del backend.",
      );
    if (/password/i.test(String(error.stderr ?? "")))
      throw new HttpError(422, "Este PDF requiere una contraseña de apertura válida. Solicítala al usuario autorizado.");
    throw new HttpError(
      422,
      "No se pudo procesar el PDF localmente. Revisa si está protegido, dañado o supera los límites de procesamiento.",
    );
  }
};
export function tableRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .split(/\s{2,}|\t/)
        .map((c) => c.trim()),
    )
    .filter((c) => c.length > 1 && c.some(Boolean));
}
export function documentSections(text: string): string[] {
  const rules: Array<[string, RegExp]> = [
    ["Carátula", /car[aá]tula|datos del contratante|nombre contratante/i],
    ["Condiciones particulares", /condiciones particulares/i],
    ["Condiciones generales", /condiciones generales/i],
    ["Anexo", /(?:^|\n)\s*(?:anexo|endoso)\b/i],
    ["Tabla de beneficios", /tabla de beneficios|cuadro de (?:beneficios|coberturas)|prestaci[oó]n\s+(?:porcentaje|reembolso|tope)/i],
  ];
  return rules.filter(([,pattern]) => pattern.test(text)).map(([label]) => label);
}
function normalizedDate(value: string) {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  return m
    ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : value;
}
export function extractCandidates(pages: PageText[]): ExtractedField[] {
  const rules: Array<[string, RegExp]> = [
    [
      "legal_name",
      /(?:raz[oó]n social|contratante|nombre del cliente)\s*[:：]\s*(.+)/i,
    ],
    [
      "rut",
      /(?:rut|r\.u\.t\.)\s*(?:del contratante|contratante|cliente)\s*[:：]?\s*([\d.]{7,12}-[\dkK])/i,
    ],
    ["insurer", /(?:aseguradora|compa[ñn][ií]a de seguros)\s*[:：]\s*(.+)/i],
    [
      "number",
      /(?:p[oó]liza\s*(?:n[°ºo.]*)?|n[úu]mero de p[oó]liza)\s*[:：]\s*([\w./-]+)/i,
    ],
    [
      "startsOn",
      /(?:inicio de vigencia|vigencia desde|fecha de inicio|vigente desde)\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ],
    [
      "endsOn",
      /(?:fin de vigencia|vigencia hasta|fecha de t[eé]rmino|vigente hasta)\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ],
    ["premiumPerInsured", /prima\s+(?:por asegurado|individual)\s*[:：]\s*(.+)/i],
    ["cmf", /\b((?:POL|CAD)\s*\d[\d .-]{5,})/i],
    ["renewal", /(?:renovaci[oó]n)\s*[:：]\s*(.+)/i],
    ["commission", /comisi[oó]n\s*[:：]\s*(.+)/i],
    ["currency", /moneda\s*[:：]\s*(UF|CLP|USD)\b/i],
    [
      "periodicity",
      /(?:periodicidad|modalidad pago de prima)\s*[:：]\s*(mensual|trimestral|semestral|anual|[úu]nica)\b/i,
    ],
    ["broker", /corredor\s*[:：]\s*(.+)/i],
    ["plan", /(?:plan|grupo)\s*[:：]\s*(.+)/i],
    [
      "condition",
      /((?:deducible|capital|exclusi[oó]n|carencia|prestaci[oó]n|tope|reembolso|edad de ingreso|edad de permanencia|BMI|farmacia|convenio|activaci[oó]n|tasa)\b.+)/i,
    ],

  ];
  const fields: ExtractedField[] = [];
  for (const page of pages)
    for (const line of page.text.split(/\r?\n/)) {
      for (const [key, re] of rules) {
        const m = re.exec(line);
        if (m) {
          let value = m[1].trim();
          if (key.endsWith("On")) value = normalizedDate(value);
          if (key === "currency") value = value.toUpperCase();
          if (key === "periodicity")
            value =
              (
                {
                  mensual: "monthly",
                  trimestral: "quarterly",
                  semestral: "semiannual",
                  anual: "annual",
                  única: "single",
                  unica: "single",
                } as Record<string, string>
              )[value.toLowerCase()] ?? value;
          if (key === "commission" && /^\d+(?:[,.]\d+)?\s*%$/.test(value))
            value = value.replace(/\s*%$/, "").replace(",", ".");
          fields.push({
            key,
            value,
            page: page.page,
            quote: line.trim(),
            confidence: "candidate",
          });
        }
      }
    }
  for (const page of pages) {
    let section = "";
    const lines = page.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/datos del contratante/i.test(line)) section = "client";
      if (/datos del asegurador/i.test(line)) section = "insurer";
      if (/datos del (?:corredor|intermediario)/i.test(line)) section = "broker";
      if (section === "client") {
        const rut = /^\s*(?:rut|r\.u\.t\.)\s*:?\s*([\d.]{7,12}-[\dkK])\b/i.exec(line);
        if (rut) fields.push({key:"rut",value:rut[1],page:page.page,quote:line.trim(),confidence:"candidate"});
      }
      const row = /(?:nombre o raz[oó]n social|nombre contratante)\s*:?\s{2,}(.+)/i.exec(line);
      if (row && ["client", "insurer"].includes(section)) fields.push({key:section === "client" ? "legal_name" : "insurer",value:row[1].trim(),page:page.page,quote:line.trim(),confidence:"candidate"});
      const spanish = /desde\s+(\d{1,2})\s+de\s+(\w+)\s+(\d{4})\s+hasta\s+(\d{1,2})\s+de\s+(\w+)\s+(\d{4})/i.exec(line);
      if (spanish && /vigencia/i.test(line)) {
        const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
        for (const [offset,key] of [[1,"startsOn"],[4,"endsOn"]] as const) {
          const month = months.indexOf(spanish[offset+1].toLowerCase()) + 1;
          if (month) fields.push({key,value:`${spanish[offset+2]}-${String(month).padStart(2,"0")}-${spanish[offset].padStart(2,"0")}`,page:page.page,quote:line.trim(),confidence:"candidate"});
        }
      }
      if (/fecha vigencia inicial\s+fecha vigencia final/i.test(line)) {
        const dates = lines[i+1]?.match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}/g);
        if (dates?.length === 2) for (const [index,key] of ["startsOn","endsOn"].entries()) fields.push({key,value:normalizedDate(dates[index]),page:page.page,quote:lines[i+1].trim(),confidence:"candidate"});
      }
    }
  }
  // Solo títulos explícitos o filas de tablas contractuales; nunca menciones en exclusiones.
  for (const page of pages) {
    const referenced = /(?:^|\n)\s*(?:\d+[.]?\s*)?(?:exclusiones|condiciones generales)/i.test(page.text);
    for (const type of ["Vida", "Salud", "Dental", "Catastrófico"] as const) {
      const candidate = page.contractCandidates?.find(c => c.coverage === type && c.eligibility === "benefit");
      const title = !referenced ? page.text.split(/\r?\n/).find(line => new RegExp(`^\\s*(?:seguro(?: complementario)?(?: de)?|plan|cobertura(?:s)? contratada(?:s)?\\s*:)\\s+${type}`, "i").test(line)) : undefined;
      if ((candidate || title) && !fields.some(f => f.key === "coverage" && f.value === type))
        fields.push({key:"coverage",value:type,page:page.page,quote:candidate?.quote ?? title!.trim(),confidence:"candidate"});
    }
  }
  return fields.filter(f=>!isExcludedContractCandidate(f)).slice(0, 3000);
}
let running = false;
export async function extractPdf(
  buffer: Buffer,
  runner: LocalRunner = run,
  forceOcr = false,
  password = "",
): Promise<{ pages: PageText[]; fields: ExtractedField[] }> {
  if (running)
    throw new HttpError(
      429,
      "Hay otro PDF en procesamiento local. Reintenta en unos minutos.",
    );
  if (
    buffer.length > 20 * 1024 * 1024 ||
    !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))
  )
    throw new HttpError(400, "Carga un PDF válido de hasta 20 MB.");
  running = true;
  let folder: string | undefined;
  try {
    folder = await mkdtemp(join(tmpdir(), "portfolio-pdf-"));
    const file = join(folder, "original.pdf");
    await writeFile(file, buffer, { mode: 0o600 });
    if (typeof password !== "string" || password.length > 256 || /[\r\n\0]/.test(password)) throw new HttpError(400, "Contraseña inválida.");
    const credentials = password ? ["-upw", password] : [];
    const info = await runner("pdfinfo", [...credentials, file]);
    const count = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
    if (!count || count > 80)
      throw new HttpError(
        422,
        "El PDF debe tener entre 1 y 80 páginas. Divide documentos extensos sin alterar sus originales.",
      );
    const restricted = /^Encrypted:\s+yes.*copy:no/m.test(info);
    const pages: PageText[] = [];
    const deadline = Date.now() + 5 * 60 * 1000;
    for (let page = 1; page <= count; page++) {
      if (Date.now() > deadline)
        throw new HttpError(
          422,
          "El procesamiento superó cinco minutos. Divide el documento y vuelve a intentar.",
        );
      let content = restricted ? "" : await runner("pdftotext", [
        ...credentials,
        "-f",
        String(page),
        "-l",
        String(page),
        "-layout",
        "-enc",
        "UTF-8",
        file,
        "-",
      ]);
      let method: "text" | "ocr" = "text";
      if (restricted || forceOcr || content.replace(/\s/g, "").length < 40) {
        const image = join(folder, `page-${page}`);
        await runner("pdftoppm", [
          ...credentials,
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-scale-to",
          "2400",
          "-png",
          file,
          image,
        ]);
        const digitalText = content;
        content = await runner("tesseract", [
          `${image}.png`,
          "stdout",
          "-l",
          "spa+eng",
          "--psm",
          "3",
        ]);

        if (digitalText.trim())
          content = `${digitalText}\n\n[OCR local]\n${content}`;
        method = "ocr";
      }
      if (content.length > 200000)
        throw new HttpError(
          422,
          "La página supera el límite de texto permitido.",
        );
      if (pages.reduce((sum, p) => sum + p.text.length, 0) + content.length > 8 * 1024 * 1024)
        throw new HttpError(422, "El documento supera el límite total de texto extraído (8 MB).");
      let benefitTables: PageText["benefitTables"] = [];
      const extractionWarnings: string[] = [];
      if ((tableRows(content).length >= 3 || method === "ocr" && (content.match(/%|\bUF\b/g)?.length ?? 0) >= 3) && /reembolso|capital|deducible|edad|tasa|tope|prima|tarifa|renta/i.test(content)) {
        try {
          const words = method === "text"
            ? bboxWords(await runner("pdftotext", [...credentials, "-f", String(page), "-l", String(page), "-bbox-layout", file, "-"]))
            : tsvWords(await runner("tesseract", [join(folder, `page-${page}.png`), "stdout", "-l", "spa+eng", "--psm", "3", "tsv"]));
          if (words.length) {
            const raster = join(folder, `grid-${page}`);
            try {
              await runner("pdftoppm", [...credentials, "-f", String(page), "-l", String(page), "-singlefile", "-r", "96", "-scale-to", "1600", "-gray", file, raster]);
              benefitTables = gridTables(await readFile(`${raster}.pgm`), words, content, page);
            } finally { await rm(`${raster}.pgm`, { force: true }); }
          }
        } catch { extractionWarnings.push("No se pudo reconstruir la cuadrícula; se conserva el texto y las filas para revisión."); }
      } else if (method === "ocr") extractionWarnings.push("OCR sin cuadrícula validada: las asociaciones de columnas requieren revisión.");
      if (tableRows(content).length >= 3 && /reembolso|capital|deducible|edad|tasa|tope|prima|tarifa|renta/i.test(content))
        benefitTables.push(retainedLayout(content.replace(/\u0000/g, ""), page));
      await rm(join(folder, `page-${page}.png`), { force: true });
      pages.push({
        page,
        text: content.replace(/\u0000/g, ""),
        method,
        tables: tableRows(content),
        sections: documentSections(content),
        benefitTables,
        extractionWarnings,
      });
    }
    extractContractConditions(pages);
    if (Buffer.byteLength(JSON.stringify(pages)) > 16 * 1024 * 1024)
      throw new HttpError(422,"La extracción estructurada supera 16 MB. Divide el documento conservando el original.");
    return { pages, fields: extractCandidates(pages) };
  } finally {
    running = false;
    if (folder) await rm(folder, { recursive: true, force: true });
  }
}

// Vista efímera del original. Comparte el límite de concurrencia del extractor.
export async function renderPolicyPage(buffer:Buffer,page:number,password='',runner:LocalRunner=run):Promise<Buffer> {
  if(running)throw new HttpError(429,'Hay otro PDF en procesamiento local. Reintenta.');
  if(!Number.isInteger(page)||page<1||page>80||buffer.length>20*1024*1024||!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new HttpError(400,'PDF o página inválidos.');
  if(typeof password!=='string'||password.length>256||/[\r\n\0]/.test(password))throw new HttpError(400,'Contraseña inválida.');
  running=true;let folder:string|undefined;
  try {
    folder=await mkdtemp(join(tmpdir(),'portfolio-view-'));
    const file=join(folder,'original.pdf'),output=join(folder,'page');await writeFile(file,buffer,{mode:0o600});
    await runner('pdftoppm',[...(password?['-upw',password]:[]),'-f',String(page),'-l',String(page),'-singlefile','-scale-to','1600','-png',file,output]);
    return await readFile(`${output}.png`);
  }finally{running=false;if(folder)await rm(folder,{recursive:true,force:true});}
}
