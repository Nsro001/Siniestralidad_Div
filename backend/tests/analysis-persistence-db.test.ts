import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1), actor = id(2), other = id(3), client = id(11), foreignClient = id(12), policy = id(21), foreignPolicy = id(22), version = id(31);
const safeResult = { schemaVersion: 'analysis-result-v1', kind: 'monthly', sections: [{ code: 'monthly_result', metricRefs: ['premiumUf', 'lossRatio'] }], recommendations: [] };
const digest = (n: number) => n.toString(16).padStart(64, '0');
test('persistencia: esquema real, permisos, reservas atómicas y presupuestos de costo cero', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;`);
    for (const name of ['202609060001_accounts','202609170001_portfolio','202609230001_replace_dataset','202609290001_chunked_dataset_upload',
      '202610010001_report_branding','202610160001_presentation_branding','202610300001_portfolio_contracts','202610300002_portfolio_storage','202610300003_portfolio_import_identity','202611050001_analysis_persistence','202611050003_analysis_grounded_results','202611050004_analysis_display_provenance']) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    for (const user of [admin, actor, other]) await db.query("insert into auth.users values($1,'test@example.invalid','{}')", [user]);
    await db.query("update public.profiles set role='admin' where id=$1", [admin]);
    await db.query("insert into public.clients(id,name) values($1,'Empresa A'),($2,'Empresa B')", [client, foreignClient]);
    await db.query('insert into public.client_assignments(user_id,client_id) values($1,$3),($2,$3)', [actor, other, client]);
    for (const [pid, cid, vid] of [[policy, client, version], [foreignPolicy, foreignClient, id(32)]]) {
      await db.query("insert into public.portfolio_policies(id,client_id,number_key,insurer_key) values($1,$2,'001','aseguradora')", [pid, cid]);
      await db.query(`insert into public.portfolio_policy_versions(id,policy_id,client_id,revision,change_type,effective_on,validation_status,contract,created_by)
        values($1,$2,$3,1,'initial','2026-01-01','validated','{}',$4)`, [vid, pid, cid, admin]);
    }
    const reserve = async (key = 1, overrides: { actor?: string; client?: string; policy?: string; version?: string; input?: number; output?: number; model?: string } = {}) => {
      const args = [overrides.actor ?? actor, overrides.client ?? client, overrides.policy ?? policy, [overrides.version ?? version], ['2026-01'], ['Salud'],
        'monthly', digest(key), digest(100), digest(101), overrides.model ?? 'gemini-test-free', 'prompt-v1', 'calculation-v1', 'privacy-v1', overrides.input ?? 100, overrides.output ?? 50];
      return (await db.query<{result: any}>(`select public.analysis_reserve(${args.map((_, i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result;
    };
    const finish = async (r: any, status = 'succeeded', result: unknown = safeResult, tokens: number | null = 70, who = actor) =>
      (await db.query<{result: any}>('select public.analysis_finish($1,$2,$3,$4,$5::jsonb,$6,$7,$8) result',
        [who, r.requestId, r.leaseToken, status, result === null ? null : JSON.stringify(result), tokens === null ? null : 50, tokens === null ? null : 20, tokens])).rows[0].result;
    const reset = async () => {
      await db.exec(`reset role; delete from public.analysis_requests; delete from public.analysis_cache;
        update public.analysis_runtime_policy set enabled=true,project_verified=true,free_quota_verified=true,billing_disabled_verified=true,privacy_approved=true,
        model='gemini-test-free',verified_at=now(),verification_expires_at=now()+interval '1 hour',quota_evidence_sha256=repeat('a',64),billing_evidence_sha256=repeat('b',64),
        project_ref_sha256=repeat('c',64),verified_project_sha256=repeat('c',64),verified_model='gemini-test-free',verified_free_rpm=100,verified_free_rpd=100,verified_free_tpm=100000,
        project_requests_minute=100,project_requests_day=100,user_requests_minute=100,user_requests_day=100,
        project_tokens_minute=100000,project_tokens_day=100000,user_tokens_minute=100000,user_tokens_day=100000,
        max_input_tokens=1000,max_output_tokens=1000,cooldown_until=null where singleton;`);
    };
    const asUser = async (user: string) => {
      await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated');
    };
    await t.test('instalación deshabilitada, sin cuotas supuestas, presupuesto cero y tablas con RLS', async () => {
      const cfg = (await db.query<any>('select * from public.analysis_runtime_policy')).rows[0];
      assert.equal(cfg.enabled, false); assert.equal(cfg.api_budget_clp, 0); assert.equal(cfg.project_requests_day, 0); assert.equal(cfg.model, null);
      assert.equal((await reserve()).status, 'blocked');
      assert.equal((await db.query('select * from public.analysis_requests')).rows.length, 0);
      for (const table of ['analysis_runtime_policy','analysis_cache','analysis_requests']) {
        assert.equal((await db.query<any>('select relrowsecurity from pg_class where relname=$1', [table])).rows[0].relrowsecurity, true);
      }
      await assert.rejects(db.exec('update public.analysis_runtime_policy set api_budget_clp=1'), /check constraint/);
      await assert.rejects(db.exec("update public.analysis_runtime_policy set tier='paid'"), /check constraint/);
    });
    await t.test('v2: persistencia estructurada, sin texto libre y compatibilidad v1', async()=>{
      await reset();
      const result={schemaVersion:'analysis-result-v2',kind:'monthly',sections:[{code:'monthly_result',findings:[{ref:'m0.premiumUf',value:100}]}],recommendations:[]};
      for(const value of [safeResult,result]) assert.equal((await db.query<any>('select public.analysis_safe_result($1::jsonb) ok',[JSON.stringify(value)])).rows[0].ok,true);
      for(const value of [{...result,prompt:'sensitive'},{...result,sections:[{code:'monthly_result',findings:[{ref:'patientRut',value:1}]}]},{...result,recommendations:[{code:'bioequivalents',evidenceRef:'m0.c0.differenceUf'}]}]) assert.equal((await db.query<any>('select public.analysis_safe_result($1::jsonb) ok',[JSON.stringify(value)])).rows[0].ok,false);
      const r=await reserve();assert.equal((await finish(r,'succeeded',result)).status,'succeeded');
      assert.equal((await db.query<any>('select origin from public.analysis_cache')).rows[0].origin,'simulated');
      await asUser(other);assert.equal((await db.query('select * from public.analysis_cache')).rows.length,0);
      await asUser(actor);assert.equal((await db.query('select * from public.analysis_cache')).rows.length,1);
      await db.exec('reset role');
    });
    await t.test('actor, empresa, póliza y versión deben coincidir; no hay cambio de modelo', async () => {
      await reset();
      await assert.rejects(reserve(1, { client: foreignClient, policy: foreignPolicy, version: id(32) }), /analysis_access_denied/);
      await assert.rejects(reserve(1, { version: id(32) }), /analysis_invalid_identity/);
      assert.equal((await reserve(1, { model: 'gemini-other' })).status, 'blocked');
      await db.exec('update public.analysis_runtime_policy set free_quota_verified=false'); assert.equal((await reserve()).status, 'blocked');
      await reset(); await db.exec("update public.analysis_runtime_policy set verified_at=now()-interval '2 hours',verification_expires_at=now()-interval '1 hour'");
      assert.equal((await reserve()).status, 'blocked');
      for (const change of ["verified_model='gemini-other'", "project_ref_sha256=repeat('d',64)", 'verified_free_rpm=1', 'verified_free_rpd=1', 'verified_free_tpm=1']) {
        await reset(); await db.exec(`update public.analysis_runtime_policy set ${change}`); assert.equal((await reserve()).status,'blocked');
      }
    });
    await t.test('solicitudes simultáneas idénticas: una sola reserva, token y entrada', async () => {
      await reset(); const results = await Promise.all(Array.from({ length: 20 }, () => reserve()));
      assert.equal(results.filter(r => r.status === 'reserved').length, 1);
      assert.equal(results.filter(r => r.status === 'in_progress').length, 19);
      assert.equal((await db.query('select * from public.analysis_requests')).rows.length, 1);
      assert.equal((await db.query('select * from public.analysis_cache')).rows.length, 1);
    });
    await t.test('límites atómicos de usuario/proyecto, minuto/día, solicitudes/tokens', async () => {
      for (const column of ['project_requests_minute','project_requests_day','user_requests_minute','user_requests_day']) {
        await reset(); await db.exec(`update public.analysis_runtime_policy set ${column}=1`);
        assert.equal((await reserve(1)).status, 'reserved'); assert.equal((await reserve(2)).reason, 'budget_exhausted', column);
      }
      for (const column of ['project_tokens_minute','project_tokens_day','user_tokens_minute','user_tokens_day']) {
        await reset(); await db.exec(`update public.analysis_runtime_policy set ${column}=150`);
        assert.equal((await reserve(1)).status, 'reserved'); assert.equal((await reserve(2)).reason, 'budget_exhausted', column);
      }
      await reset(); await db.exec('update public.analysis_runtime_policy set project_requests_day=3');
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => reserve(i + 1)));
      assert.equal(results.filter(r => r.status === 'reserved').length, 3);
      assert.equal((await reserve(15, { actor: other })).reason, 'budget_exhausted');
      await reset(); await db.exec('update public.analysis_runtime_policy set user_requests_day=1');
      await reserve(); assert.equal((await reserve(2, { actor: other })).status, 'reserved');
    });
    await t.test('éxito idempotente, caché sin consumo y TTL/invalidez de identidad', async () => {
      await reset(); const r = await reserve(); assert.equal((await finish(r)).status, 'succeeded');
      assert.equal((await finish(r)).status, 'already_finalized');
      assert.equal((await reserve()).status, 'cached');
      assert.equal((await db.query<any>('select accounted_tokens from public.analysis_requests')).rows[0].accounted_tokens, 70);
      await db.exec('update public.analysis_runtime_policy set enabled=false'); assert.equal((await reserve()).status, 'cached');
      await db.exec("update public.analysis_cache set expires_at=now()-interval '1 second'"); assert.equal((await reserve()).status, 'blocked');
      await reset(); await reserve();
      await db.exec("update public.analysis_cache set indicators_hash=repeat('f',64)");
      await assert.rejects(reserve(), /analysis_identity_mismatch/);
    });
    await t.test('RLS: ni otro usuario de la misma empresa ni admin leen la caché ajena; revocación inmediata', async () => {
      await reset(); const r = await reserve(); await finish(r);
      await asUser(actor); assert.equal((await db.query('select * from public.analysis_cache')).rows.length, 1);
      await assert.rejects(db.exec('delete from public.analysis_cache'), /permission denied/);
      await assert.rejects(reserve(), /permission denied/);
      await assert.rejects(db.exec('select * from public.analysis_runtime_policy'), /permission denied/);
      for (const user of [other, admin]) { await asUser(user); assert.equal((await db.query('select * from public.analysis_cache')).rows.length, 0); }
      await db.exec('reset role'); await db.query('delete from public.client_assignments where user_id=$1', [actor]);
      await asUser(actor); assert.equal((await db.query('select * from public.analysis_cache')).rows.length, 0);
      assert.equal((await db.query('select * from public.analysis_requests')).rows.length, 0);
      await db.exec('reset role'); await assert.rejects(reserve(), /analysis_access_denied/);
      await db.query('insert into public.client_assignments values($1,$2)', [actor, client]);
      await db.exec('set role service_role'); assert.equal((await reserve()).status, 'cached'); await db.exec('reset role');
    });
    await t.test('429/timeout/fallo conservan reserva y bloquean reintentos; nunca guardan cuerpo del proveedor', async () => {
      for (const status of ['rate_limited','timeout','provider_error']) {
        await reset(); const r = await reserve(); await finish(r, status, null, null);
        assert.equal((await db.query<any>('select accounted_tokens from public.analysis_requests')).rows[0].accounted_tokens, 150);
        assert.equal((await reserve()).reason, 'cooldown'); assert.equal((await reserve(2)).reason, 'provider_cooldown');
        assert.equal((await db.query<any>('select result from public.analysis_cache')).rows[0].result, null);
      }
    });
    await t.test('la RPC privilegiada conserva reglas de KAM, jefatura y cuenta desactivada', async () => {
      for (const [role, source, active, expected] of [['executive','KAM',true,true],['manager','Jefe',true,true],['manager','Otro',true,false],['executive','KAM',false,false]] as const) {
        await reset(); await db.query('delete from public.client_assignments where user_id=$1',[actor]);
        await db.query("update public.clients set kam_name='KAM',manager_name='Jefe' where id=$1",[client]);
        await db.query('update public.profiles set role=$2,portfolio_name=$3,active=$4 where id=$1',[actor,role,source,active]);
        await asUser(actor); assert.equal((await db.query<any>('select public.can_access_client($1) allowed',[client])).rows[0].allowed,expected);
        await db.exec('reset role');
        if(expected) assert.equal((await reserve()).status,'reserved'); else await assert.rejects(reserve(),/analysis_access_denied/);
      }
      await db.query("update public.profiles set role='executive',portfolio_name=null,active=true where id=$1",[actor]);
      await db.query('insert into public.client_assignments values($1,$2)',[actor,client]);
    });
    await t.test('leases vencidos y workers tardíos no liberan presupuesto ni pisan resultados', async () => {
      await reset(); const r = await reserve();
      await db.exec("update public.analysis_cache set lease_expires_at=now()-interval '1 second'");
      assert.equal((await finish(r)).status, 'stale_lease'); assert.equal((await reserve()).reason, 'lease_expired_unknown');
      assert.equal((await db.query<any>('select status,accounted_tokens from public.analysis_requests')).rows[0].status, 'abandoned');
      assert.equal((await db.query<any>('select accounted_tokens from public.analysis_requests')).rows[0].accounted_tokens, 150);
      assert.equal((await reserve()).reason, 'cooldown');
    });
    await t.test('ventana diaria móvil evita liberar cuota por cambios de día y minuto', async () => {
      await reset(); await db.exec('update public.analysis_runtime_policy set project_requests_day=1'); await reserve();
      await db.exec("update public.analysis_requests set reserved_at=now()-interval '2 minutes'");
      assert.equal((await reserve(2)).reason,'budget_exhausted');
      await db.exec("update public.analysis_requests set reserved_at=now()-interval '49 hours'");
      assert.equal((await reserve(2)).status,'reserved');
    });
    await t.test('resultados sensibles o consumo superior a reserva fallan de forma cerrada', async () => {
      await reset(); let r = await reserve();
      assert.equal((await finish(r, 'succeeded', { ...safeResult, text: 'RUT o diagnóstico individual' })).status, 'invalid_result');
      assert.equal((await db.query<any>('select result from public.analysis_cache')).rows[0].result, null);
      await reset(); r = await reserve(); assert.equal((await finish(r, 'succeeded', safeResult, 200)).status, 'token_overrun');
      assert.equal((await db.query<any>('select enabled from public.analysis_runtime_policy')).rows[0].enabled, false);
      assert.equal((await db.query<any>('select accounted_tokens from public.analysis_requests')).rows[0].accounted_tokens, 200);
      await reset(); r=await reserve();
      const perComponent=(await db.query<any>('select public.analysis_finish($1,$2,$3,$4,$5::jsonb,110,20,130) result',[actor,r.requestId,r.leaseToken,'succeeded',JSON.stringify(safeResult)])).rows[0].result;
      assert.equal(perComponent.status,'token_overrun');
      assert.equal((await db.query<any>('select accounted_tokens from public.analysis_requests')).rows[0].accounted_tokens,150);
    });
  } finally { await db.close(); }
});
