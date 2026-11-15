import {Router} from 'express';
import ExcelJS from 'exceljs';
import type {NarrativeKind,CompanyNarrative} from '../../shared/companyNarrative.js';
import type {PremiumRow,ExpenseRow} from './types.js';
import {getClient,getRows} from './storage.js';
import {buildExpenseExport} from './expenseExport.js';
import {companyNarrative,CompanyNarrativeService} from './companyNarrative.js';
import {HttpError} from './supabase.js';
export async function narrativeWorkbook(analyses:CompanyNarrative[],expenses:ExpenseRow[],client:string,periods:string,coverages:string){
 const book=new ExcelJS.Workbook();
 try{if(expenses.length)await book.xlsx.load(await buildExpenseExport(expenses,client,periods,coverages));}catch(e){if(!(e instanceof HttpError)||e.status!==404)throw e;}
 for(const [index,a] of analyses.entries()){
  const sheet=book.addWorksheet(a.kind==='monthly'?'Análisis mensual':'Conclusiones ejecutivas');Object.assign(sheet,{orderNo:-2+index});sheet.columns=[{width:45},{width:85},{width:22},{width:35}];
  sheet.addRow(['Identificador aprobado',a.id]);sheet.addRow(['Origen',a.source==='gemini'?`Gemini · ${a.model}`:'Determinístico']);sheet.addRow(['Períodos',a.periods.join(', ')]);
  sheet.addRow(['Tres conclusiones']);for(const line of a.conclusion)sheet.addRow([line]);
  sheet.addRow(['Proyección de renovación',a.projection.available?'Escenario técnico al 75 %':'Proyección no disponible']);sheet.addRow(['Prima del período UF',a.projection.currentPremiumUf]);sheet.addRow(['Prima del escenario UF',a.projection.projectedPremiumUf]);sheet.addRow(['Variación UF',a.projection.variationUf??null]);sheet.addRow(['Variación %',a.projection.variationPercent]);sheet.addRow(['Supuestos',a.projection.reason]);
  sheet.addRow(['Tres acciones']);for(const action of a.actions)sheet.addRow([action.title,action.measure,action.deadline,action.evidenceId]);
  sheet.addRow(['Indicador','Valor','Unidad','Referencia']);for(const m of a.metrics)sheet.addRow([m.label,m.value,m.unit,m.reference]);
  sheet.addRow(['Alcance']);for(const line of a.limitations)sheet.addRow([line]);sheet.eachRow(r=>r.eachCell(c=>c.alignment={vertical:'top',wrapText:true}));sheet.getRow(1).font={bold:true};
 }
 return book.xlsx.writeBuffer();
}
export function companyNarrativeRouter(service=new CompanyNarrativeService()){
 const router=Router();
 const handle=async(req:any,res:any,next:any)=>{try{
  const client=String(req.query.client??''),allowed=await getClient(res.locals.auth.db,client);
  const periods=String(req.query.periods??''),coverages=String(req.query.coverages??'');
  const [premiums,expenses]=await Promise.all([getRows<PremiumRow>(res.locals.auth.db,allowed.id,'primas'),getRows<ExpenseRow>(res.locals.auth.db,allowed.id,'gastos')]);
  if(req.params.kind==='export'){
   const values=[];
   for(const kind of ['conclusions'] as const){const approved=req.query[kind+'Approved'];if(typeof approved!=='string')throw new HttpError(400,'Falta el análisis aprobado para exportar.');values.push((await service.resolve(res.locals.auth.profile.id,companyNarrative(premiums,expenses,client,periods,coverages,kind,allowed.id),false,approved)).analysis);}
   res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="noergon-analisis.xlsx"');res.send(Buffer.from(await narrativeWorkbook(values,expenses,client,periods,coverages)));return;
  }
  if(!['monthly','conclusions'].includes(req.params.kind))throw new HttpError(404,'Análisis no disponible.');
  const approved=typeof req.query.approvedId==='string'?req.query.approvedId:undefined;
  res.json(await service.resolve(res.locals.auth.profile.id,companyNarrative(premiums,expenses,client,periods,coverages,req.params.kind as NarrativeKind,allowed.id),req.method==='POST',approved));
 }catch(e){next(e);}};
 router.get('/:kind',handle);router.post('/:kind',handle);return router;
}
