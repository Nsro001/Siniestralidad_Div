import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConclusion, validity } from '../src/conclusion.js';
import type { PremiumRow, ExpenseRow } from '../src/types.js';
const cov = ['Salud','Dental','Catastrófico'];
const periods = (n:number) => Array.from({length:n},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`);
const premiums = (n:number, spend=80): PremiumRow[] => periods(n).flatMap(period=>cov.map(coverage=>({clientName:'A',clientRut:undefined,period,coverage,premiumUf:100,spendUf:spend})));
const conclusion = (n:number,spend=80) => buildConclusion(premiums(n,spend),[],'A','Consolidado S+D+C',periods(n).join(','));
test('mes de vigencia usa calendario, aniversarios y selección histórica, no cantidad de registros',()=>{
 assert.equal(validity(['2024-11','2025-08'],['2025-08'])?.month,10);
 assert.equal(validity(['2024-11','2025-08','2025-11'],['2025-11'])?.month,1);
 assert.equal(validity(['2024-11','2025-08','2025-11'],['2025-08'])?.month,10);
 assert.equal(validity(['2024-11','2025-08','2025-11'],['2024-11','2025-11'])?.mixed,true);
 assert.equal(validity([],['2025-01']),null);
});
test('renovación calcula incremento, descuento y equilibrio para cualquier mes',()=>{
 for (const n of [1, 9, 10, 12]) {
  for (const [spend, expected] of [[92.6, /incremento técnico de 17,6%/], [68, /descuento técnico de 7%/], [75, /no se espera incremento ni descuento/]] as const) {
   assert.match(conclusion(n, spend).sections.at(-1)!.text, expected);
  }
 }
});
test('renovación usa el consolidado del cliente y exactamente los meses seleccionados',()=>{
 const p = premiums(3, 60).map(r => ({...r, spendUf: r.period === '2025-03' ? 100 : 60}));
 p.push(...premiums(3,999).map(r=>({...r,clientName:'B'})));
 p.push({...p[0],coverage:'Consolidado S+D+C',spendUf:9999});
 const r=buildConclusion(p,[],'A','Salud','2025-01,2025-03');
 assert.match(r.sections.at(-1)!.text,/incremento técnico de 5%/);
});
test('renovación no estima con prima cero o meses sin primas',()=>{
 for(const rows of [premiums(2).map(r=>({...r,premiumUf:0})),premiums(1)]) {
  const r=buildConclusion(rows,[],'A','Salud','2025-01,2025-02');
  assert.match(r.sections.at(-1)!.text,/No se puede calcular/);
 }
});
test('pondera prima y gasto sin duplicar consolidado; detecta tendencia y concentración sustentadas',()=>{
 const p=premiums(6).map(r=>({...r,spendUf:r.period<'2025-04'?20:90}));
 const e=(period:string,amount:number,extras:Partial<ExpenseRow>={}):ExpenseRow=>({clientName:'A',period,coverage:'Salud',reembolsoUf:amount,descCober:'CONSULTAS',provider:'Clínica A',insuredRut:'1-9',patientRut:'',relation:'T',isapre:'',valPrest:0,valBonif:0,mtoReclam:0,...extras});
 const expenses=periods(6).flatMap(m=>[e(m,100),e(m.replace('2025','2024'),50),e(m,999,{clientName:'B'}),e(m,999,{descCober:'PRESTACIONES SIN BONIFICACION (S)'})]);
 const r=buildConclusion(p,expenses,'A','Consolidado S+D+C,Salud,Dental,Catastrófico',periods(6).join(','));
 assert.match(r.sections[0].text,/55%/);
 assert.match(r.sections[1].text,/20% a 90%/);
 assert.match(r.sections[2].text,/Clínica A/);
 assert.match(r.sections[2].text,/100% mayor/);
 assert.match(r.sections[2].text,/asegurados identificados/);
 assert.match(r.sections[3].text,/Riesgo creciente/);
 assert.match(r.sections[4].text,/casos de mayor gasto/);
 assert.match(r.sections.at(-1)!.text,/descuento técnico de 20%/);
});
test('identificadores ausentes no se interpretan como un prestador o asegurado concentrado',()=>{
 const e:ExpenseRow={clientName:'A',period:'2025-01',coverage:'Salud',reembolsoUf:100,descCober:'CONSULTAS',provider:'(Sin prestador)',insuredRut:'(Sin rut)',patientRut:'',relation:'',isapre:'',valPrest:0,valBonif:0,mtoReclam:0};
 const r=buildConclusion(premiums(1),[e],'A','Consolidado S+D+C','2025-01');
 assert.match(r.sections[2].text,/Sin identificación suficiente de asegurados/);
 assert.match(r.sections[2].text,/Sin identificación suficiente de prestadores/);
});
