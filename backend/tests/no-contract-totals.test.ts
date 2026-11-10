import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sanitizeFunctionalContract,isAggregatePremiumLabel,isExcludedContractCandidate} from '../../shared/contractPolicy.mjs';
import {validateContract} from '../src/contracts.js';
import {incorporateConditions} from '../../frontend/src/lib/contractCandidates.js';
import {extractCandidates} from '../src/policyPdf.js';
import type {ContractCandidate,PolicyContract} from '../../shared/portfolio.js';
const base={number:'Prueba',insurer:'Prueba',startsOn:'',endsOn:'',currency:'UF',periodicity:'monthly',commission:'',commissionBasis:'',broker:'',kam:'',status:'active',cancellationDate:'',coverages:[],evidence:{}} as PolicyContract;
const candidate:ContractCandidate={id:'s',coverage:'Vida',plan:'Plan',groups:[],benefit:'Fallecimiento',kind:'rate',value:'0,1',unit:'‰',scope:'persona',period:'',page:1,quote:'Fallecimiento: 0,1 por mil',warnings:[],notes:[],alternatives:[],eligibility:'benefit'};
test('ningún total o subtotal declarado se extrae aunque sea explícito y correcto',()=>{
 for(const text of ['Prima total: 100 UF','Prima total anual: 100 UF','Prima total contractual: 100 UF','Prima individual: 1 UF\nPrima Total: 100 UF'])
 assert.ok(!extractCandidates([{page:1,method:'text',text}]).some(f=>f.key==='premium'));
 for(const label of ['Prima Total','Subtotal','Total primas','Prima neta total','Primas agregadas','Total por titular','Prima mensual total','Prima por titular subtotal'])assert.equal(isAggregatePremiumLabel(label),true,label);
 assert.equal(isAggregatePremiumLabel('Invalidez Total y Permanente'),false);
});
test('modelo funcional, nueva versión y evidencia omiten valores totales heredados sin tocar el original',()=>{
 const historic={...base,premium:'99999',totalPremium:'88888',evidence:{premium:{documentId:'d',page:1,quote:'Prima total: 99999'}}};
 const result=validateContract(historic);
 assert.equal(Object.hasOwn(result,'premium'),false);assert.equal(Object.hasOwn(result,'totalPremium'),false);assert.deepEqual(result.evidence,{});assert.equal(historic.premium,'99999');
});
test('filtra filas agregadas en datos antiguos, importación y payload malicioso; conserva tarifas y Vida',()=>{
 const totals=['Prima Total','Subtotal','Total neto'].map((benefit,i)=>({...candidate,id:String(i),benefit}));
 const falseLabel={...candidate,id:'hidden',tariff:{subtotal:true}} as unknown as ContractCandidate;
 const next=incorporateConditions({...base,premium:'100'} as any,[...totals,falseLabel,candidate],'doc');
 assert.equal(Object.hasOwn(next,'premium'),false);assert.equal(next.coverages[0].plans[0].terms.length,1);
 const term=next.coverages[0].plans[0].terms[0];
 const historic={...next,coverages:[{...next.coverages[0],plans:[{...next.coverages[0].plans[0],terms:[term,{...term,id:'total',label:'Prima Total',value:'9999'}]}]}]};
 assert.equal(sanitizeFunctionalContract(historic).coverages[0].plans[0].terms.length,1);
 assert.equal(isExcludedContractCandidate({tariff:{category:'Total familiar'}}),true);
});
test('reportes por empresa/póliza/cobertura/período y Excel coinciden con la captura previa',async()=>{
 const result=await promisify(execFile)(process.execPath,['--import','tsx','tests/reportingContractIsolation.mjs'],{cwd:new URL('..',import.meta.url),maxBuffer:1024*1024});assert.match(result.stdout,/idénticos/);
});
test('API adapta únicamente el placeholder vacío para RPC y no transmite ningún total nuevo',async()=>{
 const {createApp}=await import('../src/app.js');let captured:any;
 const app=createApp(async()=>({db:{rpc:async(_name:string,payload:any)=>{captured=payload;return {data:'00000000-0000-4000-8000-000000000001',error:null};}} as any,profile:{id:'00000000-0000-4000-8000-000000000001',email:'a@test.test',full_name:'Admin',role:'admin',active:true}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
 try{
 const {port}=server.address() as {port:number};
 const response=await fetch(`http://127.0.0.1:${port}/portfolio/manage/clients/00000000-0000-4000-8000-000000000002/policies`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({contract:{...base,premium:'12345',totalPremium:'54321'},validationStatus:'draft',expectedRevision:0,changeType:'initial',effectiveOn:'2026-01-01',note:'',policyId:null})});
 assert.equal(response.status,200);assert.equal(captured.payload.premium,'');assert.ok(!JSON.stringify(captured).includes('12345'));assert.ok(!Object.hasOwn(captured.payload,'totalPremium'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
