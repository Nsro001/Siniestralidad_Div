import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/app.js";
import { HttpError, requireAdmin } from "../src/supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const admin = "00000000-0000-4000-8000-000000000001";
const executive = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";

test("RLS: asignaciones, cuentas desactivadas, escalamiento e importaciones atómicas", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/202609060001_accounts.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/202609170001_portfolio.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/202609230001_replace_dataset.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users values ($1, 'admin@example.test', '{}'), ($2, 'exec@example.test', '{}'), ($3, 'other@example.test', '{\"role\":\"admin\"}')", [admin, executive, other]);
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
    const asUser = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec("set role authenticated");
    };
    const upload = (rows: unknown[], kind = "primas") => db.query("select public.import_client_dataset($1, $2::jsonb)", [kind, JSON.stringify(rows)]);
    const a = { clientName: "Cliente A", period: "2024-11", coverage: "Salud", premiumUf: 100, spendUf: 80 };
    const b = { ...a, clientName: "Cliente B" };
    await asUser(admin);
    await upload([a, b]);
    const clients = (await db.query<{id:string;name:string}>("select id, name from public.clients order by name")).rows;
    const aId = clients[0].id, bId = clients[1].id;
    await db.query("select public.manage_executive($1, 'Ejecutivo', true, $2::uuid[])", [executive, [aId]]);
    await asUser(executive);
    assert.deepEqual((await db.query("select name from public.clients")).rows, [{name: "Cliente A"}]);
    assert.equal((await db.query("select * from public.client_datasets")).rows.length, 1);
    assert.equal((await db.query("select * from public.client_datasets where client_id = $1", [bId])).rows.length, 0);
    assert.equal((await db.query("select * from public.profiles")).rows.length, 1);
    await assert.rejects(upload([b]), /Administrador requerido/);
    await assert.rejects(db.query("update public.profiles set role='admin' where id=$1", [executive]), /permission denied/);
    await assert.rejects(db.query("insert into public.client_assignments values ($1, $2)", [executive, bId]), /permission denied/);
    await assert.rejects(db.query("select public.manage_executive($1, 'Ataque', true, $2::uuid[])", [executive, [bId]]), /Administrador requerido/);
    await asUser(other);
    assert.equal((await db.query("select public.is_admin() as admin")).rows[0].admin, false, "metadata no concede rol admin");
    assert.equal((await db.query("select * from public.clients")).rows.length, 0);
    await asUser(admin);
    await assert.rejects(db.query("select public.manage_executive($1, 'Admin', false, '{}'::uuid[])", [admin]), /Ejecutivo no encontrado/);
    // Recargar A conserva B y el otro tipo de sábana.
    await upload([{ ...a, reembolsoUf: 15 }], "gastos");
    await upload([{ ...a, premiumUf: 200 }]);
    assert.equal((await db.query("select * from public.client_datasets")).rows.length, 3);
    await assert.rejects(upload([{ ...a, premiumUf: 999 }, { ...b, period: "inválido" }]), /Filas sin/);
    assert.equal((await db.query<{amount:number}>("select (rows->0->>'premiumUf')::int as amount from public.client_datasets where client_id=$1 and kind='primas'", [aId])).rows[0].amount, 200);
    // Desactivar y revocar funcionan con el mismo identificador de sesión.
    await db.query("select public.manage_executive($1, 'Ejecutivo', false, $2::uuid[])", [executive, [aId]]);
    await asUser(executive);
    assert.equal((await db.query("select * from public.clients")).rows.length, 0);
    assert.equal((await db.query("select * from public.client_datasets")).rows.length, 0);
    await asUser(admin);
    await db.query("select public.manage_executive($1, 'Ejecutivo', true, '{}'::uuid[])", [executive]);
    await asUser(executive);
    assert.equal((await db.query("select * from public.clients")).rows.length, 0);
    // Cartera por nombres vinculados, jefe y reasignaciones del último mes.
    await asUser(admin);
    await upload([{ ...a, kam: "KAM Uno", manager: "Jefe Uno" }, { ...b, kam: "KAM Dos", manager: "Jefe Dos" }]);
    await db.query("select public.manage_portfolio_account($1, 'KAM', true, '{}'::uuid[], 'executive', 'KAM Uno')", [executive]);
    await db.query("select public.manage_portfolio_account($1, 'Jefe', true, '{}'::uuid[], 'manager', 'Jefe Uno')", [other]);
    await asUser(executive);
    assert.deepEqual((await db.query("select name from public.clients")).rows, [{ name: "Cliente A" }]);
    await assert.rejects(db.query("select public.manage_portfolio_account($1, 'Ataque', true, '{}'::uuid[], 'manager', 'Jefe Dos')", [executive]), /Administrador requerido/);
    await asUser(other);
    assert.deepEqual((await db.query("select name from public.clients")).rows, [{ name: "Cliente A" }]);
    assert.equal((await db.query("select * from public.client_datasets")).rows.length, 2);
    await assert.rejects(upload([a]), /Administrador requerido/);
    await asUser(admin);
    await assert.rejects(upload([{ ...a, kam: "Uno", manager: "Jefe Uno" }, { ...a, kam: "Dos", manager: "Jefe Uno" }]), /Un cliente debe/);
    await upload([{ ...a, kam: "KAM Uno", manager: "Jefe Uno" }, { ...a, period: "2025-01", kam: "KAM Dos", manager: "Jefe Dos" }]);
    await asUser(other);
    assert.equal((await db.query("select * from public.clients")).rows.length, 0, "el jefe pierde acceso al cambiar la cartera");
    await asUser(executive);
    assert.equal((await db.query("select * from public.clients")).rows.length, 0, "el KAM pierde acceso al cambiar la cartera");
    await asUser(admin);
    await db.query("select public.manage_portfolio_account($1, 'Jefe', false, '{}'::uuid[], 'manager', 'Jefe Dos')", [other]);
    await asUser(other);
    assert.equal((await db.query("select * from public.clients")).rows.length, 0, "jefe inactivo no accede");
    await assert.rejects(db.query("select public.replace_client_dataset('primas', $1::jsonb)", [JSON.stringify([a])]), /Administrador requerido/);
    await asUser(admin);
    const replace = (rows: unknown[]) => db.query("select public.replace_client_dataset('primas', $1::jsonb)", [JSON.stringify(rows)]);
    await assert.rejects(replace([]), /no contiene filas/);
    await assert.rejects(replace([{ ...a, period: "inválido" }]), /Filas sin/);
    assert.equal((await db.query("select * from public.client_datasets where kind='primas'")).rows.length, 2);
    await replace([{ ...a, premiumUf: 321, kam: "KAM Nuevo" }]);
    assert.equal((await db.query("select * from public.client_datasets where kind='primas'")).rows.length, 1);
    assert.equal((await db.query("select * from public.client_datasets where kind='gastos'")).rows.length, 1, "reemplazar primas conserva gastos");
    assert.equal((await db.query("select * from public.clients")).rows.length, 2, "conserva identidades");
    assert.deepEqual((await db.query("select kam_name, manager_name from public.clients where id=$1", [bId])).rows, [{ kam_name: null, manager_name: null }]);
    await upload([b]);
    assert.equal((await db.query("select * from public.client_datasets where kind='primas'")).rows.length, 2, "la modalidad parcial sigue disponible");
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from public.client_datasets"), /permission denied/);
    await assert.rejects(db.query("select public.import_client_dataset('primas', '[]')"), /permission denied/);
  } finally { await db.close(); }
});

test("API: exige sesión, bloquea administración/carga y rechaza clientes ajenos", async () => {
  let queried = false;
  const fakeDb = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      queried = true; return { data: null, error: null };
    } }) }) }),
  } as unknown as SupabaseClient;
  const profile = { id: executive, email: "exec@example.test", full_name: "Ejecutivo", role: "executive" as const, active: true };
  assert.throws(() => requireAdmin(profile), /administrador/);
  assert.throws(() => requireAdmin({ ...profile, role: "admin", active: false }), /administrador/);
  const app = createApp(async token => {
    if (token !== "valid") throw new HttpError(401, "Sesión inválida");
    return { db: fakeDb, profile };
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    for (const path of ["/report/monthly", "/portfolio", "/filters", "/report/primas", "/report/gastos", "/report/claimants", "/admin/users", "/me"]) {
      assert.equal((await fetch(base + path)).status, 401, path);
      assert.equal((await fetch(base + path, {headers:{Authorization:"Bearer invalid"}})).status, 401, path);
    }
    for (const path of ["/upload/primas", "/upload/gastos", "/admin/users"]) {
      const response = await fetch(base + path, {method:"POST", headers:{Authorization:"Bearer valid"}});
      assert.equal(response.status, 403, path);
    }
    for (const kind of ["primas", "gastos", "claimants", "monthly"]) {
      const response = await fetch(`${base}/report/${kind}?client=Otro`, {headers:{Authorization:"Bearer valid"}});
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.ok(queried);
    assert.equal((await fetch(`${base}/me`, {headers:{Authorization:"Bearer valid"}})).status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
