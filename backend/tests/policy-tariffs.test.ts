import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DocumentCell,DocumentTable,PageText,PolicyContract} from '../../shared/portfolio.js';
import {extractContractConditions} from '../src/policyConditions.js';
import {extractCandidates} from '../src/policyPdf.js';
import {extractionReview} from '../src/policyInterpretation.js';
import {validateContract} from '../src/contracts.js';
import {incorporateConditions} from '../../frontend/src/lib/contractCandidates.js';
const cell=(row:number,column:number,text:string):DocumentCell=>({id:`r${row}c${column}`,row,column,text,rowSpan:1,columnSpan:1,quote:text,region:{x:.1,y:.1,width:.1,height:.1}});
function input(headers:string[],rows:string[][],context:string):PageText{
 const cells=[...headers.map((s,i)=>cell(0,i,s)),...rows.flatMap((r,i)=>r.map((s,j)=>cell(i+1,j,s)))];
 const table:DocumentTable={id:'tariff',page:1,cells,headers,context,region:{x:0,y:0,width:1,height:1},method:'grid',notes:[],warnings:[]};
 return {page:1,method:'text',text:context+'\n'+headers.join('   ')+'\n'+rows.map(r=>r.join('   ')).join('\n'),benefitTables:[table]};
}
function blank():PolicyContract{return {number:'Prueba',insurer:'Aseguradora de prueba',startsOn:'',endsOn:'',premium:'',currency:'UF',periodicity:'monthly',commission:'',commissionBasis:'',broker:'',kam:'',status:'active',cancellationDate:'',coverages:[],evidence:{}};}
test('prima total ausente es válida: normaliza omisión/null sin inventar un importe',()=>{
 for(const premium of ['',undefined,null])assert.equal(Object.hasOwn(validateContract({...blank(),premium}),'premium'),false);
 assert.ok(!extractionReview([]).missing.includes('premium' as any));assert.equal(Object.hasOwn(extractionReview([]),'optionalAbsent'),false);
});
test('familias: primas netas, IVA y brutas no son deducibles ni prima total',()=>{
 const p=input(['Asegurados','Prima Afecta','IVA','Prima Bruta'],[['Titular Solo','1,1','0,1','1,2'],['Titular con 1 Carga','2,2','0,2','2,4'],['Titular con 2 o más Cargas','3,3','0,3','3,6']],'TARIFAS Y PRIMAS DEL SEGURO\nLas primas mensuales en UF, de este seguro según número de cargas, son las siguientes:');
 const all=extractContractConditions([p]);const cs=all.filter(c=>c.kind==='tariff');assert.equal(cs.length,9);
 assert.equal(cs[0].tariff?.concept,'family_premium');assert.equal(cs[0].tariff?.currency,'UF');assert.equal(cs[0].tariff?.periodicity,'mensual');assert.equal(cs[1].tariff?.concept,'tax');
 assert.ok(!all.some(c=>c.kind==='deductible'));assert.equal(blank().premium,'');
});
test('Vida: subtotales individuales se excluyen también si tienen dos puntos',()=>{
 const p=input(['Cobertura','Prima Neta','IVA','Prima Bruta'],[['Fallecimiento','0,1','0,01','0,11'],['Prima Total','0,2','0,02','0,22']],'Las primas mensuales en UF por cada Titular asegurado y cobertura contratada son las siguientes:');
 const cs=extractContractConditions([p]).filter(c=>c.kind==='tariff');assert.equal(cs.length,3);
 assert.ok(cs.every(c=>c.benefit==='Fallecimiento'));
 p.text+='\nPrima total: 0,22 UF';assert.ok(!extractCandidates([p]).some(f=>f.key==='premium'));
 const next=incorporateConditions(blank(),cs.map(c=>({...c,plan:'Plan Prueba'})),'00000000-0000-4000-8000-000000000001');assert.equal(Object.hasOwn(next,'premium'),false);assert.ok(next.coverages[0].plans[0].terms[0].tariff);
});
test('tasas: conserva porcentaje/por mil/base; ausencia de frecuencia o unidad exige revisión',()=>{
 for(const [header,unit] of [['Tasa %o','‰'],['Tasa %','%'],['Tasa Anual Neta','']]){
  const p=input(['Cobertura','Capital Asegurado (UF)',header],[['Fallecimiento','150','0,17']],'COBERTURA Y TASAS\nLa prima será calculada como el resultado del capital asegurado por la tasa.');
  const rate=extractContractConditions([p]).find(c=>c.kind==='rate')!;
  assert.equal(rate.tariff?.rateUnit,unit);assert.ok(rate.tariff?.calculationBasis.includes('capital asegurado'));
  if(unit==='')assert.ok(rate.warnings.some(w=>w.includes('Unidad de tasa')));
  if(header==='Tasa %o')assert.equal(rate.tariff?.periodicity,'');
 }
});
test('capital en UF y múltiplos de renta se conservan sin calcular ni convertir',()=>{
 const p=input(['Cobertura','Capital Asegurado'],[['Fallecimiento','24 veces la renta mensual'],['Invalidez Total','UF 500']],'COBERTURA Y TASAS');
 const cs=extractContractConditions([p]).filter(c=>c.kind==='capital');assert.equal(cs.length,2);
 assert.equal(cs[0].tariff?.capitalBasis,'salary_multiple');assert.equal(cs[0].tariff?.currency,'');assert.equal(cs[0].value,'24 veces la renta mensual');assert.equal(cs[0].tariff?.periodicity,'');
 assert.equal(cs[1].tariff?.currency,'UF');assert.equal(cs[1].value,'UF 500');
});
test('tramos de renta no se interpretan como moneda de las primas en UF',()=>{
 const p=input(['Tramo de Renta','$0 - $100.000','Mayor a $100.000'],[['Primas Afectas (UF)','0,5','0,6'],['IVA','0,1','0,2'],['Prima Bruta (UF)','0,6','0,8']],'Primas mensuales en UF\nPrimas Cargas Especiales Padres:');
 const cs=extractContractConditions([p]).filter(c=>c.kind==='tariff');assert.equal(cs.length,6);assert.ok(cs.every(c=>c.tariff?.currency==='UF'));assert.equal(cs[0].tariff?.incomeBand,'$0 - $100.000');
});
test('sin unidad, moneda o periodicidad no se heredan valores generales',()=>{
 const p=input(['Categoría','Prima'],[['Cónyuge','0,7']],'Tarifas');
 const c=extractContractConditions([p]).find(c=>c.kind==='tariff')!;assert.equal(c.tariff?.currency,'');assert.equal(c.tariff?.periodicity,'');assert.ok(c.warnings.length);
 const estimated:PageText={page:1,method:'text',text:'Prima total: 100.25 UF\nPrima total calculada con nómina pendiente.'};assert.ok(!extractCandidates([estimated]).some(f=>f.key==='premium'));
});
test('los motores usan primas observadas aunque el contrato contenga tarifas y un total distinto',async()=>{
 const {fixture}=await import('./helpers/analysisFixture.js');
 const {verifiedReviews}=await import('./helpers/technicalReviews.js');
 const {buildPolicyIndicators}=await import('../src/technicalIndicators.js');
 const input=fixture();const before=buildPolicyIndicators(input).monthly[0].current.premiumUf;
 input.versions[0].contract.premium='999999';
 const p=input.versions[0].contract.coverages[0].plans;
 p.push({id:'tariff-plan',name:'Tarifa',groups:[],terms:[{id:'tariff-term',label:'Prima por persona',value:'98765',unit:'UF',scope:'persona',period:'mensual'}]});
 input.reviews=verifiedReviews(input);
 assert.equal(before,100);assert.equal(buildPolicyIndicators(input).monthly[0].current.premiumUf,100);
});
test('reextraer enriquece una condición antigua sin sobrescribir correcciones del borrador',()=>{
 const p=input(['Cobertura','Capital Asegurado (UF)','Tasa %o'],[['Fallecimiento','150','0,17']],'COBERTURA Y TASAS');
 const c=extractContractConditions([p]).find(c=>c.kind==='rate')!;c.plan='Plan Vida';
 const old=incorporateConditions(blank(),[{...c,tariff:undefined}],'doc');old.coverages[0].plans[0].terms[0].value='corregido';
 const enriched=incorporateConditions(old,[c],'doc');assert.equal(enriched.coverages[0].plans[0].terms[0].value,'corregido');assert.equal(enriched.coverages[0].plans[0].terms[0].tariff?.rateUnit,'‰');
});
test('conserva unidades de tasa distintas de porcentaje o por mil sin convertirlas',()=>{
 const p=input(['Cobertura','Capital Asegurado (UF)','Tasa por diez mil'],[['Fallecimiento','150','2,3']],'COBERTURA Y TASAS');
 const c=extractContractConditions([p]).find(c=>c.kind==='rate')!;assert.equal(c.tariff?.rateUnit,'por diez mil');assert.equal(c.unit,'por diez mil');assert.equal(c.value,'2,3');
});
test('IVA/neto/bruto sin tarifa individual declarada no se incorporan como primas individuales',()=>{
 const p=input(['Cobertura','Prima Neta','IVA','Prima Bruta'],[['Salud','100','19','119']],'PRIMAS DECLARADAS');
 assert.equal(extractContractConditions([p]).filter(c=>c.kind==='tariff').length,0);
});
