// Valida archivos locales sin conectarse a Supabase ni publicar datos.
// En backend: node --import tsx scripts/validate-current-inputs.mjs primas.xlsx gastos.csv
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {parseUpload} from '../src/parser.ts';
import {normalizeRut} from '../src/contracts.ts';
import {saveRows} from '../src/storage.ts';
const [premiumPath,expensePath]=process.argv.slice(2);
if(!premiumPath||!expensePath)throw new Error('Indica ruta de primas y ruta de gastos. Los archivos se leen localmente.');
const premiums=await parseUpload(await readFile(premiumPath),'primas',basename(premiumPath));
const expenses=await parseUpload(await readFile(expensePath),'gastos',basename(expensePath));
for(const r of premiums)assert.ok(normalizeRut(r.clientRut??''),'Prima sin RUT completo válido');
for(const r of [...premiums,...expenses])assert.match(r.period,/^\d{4}-(0[1-9]|1[0-2])$/);
const summary=rows=>({rows:rows.length,clients:new Set(rows.map(r=>r.clientName)).size,periods:[...new Set(rows.map(r=>r.period))].sort(),totalUf:rows.reduce((sum,r)=>sum+(r.premiumUf??r.reembolsoUf??0),0)});
const db=new PGlite();
try {
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 for(const file of ['202609060001_accounts','202609170001_portfolio','202609230001_replace_dataset','202609290001_chunked_dataset_upload','202610010001_report_branding','202610160001_presentation_branding'])await db.exec(await readFile(new URL(`../../supabase/migrations/${file}.sql`,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/ADMINISTRACION_CARTERA_COMPLETO.sql',import.meta.url),'utf8'));
 const admin='00000000-0000-4000-8000-000000000001';
 await db.query("insert into auth.users values($1,'test@example.invalid','{}')",[admin]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
 const rpc={async rpc(name,args){
  const spec={begin_dataset_upload:['upload_id','dataset_kind','replace_all','expected_chunks','expected_rows'],append_dataset_upload_chunk:['upload_id','chunk_index','chunk_rows'],finish_dataset_upload:['upload_id']}[name];
  if(!spec)throw new Error('RPC inesperada');
  try{await db.query(`select public.${name}(${spec.map((key,i)=>`$${i+1}${key==='chunk_rows'?'::jsonb':''}`).join(',')})`,spec.map(key=>key==='chunk_rows'?JSON.stringify(args[key]):args[key]));return{error:null};}
  catch(error){console.error('Falló la validación SQL aislada:',error.code,error.message);return{error:{code:error.code}};}
 }};
 await saveRows(rpc,'primas',premiums,false);await saveRows(rpc,'gastos',expenses,false);
 const counts=(await db.query("select kind,sum(jsonb_array_length(rows))::integer rows from public.client_datasets group by kind order by kind")).rows;
 assert.equal(counts.find(c=>c.kind==='primas').rows,premiums.length);assert.equal(counts.find(c=>c.kind==='gastos').rows,expenses.length);
 const premiumNames=new Set(premiums.map(r=>r.clientName));
 const inferred=expenses.filter(r=>r.coverageInferred);
 console.log(JSON.stringify({primas:summary(premiums),gastos:summary(expenses),quality:{expensesOnlyClients:new Set(expenses.filter(r=>!premiumNames.has(r.clientName)).map(r=>r.clientName)).size,coverageNeedsReview:inferred.length,unrecognizedPlans:[...new Set(inferred.map(r=>r.sourcePlan))]},isolatedDatabase:{clients:(await db.query('select count(*)::integer n from public.clients')).rows[0].n,datasets:counts,preservedRows:true},externalDatabaseModified:false},null,2));
}finally{await db.close();}
