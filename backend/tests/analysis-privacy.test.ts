import { test } from 'node:test';
import { verifiedReviews } from './helpers/technicalReviews.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareAnalysis, canonical, fingerprint, validateStoredAnalysis, validateIdentity } from '../src/analysisPrivacy.js';
import { AnalysisPersistence, analysisAvailability, classifyProviderFailure } from '../src/analysisPersistence.js';
import type { ScopeInput } from '../src/policyScope.js';
import type { PolicyVersion, PolicyContract } from '../../shared/portfolio.js';
import type { ExpenseRow, PremiumRow } from '../src/types.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function rut(body: number) {
  let sum = 0, factor = 2;
  for (const digit of String(body).split('').reverse()) { sum += Number(digit)*factor; factor = factor === 7 ? 2 : factor+1; }
  const dv = 11-sum%11; return `${body}-${dv === 11 ? '0' : dv === 10 ? 'K' : dv}`;
}
function fixture(count=10): ScopeInput {
  const client = { id: id(11), name: 'EMPRESA_PRIVADA' };
  const policy = { id: id(21), client_id: client.id, number_key: 'poliza-privada', insurer_key: 'aseguradora-privada' };
  const contract = { number: policy.number_key, insurer: policy.insurer_key, startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'UF', status: 'active', cancellationDate: '',
    coverages: [{ id: id(41), type: 'Salud', name: 'NOMBRE_PRIVADO', plans: [] }], evidence: { diagnostic: 'DOCUMENTO_PRIVADO' } } as unknown as PolicyContract;
  const p: PremiumRow[] = ['2026-01','2026-02'].map(period => ({ clientName: client.name, policy: policy.number_key, period, coverage: 'Salud', premiumUf: 100, spendUf: 100, clientRut: undefined }));
  const e: ExpenseRow[] = p.flatMap(row => Array.from({length:count}, (_,i) => ({ clientName:client.name,policy:row.policy,period:row.period,coverage:'Salud',descCober:'DIAGNOSTICO_PRIVADO',
    reembolsoUf:100/count,provider:'PRESTADOR_PRIVADO',insuredRut:rut(12000000+i),patientRut:rut(12000000+i),relation:'T',isapre:'PREVISION_PRIVADA',valPrest:0,valBonif:0,mtoReclam:0 })));
  const input:ScopeInput={ client, policy, policies:[policy], versions:[{ id:id(31),client_id:client.id,policy_id:policy.id,revision:1,effective_on:'2026-01-01',validation_status:'validated',contract } as PolicyVersion],
    snapshots:[{id:id(51),client_id:client.id,kind:'primas',rows:p},{id:id(52),client_id:client.id,kind:'gastos',rows:e}],links:[],periods:['2026-02'],coverages:['Salud'] };
  input.reviews=verifiedReviews(input);return input;
}
const prepare = (input=fixture(), kind:'monthly'|'conclusions'='monthly', config?:unknown) => prepareAnalysis(input,id(2),kind,'gemini-unverified-example','prompt-v1',config);
const configuration = { name:'PRIVADO',version:'example-1',source:'DOCUMENTO_PRIVADO',claimsBasis:'paid',dataCompletenessConfirmed:true,targetLossRatio:.8,targetIncludesExpenses:true,
  annualClaimTrend:0,trendYears:1,developmentFactor:1,exposureFactor:1,forecastMonths:12,minimumObservedMonths:2,maintenanceBand:.01 };

test('privacidad: lista permitida no contiene nombres, RUT, UUID, diagnósticos, documentos ni filas médicas',()=>{
  const prepared=prepare(); assert.equal(prepared.status,'prepared'); if(prepared.status!=='prepared') return;
  const json=JSON.stringify(prepared.payload);
  for(const marker of ['PRIVAD',id(11),id(21),id(31),rut(12000000),'patientRut','provider','evidence','clientName','source','policyId','contractualCoverageId']) assert.ok(!json.includes(marker),marker);
  assert.deepEqual(Object.keys(prepared.payload),['schemaVersion','kind','months','renewal']);
  assert.equal(prepared.payload.months[0].current.premiumUf,100); assert.equal(prepared.payload.months[0].coverages[0].type,'Salud');
  assert.equal(prepared.identity.contractVersions[0],id(31)); validateIdentity(prepared.identity);
});
test('privacidad: k mínimo, concentración, identidades ausentes e incompletitud bloquean todo el payload',()=>{
  const small=prepare(fixture(9)); assert.equal(small.status,'blocked'); assert.ok(!('payload' in small));
  const concentrated=fixture(); const rows=concentrated.snapshots[1].rows as ExpenseRow[];
  rows.filter(r=>r.period==='2026-02').forEach((r,i)=>{r.reembolsoUf=i===0?50:50/9;});
  assert.equal(prepare(concentrated).status,'blocked');
  const unidentified=fixture(); (unidentified.snapshots[1].rows[0] as ExpenseRow).patientRut='(Sin RUT)';
  assert.equal(prepare(unidentified).status,'blocked');
  const incomplete=fixture(); (incomplete.snapshots[0].rows[0] as PremiumRow).policy=''; assert.equal(prepare(incomplete).status,'blocked');
});
test('caché: clave canónica e invalidación por usuario, empresa, póliza, versión, filtros, datos, prompt y modelo',()=>{
  const base=prepare(); assert.equal(base.status,'prepared'); if(base.status!=='prepared')return;
  assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2})); assert.throws(()=>canonical({n:Infinity}));
  const reordered=fixture(); reordered.snapshots.reverse(); reordered.periods=['2026-02','2026-02'];
  const p=prepare(reordered); assert.equal(p.status,'prepared'); if(p.status==='prepared')assert.equal(p.identity.cacheKey,base.identity.cacheKey);
  const variants=[
    prepareAnalysis(fixture(),id(3),'monthly','gemini-unverified-example','prompt-v1'),
    prepareAnalysis(fixture(),id(2),'monthly','gemini-other','prompt-v1'),
    prepareAnalysis(fixture(),id(2),'monthly','gemini-unverified-example','prompt-v2'),
  ];
  for(const modify of [
    (i:ScopeInput)=>{i.client.id=id(12);i.policy.client_id=id(12);i.versions[0].client_id=id(12);i.snapshots.forEach(s=>s.client_id=id(12));},
    (i:ScopeInput)=>{i.policy.id=id(22);i.versions[0].policy_id=id(22);},
    (i:ScopeInput)=>{i.versions[0].id=id(32);},
    (i:ScopeInput)=>{(i.snapshots[0].rows[1] as PremiumRow).premiumUf=120;},
  ]){const input=fixture();modify(input);input.reviews=verifiedReviews(input);variants.push(prepare(input));}
  for(const v of variants){assert.equal(v.status,'prepared');if(v.status==='prepared')assert.notEqual(v.identity.cacheKey,base.identity.cacheKey);}
  const tampered={...base.identity,policyId:id(22)};assert.throws(()=>validateIdentity(tampered),/hash_mismatch/);
});
test('conclusiones: supuestos/versiones invalidan caché sin persistir sus textos ni nombres',()=>{
  const input=fixture();input.periods=['2026-01','2026-02'];
  const a=prepare(input,'conclusions',[configuration]),b=prepare(input,'conclusions',[{...configuration,targetLossRatio:.9}]),c=prepare(input,'conclusions',[{...configuration,version:'example-2'}]);
  for(const r of [a,b,c]){assert.equal(r.status,'prepared');if(r.status==='prepared')assert.ok(!JSON.stringify(r.payload).includes('PRIVADO'));}
  if(a.status==='prepared'&&b.status==='prepared'&&c.status==='prepared'){assert.notEqual(a.identity.cacheKey,b.identity.cacheKey);assert.notEqual(a.identity.assumptionsHash,c.identity.assumptionsHash);}
  assert.equal(prepare(input,'conclusions',[{}]).status,'blocked');
});
test('resultados: solo códigos y referencias; sin narrativas arbitrarias ni claves sensibles',()=>{
  const result={schemaVersion:'analysis-result-v1',kind:'monthly',sections:[{code:'monthly_result',metricRefs:['lossRatio']}],recommendations:[]};
  validateStoredAnalysis(result);
  for(const bad of [{...result,prompt:'privado'},{...result,apiKey:'secret'},{...result,sections:[{code:'monthly_result',metricRefs:['patientRut']}]},
    {...result,recommendations:['Paciente individual']},{...result,sections:[{code:'monthly_result',metricRefs:[],quote:'diagnóstico'}]}]) assert.throws(()=>validateStoredAnalysis(bad),/unsafe_result/);
});
test('persistencia backend: verifica acceso antes de caché; no utiliza writer para leer',async()=>{
  const prepared=prepare();if(prepared.status!=='prepared')throw new Error('fixture');
  let writerCalls=0,cacheReads=0;
  const writer={rpc:async()=>{writerCalls++;return{data:{status:'blocked'},error:null};}} as unknown as SupabaseClient;
  const makeDb=(allowed:boolean)=>({from(table:string){if(table==='analysis_cache')cacheReads++;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='portfolio_policies'&&allowed?{id:id(21),client_id:id(11)}:null,error:null})};return q;}} as unknown as SupabaseClient);
  const store=new AnalysisPersistence(writer);
  await assert.rejects(store.read({id:id(2),db:makeDb(false)},prepared.identity),/access_denied/);assert.equal(cacheReads,0);
  await assert.rejects(store.reserve({id:id(3),db:makeDb(true)},prepared.identity,100,50),/owner_mismatch/);assert.equal(writerCalls,0);
  assert.equal(await store.read({id:id(2),db:makeDb(true)},prepared.identity),null);assert.equal(writerCalls,0);
  assert.deepEqual(await store.reserve({id:id(2),db:makeDb(true)},prepared.identity,100,50),{status:'blocked'});assert.equal(writerCalls,1);
  await assert.rejects(store.finish({id:id(2),db:makeDb(true)},id(1),id(2),'succeeded',{prompt:'sensible'}),/unsafe_result/);assert.equal(writerCalls,1);
});
test('etapa 3: ninguna ejecución de proveedor, reintento automático o activación por env/dashboard/PDF',async()=>{
  const old=process.env.GEMINI_ENABLED;process.env.GEMINI_ENABLED='true';
  try{assert.equal(analysisAvailability().enabled,false);assert.equal(analysisAvailability().apiBudgetClp,0);assert.equal(analysisAvailability().reason,'real_provider_not_authorized');}
  finally{if(old===undefined)delete process.env.GEMINI_ENABLED;else process.env.GEMINI_ENABLED=old;}
  assert.equal(classifyProviderFailure(429),'rate_limited');assert.equal(classifyProviderFailure(null,true),'timeout');assert.equal(classifyProviderFailure(503),'provider_error');
  for(const path of ['../../frontend/src/App.tsx','../../frontend/src/api.ts','../../frontend/src/components/ReportPresentation.tsx','../src/app.ts']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');assert.doesNotMatch(source,/analysis_reserve|AnalysisPersistence|generativelanguage\.googleapis/);
  }
  assert.match(await readFile(new URL('../.env.example',import.meta.url),'utf8'),/^GEMINI_ENABLED=false$/m);
  const source=await readFile(new URL('../src/analysisPersistence.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|setTimeout|console\.|GEMINI_API_KEY/);
});
