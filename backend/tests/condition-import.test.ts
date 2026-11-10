import {test} from 'node:test';
import assert from 'node:assert/strict';
import {incorporateConditions} from '../../frontend/src/lib/contractCandidates.js';
import {validateEvidence} from '../src/contracts.js';
import type {ContractCandidate,PolicyContract} from '../../shared/portfolio.js';
const source:ContractCandidate={id:'s',page:2,coverage:'Salud',plan:'Plan de prueba',groups:['Grupo 1'],benefit:'Consulta',kind:'reimbursement',value:'88%',unit:'%',scope:'beneficiario',period:'',quote:'Consulta: 88%',notes:['Nota de prueba'],warnings:['Ambigüedad'],alternatives:['88%','77%'],eligibility:'benefit'};
const base={coverages:[],evidence:{}} as unknown as PolicyContract;
test('importación masiva conserva evidencia y ambigüedades, es idempotente y no pisa correcciones',()=>{
 const first=incorporateConditions(base,[source],'00000000-0000-4000-8000-000000000001');
 const term=first.coverages[0].plans[0].terms[0];assert.equal(term.reviewStatus,'pending');assert.deepEqual(term.alternatives,['88%','77%']);assert.equal(term.evidence?.page,2);
 term.value='corregido';const second=incorporateConditions(first,[source],'00000000-0000-4000-8000-000000000001');assert.equal(second.coverages[0].plans[0].terms.length,1);assert.equal(second.coverages[0].plans[0].terms[0].value,'corregido');
 assert.equal(base.coverages.length,0);
});
test('referencias y asociaciones incompletas no se incorporan como beneficios',()=>{
 assert.equal(incorporateConditions(base,[{...source,eligibility:'reference'},{...source,coverage:null},{...source,plan:''}],'doc').coverages.length,0);
});
test('valida regiones de evidencia y rechaza coordenadas externas o no finitas',()=>{
 const e={documentId:'00000000-0000-4000-8000-000000000001',page:1,quote:'Respaldo documental'};
 assert.equal(validateEvidence({...e,region:{x:.1,y:.1,width:.5,height:.1}}),true);
 assert.equal(validateEvidence({...e,region:{x:.9,y:.1,width:.5,height:.1}}),false);
 assert.equal(validateEvidence({...e,region:{x:NaN,y:.1,width:.5,height:.1}}),false);
});

test('API permite borrador y bloquea confirmación mientras existe una condición pendiente',async()=>{
 const {createApp}=await import('../src/app.js');
 let calls=0;
 const db={rpc:async()=>{calls++;return {data:'00000000-0000-4000-8000-000000000002',error:null};}} as any;
 const app=createApp(async()=>({db,profile:{id:'00000000-0000-4000-8000-000000000001',email:'admin@example.test',full_name:'Admin',role:'admin',active:true}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
 const address=server.address() as {port:number};
 const contract=incorporateConditions({number:'synthetic',insurer:'Prueba',startsOn:'',endsOn:'',currency:'UF',premium:'',periodicity:'monthly',commission:'',commissionBasis:'',broker:'',kam:'',status:'active',cancellationDate:'',coverages:[],evidence:{}},[source],'00000000-0000-4000-8000-000000000001');
 const body={policyId:null,expectedRevision:0,changeType:'initial',effectiveOn:'2026-01-01',note:'',contract,validationStatus:'validated'};
 const send=()=>fetch(`http://127.0.0.1:${address.port}/portfolio/manage/clients/00000000-0000-4000-8000-000000000003/policies`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{assert.equal((await send()).status,400);assert.equal(calls,0);body.validationStatus='draft';assert.equal((await send()).status,200);assert.equal(calls,1);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('conflictos entre documentos del mismo alcance conservan las alternativas y exigen revisión',()=>{
 const first=incorporateConditions(base,[{...source,warnings:[],alternatives:[]}],'documento-a');
 const second=incorporateConditions(first,[{...source,value:'77%',warnings:[],alternatives:[]}],'documento-b');
 const terms=second.coverages[0].plans[0].terms;
 assert.equal(terms.length,2);assert.ok(terms.every(t=>t.reviewStatus==='pending'));assert.ok(terms.every(t=>t.alternatives?.includes('88%')&&t.alternatives.includes('77%')));
});
test('marcar dos alternativas como revisadas no confirma un contrato contradictorio',async()=>{
 const {assertContractReviewComplete}=await import('../src/contracts.js');
 const a=incorporateConditions(base,[{...source,warnings:[],alternatives:[]}],'a');
 const b=incorporateConditions(a,[{...source,value:'77%',warnings:[],alternatives:[]}],'b');
 for(const t of b.coverages[0].plans[0].terms)t.reviewStatus='reviewed';
 assert.throws(()=>assertContractReviewComplete(b),/contradictorias/);
 b.coverages[0].plans[0].terms.pop();assert.doesNotThrow(()=>assertContractReviewComplete(b));
});
