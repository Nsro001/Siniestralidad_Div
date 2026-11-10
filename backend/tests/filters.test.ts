import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getFilters} from '../src/storage.js';
test('filtros: clientes solo con gastos siguen consultables sin inventar primas o períodos de vigencia',async()=>{
 const clients=[{id:'a',name:'Con primas'},{id:'b',name:'Solo gastos'}];
 const datasets=[{client_id:'a',kind:'primas',periods:['2025-01'],coverages:['Salud']},{client_id:'a',kind:'gastos',periods:['2025-01','2025-02'],coverages:['Vida']},{client_id:'b',kind:'gastos',periods:['2025-03'],coverages:['Dental']}];
 const db={from(table:string){const query={select(){return query;},order(){return query;},async range(from:number,to:number){return{data:(table==='clients'?clients:datasets).slice(from,to+1),error:null};}};return query;}} as unknown as SupabaseClient;
 const filters=await getFilters(db);
 assert.deepEqual(filters.clients,['Con primas','Solo gastos']);
 assert.ok(filters.coveragesByClient['Solo gastos'].includes('Dental'));
 assert.deepEqual(filters.periodsByClient['Solo gastos'],['2025-03']);
 assert.deepEqual(filters.premiumPeriodsByClient['Solo gastos'],[]);
 assert.ok(!filters.coveragesByClient['Con primas'].includes('Vida'));
});
