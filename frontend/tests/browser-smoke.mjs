// Sin dependencias adicionales. Requiere Brave/Chromium y permiso para localhost.
// Ejecutar desde frontend: node tests/browser-smoke.mjs
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const folder = await mkdtemp(join(tmpdir(), "portfolio-browser-"));
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5191",
    "--strictPort",
  ],
  {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://portfolio-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    },
    stdio: "ignore",
  },
);
let browser, ws;
let closeBrowser = async () => {};
let debug = async () => "";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventually(fn) {
  let last;
  for (let i = 0; i < 150; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await wait(100);
  }
  throw last || new Error("Timeout esperando la interfaz");
}
try {
  await eventually(async () => {
    const r = await fetch("http://127.0.0.1:5191/tests/portfolio.html");
    return r.ok;
  });
  browser = spawn(
    process.env.BROWSER_BIN || "brave-browser",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--no-first-run",
      `--user-data-dir=${folder}`,
      "--remote-debugging-port=5192",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const targets = await eventually(async () => {
    const r = await fetch("http://127.0.0.1:5192/json/list");
    return r.json();
  });
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.text +
          ": " +
          m.params.exceptionDetails.exception?.description,
      );
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  }
  closeBrowser = () => command("Browser.close").catch(() => {});
  async function evaluate(expression) {
    const r = await command("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  }
  async function text() {
    return evaluate("document.body.innerText");
  }
  debug = async () =>
    JSON.stringify({
      text: await text(),
      visibility: await evaluate("document.visibilityState"),
      errors,
    });
  async function click(label, scope = "document") {
    await evaluate(
      `(()=>{const b=[...(${scope}).querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('Botón ausente: '+${JSON.stringify(label)});b.click();})()`,
    );
    await wait(80);
  }
  async function field(label, value, scope = "document") {
    await evaluate(
      `(()=>{const root=${scope};const l=[...root.querySelectorAll('label')].find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)});const e=l?.querySelector('input,select,textarea');if(!e)throw new Error('Campo ausente: '+${JSON.stringify(label)});const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`,
    );
    await wait(80);
  }
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.navigate", {
    url: "http://127.0.0.1:5191/tests/portfolio.html",
  });
  await eventually(async () => (await text()).includes("Datos del cliente"));
  await field("Razón social", "Cliente nuevo de prueba");
  await field("RUT con dígito verificador", "11.111.111-1");
  await click("Guardar cliente");
  await eventually(async () => (await text()).includes("Cliente guardado"));
  await field("Cliente", "00000000-0000-4000-8000-000000000010");
  await eventually(async () => (await text()).includes("KAM de cartera: Ana"));
  await click('Revisión');
  await evaluate(`document.querySelector('details').open=true`);
  await eventually(async()=>(await text()).includes('Póliza individual · indicadores técnicos'));
  await click("Pólizas");
  await field("Póliza", "00000000-0000-4000-8000-000000000020");
  await eventually(
    async () =>
      await evaluate(
        `document.querySelector('input')!==null && [...document.querySelectorAll('input')].some(e=>e.value==='000123')`,
      ),
  );
  await click("Coberturas");
  await click("Salud");
  await click("Añadir plan / conjunto de condiciones");
  const scope = "[...document.querySelectorAll('.contract-plan')].at(-1)";
  await field("Nombre de plan / condiciones", "Plan B", scope);
  await field("Grupos (uno por línea)", "Grupo B\nGrupo C", scope);
  await click("Añadir prestación, tope, capital, deducible o condición", scope);
  const term = "[...document.querySelectorAll('.contract-term')].at(-1)";
  await field("Prestación / condición", "Capital máximo", term);
  await field("Valor / descripción contractual", "500", term);
  await field("Unidad / moneda", "UF", term);
  await click("Guardar nueva versión como borrador");
  await eventually(
    async () => await evaluate("window.__savedPolicies.length===1"),
  );
  assert.equal(
    await evaluate(
      "window.__savedPolicies[0].contract.coverages[0].plans[1].terms[0].value",
    ),
    "500",
  );
  assert.deepEqual(
    await evaluate(
      "window.__savedPolicies[0].contract.coverages[0].plans[1].groups",
    ),
    ["Grupo B", "Grupo C"],
  );
  await field("Añadir cobertura presente en el documento", "Vida");
  await click("Pólizas");
  assert.match(await text(), /Salud, Vida/);
  const previousSaves = await evaluate("window.__savedPolicies.length");
  await field("Motivo / observación", "Corrección progresiva de prueba");
  await eventually(async () => await evaluate(`window.__savedPolicies.length>${previousSaves}`));
  assert.equal(await evaluate("window.__savedPolicies.at(-1).validationStatus"), "draft");
  await click("Revisión");
  assert.match(await text(), /Respaldo pendiente/);
  await click("Documentos");
  await click("poliza-sintetica.pdf");
  await eventually(async () =>
    (await text()).includes("Datos propuestos y correcciones"),
  );
  assert.match(await text(), /Póliza: 000123/);
  await eventually(async()=>(await text()).includes("Condiciones por cobertura y plan"));
  assert.match(await text(),/Tarificación por cobertura y categoría/);
  await field("Categoría", "Titular solo revisado", "document.querySelector('.tariff-review')");
  await evaluate("document.querySelector('.tariff-review').scrollIntoView()");
  const tariffShot=await command("Page.captureScreenshot",{format:"png"});
  await writeFile("/tmp/noergon-tariff-review.png",Buffer.from(tariffShot.data,"base64"));
  await click("Ver evidencia · pág. 1");
  await eventually(async()=>await evaluate("document.querySelector('.condition-pdf-page img')?.naturalWidth>0"));
  assert.equal(await evaluate("!!document.querySelector('.condition-region')"),true);
  await evaluate("document.querySelector('.contract-extraction-review').scrollIntoView()");
  const conditionsShot=await command("Page.captureScreenshot",{format:"png"});
  await writeFile("/tmp/noergon-phase2-conditions.png",Buffer.from(conditionsShot.data,"base64"));
  await evaluate("document.querySelector('.condition-pdf-viewer').scrollIntoView()");
  const evidenceShot=await command("Page.captureScreenshot",{format:"png"});
  await writeFile("/tmp/noergon-phase2-evidence.png",Buffer.from(evidenceShot.data,"base64"));
  await click("Incorporar condiciones al borrador");
  await click("Guardar nueva versión como borrador");
  await eventually(async()=>await evaluate("window.__savedPolicies.at(-1).contract.coverages.some(c=>c.plans.some(p=>p.terms.some(t=>t.sourceCandidateId)))"));
  assert.equal(await evaluate("window.__savedPolicies.at(-1).contract.coverages.flatMap(c=>c.plans).flatMap(p=>p.terms).find(t=>t.sourceCandidateId).reviewStatus"),"pending");
  assert.equal(await evaluate("window.__savedPolicies.at(-1).contract.coverages.flatMap(c=>c.plans).flatMap(p=>p.terms).find(t=>t.tariff).tariff.category"),"Titular solo revisado");
  assert.equal(await evaluate("window.__savedPolicies.every(p=>!Object.hasOwn(p.contract,'premium'))"),true);
  assert.equal(await evaluate("window.__savedPolicies.some(p=>JSON.stringify(p.contract).includes('9999'))"),false);
  assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.textContent.includes('Prima total declarada'))"),false);
  await click("Documentos");
  await evaluate("window.scrollTo(0,0)");
  const screenshot = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/tmp/portfolio-desktop.png",
    Buffer.from(screenshot.data, "base64"),
  );
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(150);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),
    true,
    "La pantalla móvil desborda horizontalmente",
  );
  const mobile = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/tmp/portfolio-mobile.png",
    Buffer.from(mobile.data, "base64"),
  );
  await command("Page.navigate", {
    url: "http://127.0.0.1:5191/tests/portfolio.html?view=dashboard",
  });
  await command("Page.bringToFront");
  await eventually(async () =>
    (await text()).includes("Clientes de la cartera"),
  );
  assert.match(await text(), /Inicio de vigencia/);
  await field("Ordenar por", "premium");
  await click("Descendente ↓").catch(() => click("Ascendente ↑"));
  await field("Aseguradora", "Aseguradora de prueba");
  assert.match(await text(), /Empresa Sintética SpA/);
  assert.equal(errors.length, 0, errors.join("\n"));
  await command("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command("Page.navigate", {url:"http://127.0.0.1:5191/tests/report-branding.html"});
  await eventually(async()=>await evaluate('document.querySelectorAll(".report-slide").length===2'));
  await evaluate('Promise.all([...document.images].map(img=>img.decode())).then(()=>true)');
  assert.equal(await evaluate(`[...document.querySelectorAll(".report-slide")].every(slide=>slide.querySelector('img[src="/noergon-brand.png"]'))`),true);
  assert.equal(await evaluate(`[...document.querySelectorAll('img[src="/noergon-brand.png"]')].every(img=>img.naturalWidth===2172 && img.naturalHeight===724 && getComputedStyle(img).objectFit==="contain")`),true);
  const brandShot=await command("Page.captureScreenshot",{format:"png"});
  await writeFile("/tmp/noergon-report-logo.png",Buffer.from(brandShot.data,"base64"));
  const pdf=await command("Page.printToPDF",{printBackground:true,preferCSSPageSize:true});
  await writeFile("/tmp/noergon-report-preview.pdf",Buffer.from(pdf.data,"base64"));
  console.log("Logo oficial completo en portada, interior con logo personalizado y PDF: OK.");
  console.log(
    "Navegador: crear cliente, editar planes/grupos/condiciones, guardar borrador, varias coberturas, revisar PDF, filtros y móvil: OK.",
  );
  console.log(
    "Capturas locales: /tmp/portfolio-desktop.png y /tmp/portfolio-mobile.png",
  );
} catch (error) {
  console.error(await debug());
  throw error;
} finally {
  await Promise.race([closeBrowser(), wait(1500)]);
  if (ws) ws.close();
  browser?.kill("SIGTERM");
  vite.kill("SIGTERM");
  await wait(500);
  await rm(folder, { recursive: true, force: true });
}
