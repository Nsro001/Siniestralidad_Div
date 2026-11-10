import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePolicyScope, type ScopeInput } from '../src/policyScope.js';
import { createApp } from '../src/app.js';
import type { PolicyVersion, PolicyContract } from '../../shared/portfolio.js';
import type { ExpenseRow, PremiumRow } from '../src/types.js';

const clientId = '00000000-0000-4000-8000-000000000001';
const policyId = '00000000-0000-4000-8000-000000000002';
const premiumId = '00000000-0000-4000-8000-000000000003';
const expenseId = '00000000-0000-4000-8000-000000000004';
const p = (extras: Partial<PremiumRow> = {}): PremiumRow => ({ clientName: 'Empresa A', clientRut: undefined, policy: '001', coverage: 'Salud', period: '2026-01', premiumUf: 100, spendUf: 90, ...extras });
const e = (extras: Partial<ExpenseRow> = {}): ExpenseRow => ({ clientName: 'Empresa A', policy: '001', coverage: 'Salud', period: '2026-01', descCober: 'CONSULTAS', reembolsoUf: 70,
  provider: 'Prestador', insuredRut: 'privado', patientRut: 'privado', relation: '', isapre: '', valPrest: 0, valBonif: 0, mtoReclam: 0, ...extras });
function fixture(): ScopeInput {
  const policy = { id: policyId, client_id: clientId, number_key: '001', insurer_key: 'aseguradora a' };
  const contract = { number: '001', insurer: 'Aseguradora A', startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'UF', status: 'active', cancellationDate: '', coverages: [{ type: 'Salud' }] } as PolicyContract;
  return { client: { id: clientId, name: 'Empresa A' }, policy, policies: [policy],
    versions: [{ id: 'v1', client_id: clientId, policy_id: policyId, revision: 1, validation_status: 'validated', effective_on: '2026-01-01', contract } as PolicyVersion],
    snapshots: [{ id: premiumId, client_id: clientId, kind: 'primas', rows: [p()] }, { id: expenseId, client_id: clientId, kind: 'gastos', rows: [e()] }],
    links: [], periods: ['2026-01'], coverages: ['Salud'] };
}
const cell = (input: ScopeInput) => resolvePolicyScope(input).monthly[0].coverages[0];
const link = (snapshotId: string, extras = {}) => ({ snapshot_id: snapshotId, row_index: 0, policy_id: policyId, policy_version_id: 'v1', coverage: 'Salud', allocation_percent: 100, ...extras });

test('póliza: identidad única, conciliación firmada, exclusiones y ausencia de datos personales', () => {
  const input = fixture();
  input.snapshots[1].rows.push(e({ reembolsoUf: -10 }), e({ reembolsoUf: 5, descCober: 'PRESTACIONES SIN BONIFICACION (S)' }));
  const result = resolvePolicyScope(input), row = result.monthly[0].coverages[0];
  assert.equal(row.premiumUf, 100); assert.equal(row.technicalSpendUf, 90);
  assert.equal(row.reimbursementUf, 65); assert.equal(row.analyzedUf, 70);
  assert.equal(row.excludedNetUf, -5); assert.equal(row.differenceUf, 25);
  assert.equal(row.reconciliation, 'difference');
  assert.equal(row.lossRatio, .9); assert.equal(result.quality.complete, true);
  assert.equal(result.policy.insurer, 'aseguradora a'); assert.equal(result.monthly[0].versionId, 'v1');
  assert.ok(!JSON.stringify(result).includes('privado'));
});
test('póliza: no mezcla otra póliza, empresa ni cobertura', () => {
  const input = fixture();
  input.policies.push({ ...input.policy, id: 'p2', number_key: '002' });
  input.snapshots[0].rows.push(p({ policy: '002', premiumUf: 999 }), p({ coverage: 'Vida', premiumUf: 999 }));
  input.snapshots[1].rows.push(e({ policy: '002', reembolsoUf: 999 }), e({ clientName: 'Otra empresa', reembolsoUf: 999 }));
  const result = resolvePolicyScope(input);
  assert.equal(result.quality.otherPolicyRows, 2); assert.equal(cell(input).premiumUf, 100);
  assert.equal(cell(input).reimbursementUf, 70); assert.equal(result.quality.issueCounts.row_company_conflict, 1);
  assert.equal(result.quality.complete, false);
});
test('póliza: número compartido entre aseguradoras no determina identidad; asignación validada sí', () => {
  const input = fixture();
  input.policies.push({ ...input.policy, id: 'p2', insurer_key: 'aseguradora b' });
  assert.equal(cell(input).premiumUf, null);
  assert.equal(resolvePolicyScope(input).quality.issueCounts.ambiguous_insurer, 2);
  input.links = [link(premiumId), link(expenseId)];
  assert.equal(cell(input).premiumUf, 100); assert.equal(resolvePolicyScope(input).quality.verifiedAllocations, 2);
});
test('póliza: sin número no asume que única empresa significa única póliza', () => {
  const input = fixture(); input.snapshots[0].rows = [p({ policy: '' })];
  assert.equal(cell(input).premiumUf, null);
  assert.equal(resolvePolicyScope(input).quality.issueCounts.missing_policy_number, 1);
  input.links = [link(premiumId)]; assert.equal(cell(input).premiumUf, 100);
});
test('póliza: RUT empresarial contradictorio se informa sin devolver identificadores', () => {
  const input = fixture(); input.client.rut = '11111111-1';
  input.snapshots[0].rows = [p({ clientRut: '22.222.222-2' })];
  assert.equal(cell(input).premiumUf, null);
  assert.equal(resolvePolicyScope(input).quality.issueCounts.row_company_rut_conflict, 1);
  input.snapshots[0].rows = [p({ clientRut: 'inválido' })];
  assert.equal(resolvePolicyScope(input).quality.issueCounts.invalid_company_rut, 1);
});
test('póliza: asignaciones parciales se ponderan y exponen; no completan el saldo automáticamente', () => {
  const input = fixture(); input.links = [link(premiumId, { allocation_percent: 40 })];
  const result = resolvePolicyScope(input);
  assert.equal(cell(input).premiumUf, 40); assert.equal(cell(input).technicalSpendUf, 36);
  assert.equal(result.quality.issues[0].unallocatedPercent, 60); assert.equal(result.quality.complete, false);
  input.links.push(link(premiumId, { policy_id: 'other', allocation_percent: 80 }));
  assert.equal(cell(input).premiumUf, null); assert.equal(resolvePolicyScope(input).quality.issueCounts.invalid_allocation, 1);
});
test('póliza: versión incorrecta o número contradictorio no entra aunque tenga asignación', () => {
  const input = fixture(); input.links = [link(premiumId, { policy_version_id: 'old' })];
  assert.equal(cell(input).premiumUf, null);
  assert.equal(resolvePolicyScope(input).quality.issueCounts.link_version_or_coverage_conflict, 1);
  input.links = [link(premiumId)]; input.snapshots[0].rows = [p({ policy: '002' })];
  assert.equal(resolvePolicyScope(input).quality.issueCounts.policy_number_conflict, 1);
});
test('póliza: cobertura inferida requiere asignación; cobertura no contratada se rechaza', () => {
  const input = fixture(); input.snapshots[1].rows = [e({ coverageInferred: true })];
  assert.equal(cell(input).reimbursementUf, null);
  input.links = [link(expenseId)]; assert.equal(cell(input).reimbursementUf, 70);
  input.links = []; input.versions[0].contract.coverages = [];
  assert.equal(resolvePolicyScope(input).quality.issueCounts.coverage_not_contracted, 1);
});
test('póliza: meses ausentes son null; calidad se evalúa por mes y cobertura', () => {
  const input = fixture(); input.periods.push('2026-02');
  input.snapshots[0].rows.push(p({ period: '2026-02' }));
  const result = resolvePolicyScope(input);
  assert.equal(result.monthly[0].complete, true); assert.equal(result.monthly[1].complete, false);
  assert.equal(result.monthly[1].coverages[0].reimbursementUf, null);
  assert.equal(result.monthly[1].coverages[0].differenceUf, null);
  assert.equal(result.monthly[1].coverages[0].reconciliation, 'unavailable');
  input.coverages.push('Dental'); assert.equal(resolvePolicyScope(input).monthly[0].complete, false);
});
test('póliza: vigencia parcial, cancelación, suspensión, moneda y contrato inconsistente bloquean el mes', () => {
  for (const change of [{ startsOn: '2026-01-15' }, { endsOn: '2026-01-20' }, { status: 'cancelled', cancellationDate: '2026-01-20' },
    { status: 'suspended' }, { currency: 'CLP' }, { insurer: 'Otra' }]) {
    const input = fixture(); Object.assign(input.versions[0].contract, change);
    assert.equal(cell(input).premiumUf, null, JSON.stringify(change));
    assert.equal(resolvePolicyScope(input).quality.complete, false);
  }
});
test('póliza: endoso dentro del mes exige resolución; borrador no desplaza versión validada', () => {
  const input = fixture();
  input.versions.push({ ...input.versions[0], id: 'v2', revision: 2, effective_on: '2026-01-15', validation_status: 'draft' });
  assert.equal(cell(input).premiumUf, 100);
  input.versions[1].validation_status = 'validated';
  assert.equal(resolvePolicyScope(input).monthly[0].problem, 'contract_changes_within_month');
  assert.equal(cell(input).premiumUf, null);
  input.versions = []; assert.equal(resolvePolicyScope(input).monthly[0].problem, 'no_validated_version');
});
test('póliza: contrato JSON incompleto se señala sin fallar ni inventar vigencia', () => {
  const input = fixture(); input.versions[0].contract = {} as PolicyContract;
  const result = resolvePolicyScope(input);
  assert.equal(result.monthly[0].problem, 'malformed_contract');
  assert.equal(result.monthly[0].versionId, null); assert.equal(cell(input).premiumUf, null);
});
test('póliza: snapshots de otra empresa, filtros inválidos e importes no finitos se rechazan', () => {
  const input = fixture(); input.snapshots[1].client_id = 'other';
  assert.throws(() => cell(input), /misma empresa/);
  for (const periods of [[], ['2026-13'], ['2026-01', 'incorrecto']]) assert.throws(() => cell({ ...fixture(), periods }), /períodos/);
  const amounts = fixture(); amounts.snapshots[0].rows = [p({ premiumUf: NaN })];
  assert.equal(cell(amounts).premiumUf, null); assert.equal(resolvePolicyScope(amounts).quality.issueCounts.invalid_amount, 1);
});

test('HTTP: exige sesión, respeta RLS de póliza, valida snapshots y conserva rutas históricas', async () => {
  const input = fixture();
  const tables: Record<string, any[]> = {
    clients: [input.client], portfolio_policies: input.policies, portfolio_policy_versions: input.versions,
    portfolio_dataset_versions: input.snapshots, portfolio_row_links: input.links,
  };
  const db = { from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const q: any = { select: () => q, eq: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return q; },
      order: () => q, range: (a: number, b: number) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }) };
    return q;
  } } as unknown as SupabaseClient;
  const app = createApp(async () => ({ db, profile: { id: clientId, email: '', full_name: '', role: 'executive', active: true } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.on('listening', r));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  const base = `http://127.0.0.1:${address.port}`;
  const path = `/report/policies/${policyId}/quality?periods=2026-01&coverages=Salud&premiumSnapshotId=${premiumId}&expenseSnapshotId=${expenseId}`;
  const headers = { Authorization: 'Bearer test' };
  try {
    assert.equal((await fetch(base + path)).status, 401);
    const response = await fetch(base + path, { headers }); assert.equal(response.status, 200);
    assert.equal((await response.json()).monthly[0].coverages[0].differenceUf, 20);
    const monthlyResponse = await fetch(base + path.replace('/quality?', '/monthly?'), { headers });
    assert.equal(monthlyResponse.status, 200);
    const indicators = await monthlyResponse.json();
    assert.equal(indicators.monthly[0].current.premiumUf, 100);
    assert.equal(indicators.monthly[0].attribution.available, false);
    const scenarios = await fetch(base + path.replace('/quality?', '/renewal-scenarios?'), {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarios: [{}] }),
    });
    assert.equal(scenarios.status, 200); assert.equal((await scenarios.json()).scenarios[0].status, 'blocked');
    assert.equal((await fetch(base+path.replace('/quality?','/reviews?'),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(base + `/report/monthly?policyId=${policyId}`, { headers })).status, 400);
    assert.equal((await fetch(base + path.replace('/quality?', '/monthly?'))).status, 401);
    assert.equal((await fetch(base + path.replace('/quality?', '/renewal-scenarios?'), { method: 'POST' })).status, 401);
    // La segunda aseguradora no debe desaparecer por el límite de PostgREST.
    input.policies.push(...Array.from({ length: 500 }, (_, i) => ({ ...input.policy, id: `filler${i}`, number_key: `other${i}` })),
      { ...input.policy, id: 'same-number', insurer_key: 'otra' });
    const paginated = await fetch(base + path.replace('/quality?', '/monthly?'), { headers });
    assert.equal((await paginated.json()).monthly[0].status, 'blocked');
    input.policies.splice(1);
    assert.equal((await fetch(base + path.replace(policyId, clientId), { headers })).status, 404);
    input.snapshots[1].client_id = 'other'; assert.equal((await fetch(base + path, { headers })).status, 404);
    assert.equal((await fetch(base + path.replace('2026-01', '2026-13'), { headers })).status, 400);
    assert.equal((await fetch(base + '/report/monthly')).status, 401);
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});

test('esquema real local: migraciones existentes, snapshots, asignaciones y aislamiento RLS compatibles', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;`);
    for (const name of ['202609060001_accounts', '202609170001_portfolio', '202609230001_replace_dataset',
      '202609290001_chunked_dataset_upload', '202610010001_report_branding', '202610160001_presentation_branding',
      '202610300001_portfolio_contracts', '202610300002_portfolio_storage', '202610300003_portfolio_import_identity']) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    const input = fixture(), versionId = '00000000-0000-4000-8000-000000000005';
    input.versions[0].id = versionId;
    await db.query("insert into auth.users values($1,'test@example.test','{}')", [clientId]);
    await db.query('insert into public.clients(id,name) values($1,$2)', [clientId, input.client.name]);
    await db.query('insert into public.portfolio_policies(id,client_id,number_key,insurer_key) values($1,$2,$3,$4)', [policyId, clientId, '001', 'aseguradora a']);
    await db.query(`insert into public.portfolio_policy_versions(id,policy_id,client_id,revision,change_type,effective_on,validation_status,contract,created_by)
      values($1,$2,$3,1,'initial','2026-01-01','validated',$4::jsonb,$3)`, [versionId, policyId, clientId, JSON.stringify(input.versions[0].contract)]);
    for (const s of input.snapshots) {
      await db.query('insert into public.portfolio_dataset_versions(id,client_id,kind,rows) values($1,$2,$3,$4::jsonb)', [s.id, clientId, s.kind, JSON.stringify(s.rows)]);
      await db.query(`insert into public.portfolio_row_links(snapshot_id,row_index,policy_id,policy_version_id,coverage,allocation_percent)
        values($1,0,$2,$3,'Salud',100)`, [s.id, policyId, versionId]);
    }
    input.policies = (await db.query<any>('select id,client_id,number_key,insurer_key from public.portfolio_policies where client_id=$1', [clientId])).rows;
    input.versions = (await db.query<any>('select id,client_id,policy_id,revision,effective_on::text,validation_status,contract from public.portfolio_policy_versions where client_id=$1', [clientId])).rows;
    input.snapshots = (await db.query<any>('select id,client_id,kind,rows from public.portfolio_dataset_versions where client_id=$1', [clientId])).rows;
    input.links = (await db.query<any>('select * from public.portfolio_row_links')).rows;
    const result = resolvePolicyScope(input);
    assert.equal(result.quality.complete, true); assert.equal(result.quality.verifiedAllocations, 2);
    assert.equal(result.monthly[0].coverages[0].differenceUf, 20);
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false); set role authenticated");
    for (const table of ['clients', 'portfolio_policies', 'portfolio_policy_versions', 'portfolio_dataset_versions', 'portfolio_row_links']) {
      assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0, table);
    }
  } finally { await db.close(); }
});
