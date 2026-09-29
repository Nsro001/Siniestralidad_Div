import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveRows } from "../src/storage.js";
import { parseUpload } from "../src/parser.js";

const row = { clientName: "A", period: "2025-01", coverage: "Salud", premiumUf: 100, spendUf: 20 };
test("CSV UTF-8: ambos separadores, BOM, comillas, saltos, fechas y encabezados actuales", async () => {
  for (const separator of [",", ";"]) {
    const encode = (values: string[]) => values.map(value => `"${value.replaceAll('"', '""')}"`).join(separator);
    const csv = '\ufeff' + encode(["Nombe Cliente", "Periodo", "Cobertura", "Prima UF", "Gasto UF"]) + '\r\n' +
      encode(['Árbol; Sur, "Uno"\nDos', "31/01/2025", "Salud", "1.234,56", "45,5"]);
    const result = await parseUpload(Buffer.from(csv), "primas", "Primas.CSV");
    assert.equal(result[0].clientName, 'Árbol; Sur, "Uno"\nDos');
    assert.equal(result[0].period, "2025-01");
    assert.equal(result[0].premiumUf, 1234.56);
    assert.equal(result[0].spendUf, 45.5);
  }
  const expenses = await parseUpload(Buffer.from('Nombre Con;PERIODO;Clasif.Cob;Reembolso;Paciente;dvg\nÁrbol;2025-01;Consulta;1,5;00123;K'), "gastos", "gastos.csv");
  assert.equal(expenses[0].reembolsoUf, 1.5);
  assert.equal(expenses[0].patientRut, "00123-K");
  for (const csv of ['a,b\n"sin cierre,b', 'a,b\n1,2,3', 'a,b\n', 'a,b\n"x"oops,2']) {
    await assert.rejects(parseUpload(Buffer.from(csv), "primas", "bad.csv"));
  }
  await assert.rejects(parseUpload(Buffer.from([0xff]), "gastos", "bad.csv"));
});

test("storage: limita chunks, reintenta misma identidad y no finaliza tras un fallo", async () => {
  const calls: { name: string; args: any }[] = [];
  let failOnce = true;
  const db = { async rpc(name: string, args: any) {
    calls.push({ name, args });
    if (name === "append_dataset_upload_chunk" && args.chunk_index === 1 && failOnce) {
      failOnce = false; return { error: { code: "57014" } };
    }
    return { error: null };
  } } as unknown as SupabaseClient;
  await saveRows(db, "primas", Array.from({ length: 1201 }, () => row), true);
  assert.equal(calls[0].args.expected_chunks, 3);
  assert.equal(calls[0].args.replace_all, true);
  assert.equal(calls.at(-1)?.name, "finish_dataset_upload");
  assert.deepEqual(calls[2], calls[3]);
  assert.ok(calls.filter(call => call.name === "append_dataset_upload_chunk").every(call => call.args.chunk_rows.length <= 500));
  calls.length = 0;
  let lostResponse = true;
  const lostFinish = { async rpc(name: string, args: any) {
    calls.push({ name, args });
    if (name === "finish_dataset_upload" && lostResponse) {
      lostResponse = false; throw new Error("Respuesta perdida");
    }
    return { error: null };
  } } as unknown as SupabaseClient;
  await saveRows(lostFinish, "primas", Array.from({ length: 6 }, () => ({ ...row, policy: "á".repeat(60000) })));
  const appends = calls.filter(call => call.name === "append_dataset_upload_chunk");
  assert.equal(appends.length, 2, "divide también por bytes UTF-8");
  assert.ok(appends.every(call => Buffer.byteLength(JSON.stringify(call.args.chunk_rows)) <= 512 * 1024));
  assert.deepEqual(calls.at(-1), calls.at(-2), "reintenta el mismo cierre si perdió la respuesta");
  calls.length = 0;
  const broken = { async rpc(name: string, args: any) {
    calls.push({ name, args });
    return { error: name === "append_dataset_upload_chunk" ? { code: "P0001" } : null };
  } } as unknown as SupabaseClient;
  await assert.rejects(saveRows(broken, "primas", [row]), /No se pudo confirmar/);
  assert.ok(!calls.some(call => call.name === "finish_dataset_upload"));
});

test("storage: rechaza más de 25 MiB procesados antes de iniciar una carga", async () => {
  let called = false;
  const db = { async rpc() { called = true; return { error: null }; } } as unknown as SupabaseClient;
  const rows = Array.from({ length: 300 }, () => ({ ...row, policy: "á".repeat(50000) }));
  await assert.rejects(saveRows(db, "primas", rows), /supera 25 MB/);
  assert.equal(called, false);
});

test("SQL: staging atómico, idempotencia, reemplazo, RLS y 25.473 filas", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001";
  const otherAdmin = "00000000-0000-4000-8000-000000000002";
  const executive = "00000000-0000-4000-8000-000000000003";
  const id = "10000000-0000-4000-8000-000000000001";
  const second = "10000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    for (const file of ["202609060001_accounts.sql", "202609170001_portfolio.sql", "202609230001_replace_dataset.sql", "202609290001_chunked_dataset_upload.sql"]) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users values ($1,'a','{}'),($2,'b','{}'),($3,'c','{}')", [admin, otherAdmin, executive]);
    await db.query("update profiles set role='admin' where id in ($1,$2)", [admin, otherAdmin]);
    const asUser = async (user: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec("set role authenticated");
    };
    const begin = (upload = id, kind = "gastos", replace = true, chunks = 2, rows = 2) =>
      db.query("select begin_dataset_upload($1,$2,$3,$4,$5)", [upload, kind, replace, chunks, rows]);
    const append = (index: number, rows: unknown[], upload = id) =>
      db.query("select append_dataset_upload_chunk($1,$2,$3)", [upload, index, JSON.stringify(rows)]);
    const finish = (upload = id) => db.query("select finish_dataset_upload($1)", [upload]);
    const datasets = () => db.query("select client_id,kind,rows from client_datasets order by client_id,kind");
    await asUser(admin);
    await db.query("select import_client_dataset('primas',$1)", [JSON.stringify([row])]);
    await db.query("select import_client_dataset('gastos',$1)", [JSON.stringify([row, { ...row, clientName: "B" }])]);
    const before = (await datasets()).rows;
    await begin(); await begin();
    await assert.rejects(begin(id, "primas"), /reutilizado/);
    await append(0, [{ ...row, premiumUf: 200 }]);
    await append(0, [{ ...row, premiumUf: 200 }]);
    await assert.rejects(append(0, [row]), /contenido distinto/);
    await assert.rejects(append(1, [{ ...row, period: "bad" }]), /Filas sin/);
    await assert.rejects(append(2, [row]), /Chunk inválido/);
    await assert.rejects(finish(), /incompleta/);
    assert.deepEqual((await datasets()).rows, before);
    await asUser(otherAdmin);
    await assert.rejects(append(1, [row]), /Carga no disponible/);
    await assert.rejects(finish(), /Carga no disponible/);
    await asUser(executive);
    await assert.rejects(begin(second), /Administrador requerido/);
    await assert.rejects(append(1, [row]), /Administrador requerido/);
    await assert.rejects(finish(), /Administrador requerido/);
    await assert.rejects(db.query("select * from dataset_upload_chunks"), /permission denied/);
    assert.equal((await datasets()).rows.length, 0);
    await asUser(admin);
    await append(1, [row]); await finish();
    const after = (await datasets()).rows;
    assert.equal(after.length, 2, "conserva primas, elimina gastos B");
    await finish(); assert.deepEqual((await datasets()).rows, after);
    // Fallo en trigger al publicar revierte también el reemplazo y deja staging reintentable.
    await begin(second, "primas", true, 1, 2);
    await append(0, [{ ...row, kam: "Uno" }, { ...row, kam: "Dos" }], second);
    await assert.rejects(finish(second), /Un cliente debe/);
    assert.deepEqual((await datasets()).rows, after);
    // Dataset del tamaño informado; sin RPC con la sábana completa.
    const largeId = "10000000-0000-4000-8000-000000000003";
    const count = 25473;
    await begin(largeId, "gastos", false, Math.ceil(count / 500), count);
    for (let offset = 0; offset < count; offset += 500) {
      await append(offset / 500, Array.from({ length: Math.min(500, count - offset) }, (_, index) => ({
        ...row, clientName: "Grande", reembolsoUf: offset + index, provider: "Prestador de prueba",
        insuredRut: "123-K", patientRut: "456-K", relation: "T", descCober: "Consulta", isapre: "Salud",
      })), largeId);
    }
    const start = performance.now();
    await finish(largeId);
    console.log(`Finalización local PGlite 25.473 filas: ${Math.round(performance.now() - start)} ms`);
    const large = await db.query<{ count: number; last: string }>(`select jsonb_array_length(rows) as count,
      rows->-1->>'reembolsoUf' as last from client_datasets d join clients c on c.id=d.client_id where c.name='Grande'`);
    assert.equal(large.rows[0].count, count); assert.equal(large.rows[0].last, "25472");
    assert.equal((await datasets()).rows.length, 3, "importación parcial conserva A");
    await db.exec("reset role; set role anon");
    await assert.rejects(finish(), /permission denied/);
  } finally { await db.close(); }
});
