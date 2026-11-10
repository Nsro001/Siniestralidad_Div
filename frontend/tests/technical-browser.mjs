import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const folder=await mkdtemp(join(tmpdir(),'technical-ui-'));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5193','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://portfolio-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public-test-key'},stdio:'ignore'});
let browser,ws,send;const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(fn){for(let i=0;i<150;i++){try{if(await fn())return;}catch{}await wait(100);}throw new Error('Timeout de interfaz');}
try{
 await eventually(async()=> (await fetch('http://127.0.0.1:5193/tests/technical.html')).ok);
 browser=spawn(process.env.BROWSER_BIN||'brave-browser',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',`--user-data-dir=${folder}`,'--remote-debugging-port=5194','about:blank'],{stdio:'ignore'});
 let targets;await eventually(async()=>{targets=await(await fetch('http://127.0.0.1:5194/json/list')).json();return targets.some(t=>t.type==='page');});
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();const exceptions=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
 send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 const text=()=>evaluate('document.body.innerText');
 const click=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw new Error('Botón ausente/deshabilitado: '+${JSON.stringify(label)});b.click();})()`);await wait(80);};
 const field=async(label,value)=>{await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)});const e=l?.querySelector('input,select,textarea');if(!e)throw new Error('Campo ausente: '+${JSON.stringify(label)});const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);await wait(60);};
 const checkbox=async label=>{await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent.trim()===${JSON.stringify(label)});l.querySelector('input').click();})()`);await wait(60);};
 const selectScope=async()=>{await field('Póliza de análisis','00000000-0000-4000-8000-000000000021');await field('Snapshot de primas','00000000-0000-4000-8000-000000000041');await field('Snapshot de gastos','00000000-0000-4000-8000-000000000042');await field('Meses seleccionados','2026-01,2026-02,2026-03,2026-04,2026-05');await checkbox('Salud');};
 await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:5193/tests/technical.html'});await eventually(async()=>(await text()).includes('Póliza individual'));
 await selectScope();assert.equal(await evaluate('window.__technicalCalls.length'),0);await click('Consultar indicadores');await eventually(async()=>(await text()).includes('Parcial · revisar datos'));
 for(const label of ['Completo','Incompleto','Ambiguo · revisar datos','Pendiente de validación','No determinada','Sin datos','Diferencia 10 UF','No atribuir cambios'])assert.ok((await text()).includes(label),label);
 assert.equal(await evaluate(`document.querySelector('button:last-child')!==null && [...document.querySelectorAll('button')].find(b=>b.textContent==='Calcular escenario técnico').disabled`),true);
 await click('Revisar asignaciones y fuentes');assert.equal(await evaluate('window.__assignmentReviewOpened'),true);
 await field('Versión contractual de revisión','00000000-0000-4000-8000-000000000031');await field('Mes revisado','2026-03');await field('Cobertura revisada','Salud');await field('Tipo de revisión','partial_month');await field('Fundamento técnico sin datos personales','Error de datos pendiente de corrección');
 assert.equal(await evaluate(`document.querySelector('select')!==null && [...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent==='Decisión').querySelector('option[value="validated"]')===null`),true);
 await click('Registrar revisión');await eventually(async()=>(await text()).includes('Revisión registrada'));assert.equal(await evaluate('window.__technicalReviews.length'),1);
 await evaluate('window.__verifiedTechnical=true');await click('Consultar indicadores');await eventually(async()=>await evaluate(`[...document.querySelectorAll('.technical-quality')].length===5&&[...document.querySelectorAll('.technical-quality')].every(e=>e.textContent==='Completo')`));
 for(const [label,value] of [['Nombre del escenario','Prueba'],['Versión de supuestos','v1'],['Referencia de supuestos','Prueba sintética'],['Siniestralidad objetivo (razón decimal)','0.8'],['Tendencia anual (razón decimal)','0'],['Años de tendencia','1'],['Factor de desarrollo','1'],['Factor de exposición','1'],['Meses proyectados','12'],['Mínimo de meses observados','2'],['Banda de mantención (razón decimal)','0.01']])await field(label,value);
 await checkbox('El objetivo contempla la base de gastos y comisiones relevante');await click('Calcular escenario técnico');await eventually(async()=>(await text()).includes('Mantención · Ajuste 0%'));
 assert.equal(await evaluate(`window.__technicalCalls.filter(r=>r.path.endsWith('/renewal-scenarios')).length`),1);
 await send('Page.printToPDF',{printBackground:true});assert.equal(await evaluate(`window.__technicalCalls.filter(r=>r.path.endsWith('/renewal-scenarios')).length`),1);
 // Stage 5: navigation and rendering do not generate analyses; only button POSTs do.
 assert.equal(await evaluate(`window.__technicalCalls.filter(r=>r.path.includes('/analysis/')).length`),0);
 await click('Analizar mes seleccionado');await eventually(async()=>(await text()).includes('Análisis determinista · sin IA'));
 assert.ok((await text()).includes('Diferencia 20 UF'));await click('Preparar tres conclusiones');
 await eventually(async()=>await evaluate(`document.querySelector('[aria-label="Tres conclusiones ejecutivas"] .analysis-conclusions')?.children.length===3`));
 await evaluate(`window.__analysisSource='simulated'`);await click('Preparar tres conclusiones');await eventually(async()=>(await text()).includes('Simulado · no es IA real'));
 await evaluate(`document.querySelector('[aria-label="Tres conclusiones ejecutivas"]').scrollIntoView({block:'start'})`);
 await evaluate(`document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';window.scrollTo({top:0,left:0,behavior:'instant'})`);await wait(200);
 const simulatedClip=await evaluate(`(()=>{const r=document.querySelector('[aria-label="Tres conclusiones ejecutivas"]').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:simulatedClip}).then(async r=>{const {writeFile}=await import('node:fs/promises');await writeFile('/tmp/noergon-stage5-simulated.png',Buffer.from(r.data,'base64'));});
 const generationCount=await evaluate(`window.__technicalCalls.filter(r=>r.path.includes('/analysis/')&&r.method==='POST').length`);
 await click('Exportar PDF de póliza');await eventually(async()=>await evaluate('window.__printCalls===1'));
 assert.equal(await evaluate(`window.__technicalCalls.filter(r=>r.path.includes('/analysis/')&&r.method==='POST').length`),generationCount);
 assert.ok(await evaluate(`window.__policyPdfText.includes('Póliza 001')&&window.__policyPdfText.includes('Simulado · no es IA real')&&!window.__policyPdfText.includes('Consolidado empresarial de sábanas')`));
 assert.ok(await evaluate(`window.__policyPdfText.includes('Indicadores y conciliación')&&window.__policyPdfText.includes('Siniestralidad')&&window.__policyPdfText.includes('Conclusión 3 de 3')`));
 await evaluate(`window.__analysisTTL=50`);await click('Preparar tres conclusiones');await eventually(async()=>(await text()).includes('El resultado almacenado expiró'));
 assert.equal(await evaluate(`window.__technicalCalls.filter(r=>r.path.includes('/analysis/')&&r.method==='POST').length`),generationCount+1);
 await evaluate(`window.__analysisSource='real'`);await click('Preparar tres conclusiones');await eventually(async()=>(await text()).includes('no corresponde a esta empresa'));
 await evaluate(`window.__analysisSource='deterministic';window.__analysisTTL=60000`);
 // The PDF deck exists only during explicit export; Ctrl+P cannot reuse stale cached conclusions.
 assert.equal(await evaluate(`document.querySelectorAll('.pdf-deck').length`),0);
 await click('Registrar revisión');await eventually(async()=>(await text()).includes('Revisión registrada'));
 assert.equal(await evaluate(`document.querySelectorAll('.analysis-result').length`),0);
 await click('Preparar tres conclusiones');await eventually(async()=>(await text()).includes('Análisis determinista · sin IA'));
 await evaluate(`document.querySelector('[aria-label="Tres conclusiones ejecutivas"]').scrollIntoView({block:'start'})`);
 await evaluate(`window.scrollTo({top:0,left:0,behavior:'instant'})`);await wait(200);
 const deterministicClip=await evaluate(`(()=>{const r=document.querySelector('[aria-label="Tres conclusiones ejecutivas"]').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:deterministicClip}).then(async r=>{const {writeFile}=await import('node:fs/promises');await writeFile('/tmp/noergon-stage5-analysis.png',Buffer.from(r.data,'base64'));});
 await evaluate(`(()=>{const host=document.createElement('div');host.id='stage5-pdf-evidence';host.innerHTML=window.__policyPdfHtml;document.getElementById('root').appendChild(host);})()`);
 const pdfEvidence=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
 {const {writeFile}=await import('node:fs/promises');await writeFile('/tmp/noergon-stage5-policy.pdf',Buffer.from(pdfEvidence.data,'base64'));}
 await evaluate(`document.getElementById('stage5-pdf-evidence').remove()`);
 await field('Meses seleccionados','2026-02');assert.equal(await evaluate(`document.querySelectorAll('.analysis-result').length`),0);assert.ok(!(await text()).includes('Mantención · Ajuste'));
 await send('Page.navigate',{url:'http://127.0.0.1:5193/tests/technical.html?role=executive'});await eventually(async()=>(await text()).includes('Póliza individual'));await selectScope();await click('Consultar indicadores');await eventually(async()=>(await text()).includes('Solo el administrador'));
 assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Registrar revisión')`),false);
 await send('Page.navigate',{url:'http://127.0.0.1:5193/tests/technical.html?view=company'});await eventually(async()=>(await text()).includes('Consolidado empresarial'));
 await eventually(async()=>(await text()).includes('2026-02: Incompleto · sin datos'));
 assert.ok((await text()).includes('Sin datos'));assert.equal(await evaluate('window.__technicalCalls.length'),0);
 await send('Page.navigate',{url:'http://127.0.0.1:5193/tests/technical.html?view=assignments'});await eventually(async()=>(await text()).includes('Versión de sábana'));
 await field('Versión de sábana','00000000-0000-4000-8000-000000000041');await eventually(async()=>(await text()).includes('Retirar vínculo erróneo'));
 await click('Retirar vínculo erróneo');assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirmar retiro de vínculo').disabled`),true);
 await field('Motivo del retiro sin datos personales','Error de vínculo verificado');await click('Confirmar retiro de vínculo');await eventually(async()=>await evaluate('window.__removedLink===true'));
 assert.equal(await evaluate('window.__removedLinkBody.reason'),'Error de vínculo verificado');assert.ok((await text()).includes('2026-01'));
 assert.equal(exceptions.length,0);
 console.log('Etapa 5: análisis explícito, exactamente tres conclusiones, procedencia, expiración, PDF de solo lectura, aislamiento empresarial e invalidación por filtros: OK.');
 console.log('Interfaz: selección explícita, cinco estados, base desconocida, conciliación, revisión manual, renovación bajo demanda, PDF sin solicitudes y permisos: OK.');
}finally{if(send)await Promise.race([send('Browser.close').catch(()=>{}),wait(1000)]);ws?.close();browser?.kill('SIGTERM');vite.kill('SIGTERM');await wait(300);await rm(folder,{recursive:true,force:true});}
