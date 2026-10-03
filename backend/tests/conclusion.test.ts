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
test('meses 1 a 9 no usan 75% ni recomiendan tarifas, incluso con siniestralidad alta',()=>{
 for(let n=1;n<10;n++) {const r=conclusion(n,120);assert.equal(r.sections.length,5);assert.doesNotMatch(JSON.stringify(r),/75%|cambio de precio|ajuste de precio|mantener precios/);}
});
test('mes 10: bajo, cercano y sobre equilibrio; incluye fronteras de banda',()=>{
 for(const [spend,match] of [[60,/bajo la referencia/],[73,/cercana/],[75,/cercana/],[77,/cercana/],[78,/por sobre/]] as const){const r=conclusion(10,spend);assert.equal(r.month,10);assert.equal(r.sections.length,6);assert.match(r.sections[5].text,match);}
 assert.equal(conclusion(12).sections.length,6);
});
test('no aplica equilibrio a meses parciales, huecos, coberturas aisladas o prima cero',()=>{
 const p=premiums(10);
 for(const [rows,selected,coverage] of [
  [p,periods(10).slice(1),'Consolidado S+D+C'],
  [p,periods(10).filter(x=>x!=='2025-04'),'Consolidado S+D+C'],
  [p,periods(10),'Salud'],
  [p.map(r=>({...r,premiumUf:0})),periods(10),'Consolidado S+D+C'],
  [p.filter(r=>r.coverage!=='Catastrófico'),periods(10),'Consolidado S+D+C'],
  [p.filter(r=>!(r.coverage==='Dental' && r.period==='2025-04')),periods(10),'Consolidado S+D+C'],
 ] as const) {const r=buildConclusion([...rows],[],'A',coverage,[...selected].join(','));assert.equal(r.sections.length,5);assert.doesNotMatch(JSON.stringify(r),/75%/);}
 assert.equal(buildConclusion([],[],'A','Salud','2025-10').month,null);
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
 assert.doesNotMatch(JSON.stringify(r),/75%/);
});
test('identificadores ausentes no se interpretan como un prestador o asegurado concentrado',()=>{
 const e:ExpenseRow={clientName:'A',period:'2025-01',coverage:'Salud',reembolsoUf:100,descCober:'CONSULTAS',provider:'(Sin prestador)',insuredRut:'(Sin rut)',patientRut:'',relation:'',isapre:'',valPrest:0,valBonif:0,mtoReclam:0};
 const r=buildConclusion(premiums(1),[e],'A','Consolidado S+D+C','2025-01');
 assert.match(r.sections[2].text,/Sin identificación suficiente de asegurados/);
 assert.match(r.sections[2].text,/Sin identificación suficiente de prestadores/);
});
