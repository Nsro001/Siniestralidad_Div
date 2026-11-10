import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gridTables,bboxWords,tsvWords,pgmPixels} from '../src/policyTableGeometry.js';
import {extractContractConditions} from '../src/policyConditions.js';
import {validateContract} from '../src/contracts.js';
import type {DocumentCell,DocumentTable,PageText} from '../../shared/portfolio.js';
const cell=(row:number,column:number,text:string,rowSpan=1):DocumentCell=>({id:`r${row}c${column}`,row,column,text,rowSpan,columnSpan:1,quote:text,region:{x:column*.2,y:row*.1,width:.2,height:rowSpan*.1}});
function table(cells:DocumentCell[],id='t1'):DocumentTable{return {id,page:1,cells,headers:cells.filter(c=>c.row===0).map(c=>c.text),notes:['(*) Tope conjunto por grupo familiar.'],region:{x:0,y:0,width:1,height:1},method:'grid',context:'Cuadro de Condiciones Plan de Reembolsos MODTEST'};}
const header=[cell(0,0,'Cobertura'),cell(0,1,'Porcentaje Reembolso'),cell(0,2,'Tope Prestación UF'),cell(0,3,'Tope anual cobertura UF')];
const page=(tables:DocumentTable[],text='Consulta   80%   1 UF\nExamen   60%   2 UF'):PageText=>({page:1,method:'text',text,benefitTables:tables});
test('tablas: distribuye celdas combinadas, conserva notas, vacío no significa cero',()=>{
 const p=page([table([...header,cell(1,0,'Consulta'),cell(1,1,'80%'),cell(1,2,''),cell(1,3,'10 UF',2),cell(2,0,'Examen'),cell(2,1,'60%'),cell(2,2,'2 UF')])]);
 const conditions=extractContractConditions([p]);
 assert.equal(conditions.filter(c=>c.kind==='limit'&&c.period==='año').length,2);
 assert.equal(conditions.filter(c=>c.value==='0').length,0);
 assert.ok(conditions.find(c=>c.value==='10 UF')?.warnings.some(w=>w.includes('compartida')));
 assert.ok(conditions.every(c=>c.notes.includes('(*) Tope conjunto por grupo familiar.')));
});
test('tope por evento bajo encabezado anual se conserva y queda advertido',()=>{
 const p=page([table([...header,cell(1,0,'Consulta'),cell(1,1,'80%'),cell(1,3,'50 UF por Evento')])]);
 const c=extractContractConditions([p]).find(c=>c.kind==='limit')!;
 assert.equal(c.period,'evento');assert.equal(c.value,'50 UF por Evento');assert.ok(c.warnings.some(w=>w.includes('periodicidad')));
});
test('no promueve tablas de exclusiones ni condiciones generales a beneficio',()=>{
 const t=table([...header,cell(1,0,'Consulta'),cell(1,1,'80%')]);t.context='CONDICIONES GENERALES\nEXCLUSIONES\nEjemplo de prestación no cubierta';
 const conditions=extractContractConditions([page([t])]);assert.ok(conditions.length);assert.ok(conditions.every(c=>c.eligibility==='reference'));
});
test('valores contradictorios conservan ambas alternativas sin mezclar planes',()=>{
 const a=table([...header,cell(1,0,'Consulta'),cell(1,1,'80%')],'a'),b=table([...header,cell(1,0,'Consulta'),cell(1,1,'70%')],'b');
 const conditions=extractContractConditions([page([a,b])]);assert.deepEqual(conditions[0].alternatives,['80%','70%']);
 b.context='Plan de Reembolsos MODOTHER';const different=extractContractConditions([page([a,b])]);assert.equal(different[0].alternatives.length,0);
});
test('no confunde reembolso GES con deducible ni tasa por mil con porcentaje',()=>{
 const p=page([table([...header,cell(1,0,'Deducible GES / CAEC'),cell(1,1,'100%')])]);
 assert.equal(extractContractConditions([p])[0].kind,'reimbursement');
 const t=table([cell(0,0,'Cobertura'),cell(0,1,'Capital Asegurado (UF)'),cell(0,2,'Tasa %o'),cell(1,0,'Fallecimiento'),cell(1,1,'200'),cell(1,2,'0,1447')]);t.context='COBERTURA Y TASAS';
 assert.equal(extractContractConditions([page([t])]).find(c=>c.kind==='rate')?.unit,'‰');
});
test('parser geométrico reconstruye una celda vertical combinada y coordenadas',()=>{
 const width=240,height=140,pixels=Buffer.alloc(width*height,255);
 const h=(y:number,l:number,r:number)=>{for(let x=l;x<=r;x++)pixels[y*width+x]=0;};
 const v=(x:number,t:number,b:number)=>{for(let y=t;y<=b;y++)pixels[y*width+x]=0;};
 for(const y of [10,40,100])h(y,10,230);h(70,10,150);for(const x of [10,80,150,230])v(x,10,100);
 const raster=Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`),pixels]);
 const tables=gridTables(raster,[{text:'10UF',x:.7,y:.4,width:.1,height:.1}],'Tope anual   10UF',1);
 assert.equal(tables.length,1);assert.ok(tables[0].cells.some(c=>c.rowSpan===2&&c.text==='10UF'));
 assert.throws(()=>pgmPixels(Buffer.from('P5\n999999 999999\n255\n')),/límites/);
});
test('bbox XML y TSV OCR conservan palabras, entidades y coordenadas normalizadas',()=>{
 const w=bboxWords('<page width="100" height="200"><word xMin="10" yMin="20" xMax="30" yMax="40">UF &amp; %</word></page>');assert.equal(w[0].text,'UF & %');assert.equal(w[0].x,.1);
 const t=tsvWords('level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t100\t200\t-1\t\n5\t1\t1\t1\t1\t1\t10\t20\t20\t20\t90\t80%');assert.equal(t[0].text,'80%');assert.equal(t[0].y,.1);
});
