import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001",
  exec = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const doc = "00000000-0000-4000-8000-000000000010",
  cov = "00000000-0000-4000-8000-000000000011",
  plan = "00000000-0000-4000-8000-000000000012";
test("cartera: migraciones, múltiples pólizas/coberturas, evidencia, historia y permisos", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
    for (const name of [
      "202609060001_accounts",
      "202609170001_portfolio",
      "202609230001_replace_dataset",
      "202609290001_chunked_dataset_upload",
      "202610010001_report_branding",
      "202610160001_presentation_branding",
    ])
      await db.exec(
        await readFile(
          new URL(`../../supabase/migrations/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`insert into public.clients(id,name) values('00000000-0000-4000-8000-000000000050','Legado único'),('00000000-0000-4000-8000-000000000051','Legado ambiguo');
    insert into public.client_datasets(client_id,kind,rows) values
    ('00000000-0000-4000-8000-000000000050','primas','[{"clientName":"Legado único","clientRut":"11111111-1","period":"2026-01","coverage":"Salud","premiumUf":1}]'),
    ('00000000-0000-4000-8000-000000000051','primas','[{"clientName":"Legado ambiguo","clientRut":"22222222-2","period":"2026-01","coverage":"Salud","premiumUf":1},{"clientName":"Legado ambiguo","clientRut":"33333333-3","period":"2026-02","coverage":"Salud","premiumUf":1}]');`);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/ADMINISTRACION_CARTERA_COMPLETO.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test("las ocho tablas nuevas tienen RLS y rechazan escrituras directas", async () => {
      const tables = await db.query<{relname:string;relrowsecurity:boolean;writable:boolean}>(`
        select c.relname,c.relrowsecurity,
          has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') writable
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relname like 'portfolio_%'
        order by c.relname`);
      assert.equal(tables.rows.length,8);
      assert.ok(tables.rows.every(t=>t.relrowsecurity && !t.writable));
      assert.equal((await db.query("select * from public.client_datasets")).rows.length,2);
      assert.equal((await db.query("select * from public.clients")).rows.length,2);
    });
    await db.query(
      "insert into auth.users values($1,'a','{}'),($2,'b','{}'),($3,'c','{}')",
      [admin, exec, other],
    );
    await db.query("update public.profiles set role='admin' where id=$1", [
      admin,
    ]);
    async function as(id: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    await as(admin);
    async function client(name: string, rut: string | null) {
      return (
        await db.query<{ id: string }>(
          "select public.portfolio_save_client(null,0,$1::jsonb) id",
          [
            JSON.stringify({
              legal_name: name,
              rut,
              portfolio_status: "active",
            }),
          ],
        )
      ).rows[0].id;
    }
    await t.test(
      "RUT históricos: backfill inequívoco y bloqueo de duplicados pendientes",
      async () => {
        assert.equal(
          (
            await db.query<{ rut: string }>(
              "select rut from public.clients where name='Legado único'",
            )
          ).rows[0].rut,
          "11111111-1",
        );
        assert.equal(
          (
            await db.query<{ rut: string | null }>(
              "select rut from public.clients where name='Legado ambiguo'",
            )
          ).rows[0].rut,
          null,
        );
        await assert.rejects(
          client("Nuevo duplicado", "22222222-2"),
          /sábana histórica/,
        );
        await assert.rejects(
          client("Otro duplicado", "11111111-1"),
          /duplicate key/,
        );
      },
    );
    const cid = await client("Prueba SpA", "12.345.678-5"),
      cid2 = await client("Otra SpA", null);
    const quote =
      "Póliza 0001. Salud y Vida. Plan A. Vigencia 01/01/2026 a 31/12/2026. Prima mensual 100 UF. Comisión 10% prima neta. Deducible familiar 2 UF.";
    const evidence = { documentId: doc, page: 1, quote };
    await db.query(
      "select public.portfolio_register_document($1,$2,'prueba.pdf',$3)",
      [doc, cid, "a".repeat(64)],
    );
    await db.query(
      "select public.portfolio_update_document($1,$2,'review',$3::jsonb,'[]',null)",
      [doc, cid, JSON.stringify([{ page: 1, text: quote, method: "text" }])],
    );
    const c = {
      number: "0001",
      insurer: "Prueba Seguros",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      currency: "UF",
      premium: "100",
      periodicity: "monthly",
      commission: "10",
      commissionBasis: "Prima neta",
      broker: "",
      kam: "Ana",
      status: "active",
      cancellationDate: "",
      coverages: [
        {
          id: cov,
          type: "Salud",
          name: "Salud",
          plans: [
            {
              id: plan,
              name: "Plan A",
              groups: ["Grupo 1", "Grupo 2"],
              terms: [
                {
                  id: doc,
                  label: "Deducible",
                  value: "2",
                  unit: "UF",
                  scope: "Familiar",
                  period: "Anual",
                  evidence,
                },
              ],
            },
          ],
        },
        {
          id: "00000000-0000-4000-8000-000000000013",
          type: "Vida",
          name: "Vida",
          plans: [],
        },
      ],
      evidence: Object.fromEntries(
        [
          "number",
          "insurer",
          "startsOn",
          "endsOn",
          "currency",
          "periodicity",
          "effectiveOn",
          "premium",
          "commission",
          "commissionBasis",
          cov,
          plan,
          "00000000-0000-4000-8000-000000000013",
        ].map((k) => [k, evidence]),
      ),
    };
    async function save(
      payload: unknown,
      policy: string | null = null,
      revision = 0,
      validation = "validated",
      target = cid,
      kind = "initial",
      date = "2026-01-01",
    ) {
      return (
        await db.query<{ id: string }>(
          "select public.portfolio_save_policy($1,$2,$3,$4,$5::date,$6,$7::jsonb,'prueba') id",
          [
            target,
            policy,
            revision,
            kind,
            date,
            validation,
            JSON.stringify(payload),
          ],
        )
      ).rows[0].id;
    }
    await t.test("póliza validada sin prima total ni respaldo de total: ausencia legítima",async()=>{
      await db.exec("begin");
      try {
        const variable={...c,number:"variable-test",premium:"",evidence:{...c.evidence}};
        delete (variable.evidence as Record<string,unknown>).premium;
        const policy=await save(variable);
        const result=await db.query<{contract:{premium:string};validation_status:string}>("select contract,validation_status from public.portfolio_policy_versions where policy_id=$1",[policy]);
        assert.equal(result.rows[0].contract.premium,"");assert.equal(result.rows[0].validation_status,"validated");
      }finally{await db.exec("rollback");}
    });
    let pid = "",
      pid2 = "";
    await t.test(
      "varias pólizas, aseguradoras y coberturas sin duplicar clientes",
      async () => {
        pid = await save(c);
        pid2 = await save({ ...c, insurer: "Otra aseguradora" });
        assert.equal(
          (
            await db.query(
              "select * from public.portfolio_policies where client_id=$1",
              [cid],
            )
          ).rows.length,
          2,
        );
        await assert.rejects(save(c), /duplicate key/);
        await assert.rejects(
          client("Duplicada", "12345678-5"),
          /duplicate key/,
        );
      },
    );
    await t.test(
      "respaldo obligatorio, páginas existentes y sin documentos de otro cliente",
      async () => {
        await assert.rejects(
          save({ ...c, evidence: {} }, pid, 1, "validated", cid, "endorsement"),
          /respaldo/,
        );
        await assert.rejects(
          save({ ...c, number: "0002" }, null, 0, "validated", cid2),
          /Documento no disponible/,
        );
        await assert.rejects(
          save(
            {
              ...c,
              evidence: { ...c.evidence, startsOn: { ...evidence, page: 99 } },
            },
            pid,
            1,
            "validated",
            cid,
            "endorsement",
          ),
          /Página/,
        );
        await assert.rejects(
          db.query(
            "select public.portfolio_update_document($1,$2,'review',null,null,null)",
            [doc, cid2],
          ),
          /versión validada/,
        );
      },
    );
    await t.test(
      "endosos/renovaciones inmutables y control de concurrencia",
      async () => {
        await save(
          { ...c, premium: "110" },
          pid,
          1,
          "validated",
          cid,
          "endorsement",
          "2026-10-01",
        );
        await save(
          { ...c, startsOn: "2027-01-01", endsOn: "2027-12-31" },
          pid,
          2,
          "validated",
          cid,
          "renewal",
          "2027-01-01",
        );
        assert.equal(
          (
            await db.query(
              "select * from public.portfolio_policy_versions where policy_id=$1",
              [pid],
            )
          ).rows.length,
          3,
        );
        await assert.rejects(save(c, pid, 1), /cambió/);
        await assert.rejects(
          db.query("update public.portfolio_policy_versions set note='x'"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "importación RUT/alias conserva nombre histórico y snapshots",
      async () => {
        const row = {
          clientName: "Nombre distinto del Excel",
          clientRut: "12.345.678-5",
          coverage: "Salud",
          period: "2026-10",
          premiumUf: 100,
          spendUf: 70,
          policy: "0001",
          kam: "Ana",
        };
        await db.query(
          "select public.import_client_dataset('primas',$1::jsonb)",
          [JSON.stringify([row])],
        );
        assert.equal(
          (await db.query("select * from public.clients")).rows.length,
          4,
        );
        const data = await db.query<{ rows: any[] }>(
          "select rows from public.client_datasets where client_id=$1",
          [cid],
        );
        assert.equal(data.rows[0].rows[0].clientName, "Prueba SpA");
        await db.query(
          "select public.import_client_dataset('primas',$1::jsonb)",
          [JSON.stringify([{ ...row, premiumUf: 200 }])],
        );
        assert.equal(
          (
            await db.query(
              "select * from public.portfolio_dataset_versions where client_id=$1",
              [cid],
            )
          ).rows.length,
          2,
        );
        await assert.rejects(
          db.query("select public.import_client_dataset('primas',$1::jsonb)", [
            JSON.stringify([{ ...row, clientName: "Otra SpA" }]),
          ]),
          /Conflicto/,
        );
        const upload = "00000000-0000-4000-8000-000000000099";
        await db.query(
          "select public.begin_dataset_upload($1,'primas',false,1,1)",
          [upload],
        );
        await db.query(
          "select public.append_dataset_upload_chunk($1,0,$2::jsonb)",
          [
            upload,
            JSON.stringify([
              { ...row, clientName: "Tercer alias", premiumUf: 300 },
            ]),
          ],
        );
        await db.query("select public.finish_dataset_upload($1)", [upload]);
        await db.query("select public.finish_dataset_upload($1)", [upload]);
        assert.equal(
          (await db.query("select * from public.clients")).rows.length,
          4,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.portfolio_dataset_versions where client_id=$1",
              [cid],
            )
          ).rows.length,
          3,
        );
      },
    );
    await t.test(
      "vínculos bloquean sobreasignación y filas inexistentes",
      async () => {
        const sid = (
          await db.query<{ id: string }>(
            "select id from public.portfolio_dataset_versions where client_id=$1 limit 1",
            [cid],
          )
        ).rows[0].id;
        const vid = (
          await db.query<{ id: string }>(
            "select id from public.portfolio_policy_versions where policy_id=$1 order by revision limit 1",
            [pid],
          )
        ).rows[0].id;
        const vid2 = (
          await db.query<{ id: string }>(
            "select id from public.portfolio_policy_versions where policy_id=$1 limit 1",
            [pid2],
          )
        ).rows[0].id;
        await db.query(
          "select public.portfolio_link_row($1,0,$2,'Salud',60,$3)",
          [sid, pid, vid],
        );
        await db.query(
          "select public.portfolio_link_row($1,0,$2,'Vida',40,$3)",
          [sid, pid, vid],
        );
        await assert.rejects(
          db.query("select public.portfolio_link_row($1,0,$2,'Salud',50,$3)", [
            sid,
            pid2,
            vid2,
          ]),
          /100%/,
        );
        await assert.rejects(
          db.query(
            "select public.portfolio_link_row($1,99,$2,'Salud',100,$3)",
            [sid, pid, vid],
          ),
          /Fila/,
        );
      },
    );
    await t.test(
      "movimientos acreditados separados e idempotentes",
      async () => {
        const mid = "00000000-0000-4000-8000-000000000088",
          m = {
            movement_type: "collected",
            amount: "100",
            currency: "UF",
            period: "2026-10",
            occurred_on: "2026-10-30",
            source_reference: "REC-1",
            evidence,
          };
        for (let i = 0; i < 2; i++)
          await db.query(
            "select public.portfolio_add_movement($1,$2,$3,$4::jsonb)",
            [mid, cid, pid, JSON.stringify(m)],
          );
        assert.equal(
          (await db.query("select * from public.portfolio_premium_movements"))
            .rows.length,
          1,
        );
        await assert.rejects(
          db.query("select public.portfolio_add_movement($1,$2,$3,$4::jsonb)", [
            mid,
            cid,
            pid,
            JSON.stringify({ ...m, amount: "200" }),
          ]),
          /reutilizado/,
        );
      },
    );
    await t.test(
      "RLS, funciones privadas y Storage respetan autorización por cliente",
      async () => {
        await db.query(
          "insert into storage.objects(bucket_id,name) values('portfolio-policies',$1)",
          [`${admin}/${doc}.pdf`],
        );
        await db.query(
          "select public.manage_executive($1,'KAM',true,array[$2::uuid])",
          [exec, cid],
        );
        await as(exec);
        assert.equal(
          (await db.query("select * from public.portfolio_policy_versions"))
            .rows.length,
          4,
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        await assert.rejects(save(c), /Administrador/);
        await assert.rejects(
          db.query(
            "select public.portfolio_legacy_import_client_dataset('primas','[]')",
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('portfolio-policies','x.pdf')",
          ),
          /row-level security/,
        );
        await assert.rejects(
          db.query("select public.portfolio_check_evidence($1::jsonb,$2)", [
            JSON.stringify(evidence),
            cid,
          ]),
          /permission denied/,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.portfolio_documents")).rows
            .length,
          0,
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.portfolio_dataset_versions"))
            .rows.length,
          0,
        );
        await as(admin);
        await db.query(
          "select public.manage_executive($1,'KAM',false,array[$2::uuid])",
          [exec, cid],
        );
        await as(exec);
        assert.equal(
          (await db.query("select * from public.portfolio_policies")).rows
            .length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.portfolio_audit")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "reversión y reactivación sin borrar contratos ni documentos",
      async () => {
        await as(admin);
        const before = (
          await db.query("select * from public.portfolio_policy_versions")
        ).rows.length;
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL("../../docs/REVERSIÓN_CARTERA.sql", import.meta.url),
            "utf8",
          ),
        );
        await as(admin);
        await assert.rejects(client("Bloqueado", null), /permission denied/);
        assert.equal(
          (await db.query("select * from public.portfolio_policy_versions"))
            .rows.length,
          before,
        );
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL("../../docs/REACTIVAR_CARTERA.sql", import.meta.url),
            "utf8",
          ),
        );
        await as(admin);
        assert.ok(await client("Reactivado", null));
      },
    );
  } finally {
    await db.close();
  }
});
