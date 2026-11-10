import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('revisión técnica: autorización, evidencia, historial y bloqueo de errores de datos en esquema real',async t=>{
 const db=new PGlite();try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 for(const name of ['202609060001_accounts','202609170001_portfolio','202609230001_replace_dataset','202609290001_chunked_dataset_upload','202610010001_report_branding','202610160001_presentation_branding','202610300001_portfolio_contracts','202610300002_portfolio_storage','202610300003_portfolio_import_identity','202611050001_analysis_persistence','202611050002_portfolio_technical_reviews'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 const admin=id(1),exec=id(2),other=id(3),client=id(11),foreign=id(12),policy=id(21),version=id(31),premium=id(41),expense=id(42),foreignSnapshot=id(43),doc=id(51);
 for(const u of [admin,exec,other])await db.query("insert into auth.users values($1,'test@example.invalid','{}')",[u]);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("insert into public.clients(id,name) values($1,'A'),($2,'B')",[client,foreign]);
 await db.query('insert into public.client_assignments values($1,$2)',[exec,client]);
 await db.query("insert into public.portfolio_policies(id,client_id,number_key,insurer_key) values($1,$2,'001','aseguradora')",[policy,client]);
 await db.query(`insert into public.portfolio_policy_versions(id,policy_id,client_id,revision,change_type,effective_on,validation_status,contract,created_by)
 values($1,$2,$3,1,'initial','2026-01-01','validated','{"coverages":[{"type":"Salud"}]}',$4)`,[version,policy,client,admin]);
 for(const [s,c,kind] of [[premium,client,'primas'],[expense,client,'gastos'],[foreignSnapshot,foreign,'gastos']])await db.query("insert into public.portfolio_dataset_versions(id,client_id,kind,rows) values($1,$2,$3,'[{\"period\":\"2026-01\",\"coverage\":\"Salud\"}]')",[s,c,kind]);
 await db.query(`insert into public.portfolio_documents(id,client_id,owner_id,original_name,sha256,object_path,status,pages)
 values($1,$2,$3,'fuente.pdf',repeat('a',64),'archivo.pdf','review','[{"page":1,"text":"Fuente de gasto pagado. Fuente completa."}]')`,[doc,client,admin]);
 const as=async(u:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');};
 const payload={period:'2026-01',coverage:'Salud',review_kind:'expense_basis',decision:'validated',expense_basis:'paid',data_complete:null,evidence:{documentId:doc,page:1,quote:'Fuente de gasto pagado'},note:'Revisión de fuente del mes'};
 const save=(details:unknown=payload,p=premium,e=expense)=>db.query('select public.portfolio_review_technical($1,$2,$3,$4,$5::jsonb) id',[policy,version,p,e,JSON.stringify(details)]);
 await t.test('solo administrador puede escribir; KAM asignado consulta y ajeno no ve',async()=>{
  await as(exec);await assert.rejects(save(),/Administrador/);
  await as(admin);await save();
  await as(exec);assert.equal((await db.query('select * from public.portfolio_technical_reviews')).rows.length,1);
  await assert.rejects(db.exec('update public.portfolio_technical_reviews set expense_basis=\'incurred\''),/permission denied/);
  await as(other);assert.equal((await db.query('select * from public.portfolio_technical_reviews')).rows.length,0);
 });
 await t.test('evidencia y snapshots deben pertenecer a la empresa; no valida datos sin respaldo',async()=>{
  await as(admin);await assert.rejects(save({...payload,evidence:null}),/Falta respaldo/);
  await assert.rejects(db.query("select public.portfolio_update_document($1,$2,'review',null,null,null)",[doc,foreign]),/revisión técnica validada/);
  await assert.rejects(save(payload,premium,foreignSnapshot),/Snapshots de otra empresa/);
  await assert.rejects(save({...payload,evidence:{...payload.evidence,quote:'Texto inexistente'}}),/cita documental inválida/);
  await assert.rejects(save({...payload,expense_basis:'undetermined'}),/check constraint/);
 });
 await t.test('revisiones son aditivas y auditadas; meses/coberturas erróneos nunca se habilitan con una nota',async()=>{
  await as(admin);await save({...payload,decision:'rejected',expense_basis:'undetermined',note:'Debe revisarse la fuente'});
  const rows=(await db.query<any>('select * from public.portfolio_technical_reviews order by id')).rows;assert.equal(rows.length,2);assert.equal(rows[0].expense_basis,'paid');assert.equal(rows[1].decision,'rejected');
  assert.equal((await db.query("select * from public.portfolio_audit where entity='portfolio_technical_reviews'")).rows.length,2);
  for(const review_kind of ['partial_month','coverage_ambiguity'])await assert.rejects(save({...payload,review_kind}),/Falta criterio aprobado/);
  await save({...payload,review_kind:'partial_month',decision:'pending'});
  await assert.rejects(save({...payload,review_kind:'completeness',data_complete:null}),/check constraint/);
  await save({...payload,review_kind:'completeness',data_complete:true});
 });
 await t.test('retiro manual de vínculo requiere admin y motivo; audita sin eliminar la fila original',async()=>{
  await as(admin);await db.query("select public.portfolio_link_row($1,0,$2,'Salud',100,$3)",[premium,policy,version]);
  const unlink=(reason:string)=>db.query("select public.portfolio_unlink_row($1,0,$2,'Salud',$3)",[premium,version,reason]);
  await assert.rejects(unlink(''),/motivo del retiro/);await as(exec);await assert.rejects(unlink('Error de asociación'),/Administrador/);
  await as(admin);await unlink('Error de asociación revisado');
  assert.equal((await db.query('select * from public.portfolio_row_links')).rows.length,0);
  assert.equal((await db.query<any>('select row_count from public.portfolio_dataset_versions where id=$1',[premium])).rows[0].row_count,1);
  const audit=(await db.query<any>("select * from public.portfolio_audit where action='UNLINK'")).rows;assert.equal(audit.length,1);assert.equal(audit[0].before_value.allocation_percent,100);assert.equal(audit[0].actor_id,admin);
 });
 }finally{await db.close();}
});
