import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { validateBranding } from '../src/branding.js';
test('logos: formato, tamaño y firma; admite eliminación explícita',()=>{
 assert.deepEqual(validateBranding({broker_name:' X ',broker_logo:null,client_logo:null}),{broker_name:'X',broker_logo:null,client_logo:null});
 for(const logo of ['https://example.com/x.png','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj', 'data:image/png;base64,'+'A'.repeat(700001)]) assert.throws(()=>validateBranding({broker_name:'X',broker_logo:logo,client_logo:null}));
 assert.throws(()=>validateBranding({broker_name:'X'}));
});
test('branding RLS: admin escribe, cliente asignado lee, ajenos e inactivos no acceden',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  for(const f of ['202609060001_accounts.sql','202609170001_portfolio.sql','202610010001_report_branding.sql','202610160001_presentation_branding.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${f}`,import.meta.url),'utf8'));
  const admin='00000000-0000-4000-8000-000000000001',exec='00000000-0000-4000-8000-000000000002';
  const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
  await db.query("insert into auth.users values ($1,'a','{}'),($2,'e','{}')",[admin,exec]);
  await db.query("update profiles set role='admin' where id=$1",[admin]);
  await db.query("insert into clients(id,name) values($1,'A'),($2,'B')",[a,b]);
  await db.query('insert into client_assignments values($1,$2)',[exec,a]);
  const asUser=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  await asUser(admin);await db.query("insert into report_branding(client_id,broker_name) values($1,'Uno'),($2,'Dos')",[a,b]);
  await asUser(exec);assert.equal((await db.query('select * from report_branding')).rows.length,1);
  assert.equal((await db.query("update report_branding set broker_name='Ataque' returning *")).rows.length,0);
  assert.equal((await db.query('delete from report_branding returning *')).rows.length,0);
  await assert.rejects(db.query('insert into report_branding(client_id) values($1)',[b]),/row-level security/);
  await asUser(admin);assert.equal((await db.query('select * from report_branding')).rows.length,2);
  await db.exec('reset role');await db.query('update profiles set active=false where id=$1',[exec]);
  await asUser(exec);assert.equal((await db.query('select * from report_branding')).rows.length,0);
  await db.exec('set role anon');await assert.rejects(db.query('select * from report_branding'),/permission denied/);
 } finally {await db.close();}
});

test('logos interiores: dimensiones verificadas en servidor y MIME coherente',()=>{
 const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(100,16);b.writeUInt32BE(50,20);
 const body={broker_name:'',broker_logo:null,client_logo:null,interior_logo:'data:image/png;base64,'+b.toString('base64')};
 assert.equal(validateBranding(body).interior_logo,body.interior_logo);
 b.writeUInt32BE(4097,16);assert.throws(()=>validateBranding({...body,interior_logo:'data:image/png;base64,'+b.toString('base64')}));
 assert.throws(()=>validateBranding({...body,interior_logo:body.interior_logo.replace('image/png','image/webp')}));
 const w=Buffer.alloc(30);w.write('RIFF');w.write('WEBP',8);w.write('VP8X',12);w.writeUIntLE(99,24,3);w.writeUIntLE(49,27,3);
 assert.ok(validateBranding({...body,interior_logo:'data:image/webp;base64,'+w.toString('base64')}));
});
