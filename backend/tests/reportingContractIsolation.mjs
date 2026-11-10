// Capturar antes del ajuste; comparar después con exactamente los mismos datos sintéticos.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildPrimasReport,buildGastosReport,buildFilters,buildInsuredEvolution} from '../src/report.ts';
import {buildConclusion} from '../src/conclusion.ts';
import {buildMonthlyDetail} from '../src/monthly.ts';
import {buildExpenseExport} from '../src/expenseExport.ts';
import {resolvePolicyScope} from '../src/policyScope.ts';
import {buildPolicyIndicators} from '../src/technicalIndicators.ts';
import {buildRenewalScenarios} from '../src/renewalScenarios.ts';
import {fixture} from './helpers/analysisFixture.ts';
const p=[];const e=[];
for(const clientName of ['Empresa sintética A','Empresa sintética B'])for(const period of ['2025-01','2025-02','2026-01','2026-02'])for(const [index,coverage] of ['Salud','Dental','Catastrófico','Vida'].entries()){
 p.push({clientName,period,coverage,policy:'P-TEST',premiumUf:100+index*10,spendUf:50+index,holders:10,dependents:4});
 e.push({clientName,period,coverage,policy:'P-TEST',descCober:index%2?'HOSPITALIZACIÓN':'CONSULTAS',prestation:'Prestación sintética',reembolsoUf:50+index,provider:'Prestador sintético',insuredRut:'11111111-1',patientRut:'11111111-1',relation:'T',isapre:'Prueba',valPrest:1000,valBonif:400,mtoReclam:600});
}
const outputs={};
for(const client of ['Empresa sintética A','Empresa sintética B'])for(const coverage of ['Salud','Dental','Catastrófico','Vida','Consolidado S+D+C'])for(const periods of ['2026-01','2026-01,2026-02']){
 const key=[client,coverage,periods].join('|');outputs[key]={primas:buildPrimasReport(structuredClone(p),client,coverage,periods),gastos:buildGastosReport(structuredClone(e),client,coverage,periods),conclusion:buildConclusion(structuredClone(p),structuredClone(e),client,coverage,periods),monthly:buildMonthlyDetail(structuredClone(p),structuredClone(e),client,coverage,'2026-02')};
}
outputs.filters=buildFilters(p,e);outputs.insured=buildInsuredEvolution(p,'Empresa sintética A','2026-01,2026-02');
const input=fixture();outputs.scope=resolvePolicyScope(structuredClone(input));outputs.indicators=buildPolicyIndicators(structuredClone(input));outputs.scenarios=buildRenewalScenarios(structuredClone(input),[]);
const book=new ExcelJS.Workbook();await book.xlsx.load(await buildExpenseExport(e,'Empresa sintética A','2026-01,2026-02','Consolidado S+D+C'));
outputs.excel=book.worksheets.map(s=>({name:s.name,columns:s.columns.map(c=>({key:c.key,width:c.width})),rows:s.getSheetValues(),merges:s.model.merges,views:s.views,pageSetup:s.pageSetup,styles:s.getRows(1,s.rowCount)?.map(r=>r.model)}));
const protectedFiles=['src/report.ts','src/conclusion.ts','src/monthly.ts','src/expenseExport.ts','src/technicalIndicators.ts','src/policyScope.ts','src/policyScopeRoute.ts','src/renewalScenarios.ts','src/storage.ts','src/portfolio.ts','src/app.ts','../frontend/src/components/ReportPresentation.tsx','../frontend/src/components/ReportCover.tsx','../frontend/src/components/ExecutiveSummary.tsx','../frontend/src/components/PrimasCharts.tsx'];
outputs.sourceHashes=Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')])));
const serialized=JSON.stringify(outputs);const path=new URL('./fixtures/reporting-before-no-contract-premium.json',import.meta.url);
if(process.argv.includes('--capture')){await writeFile(path,serialized+'\n');console.log('Referencia previa capturada: 20 alcances, indicadores por póliza y Excel semántico.');}
else{assert.deepEqual(JSON.parse(serialized),JSON.parse(await readFile(path,'utf8')));console.log('Reporterías, indicadores y Excel semántico idénticos; fuentes/endpoints protegidos sin cambios.');}
