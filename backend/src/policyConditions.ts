import { isExcludedContractCandidate } from "../../shared/contractPolicy.mjs";
import type { ContractCandidate, CoverageType, DocumentCell, DocumentTable, PageText } from '../../shared/portfolio.js';
import { extractTariffs } from "./policyTariffs.js";
import { sourceQuote } from './policyTableGeometry.js';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const fold=(s:string)=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
type Role={kind:ContractCandidate['kind']|'label'|'scope';unit:string;period:string};
function role(text:string):Role|null {
  const s=fold(text);
  if(/(?:porcentaje|%)\s*(?:de )?reembolso/.test(s))return {kind:'reimbursement',unit:'%',period:''};
  if(/tope|limite/.test(s))return {kind:/tipo tope/.test(s)?'scope':'limit',unit:/uf/.test(s)?'UF':'',period:/anual/.test(s)?'año':/diario/.test(s)?'día':/prestacion/.test(s)?'prestación':''};
  if(/capital (?:asegurado|fijo)/.test(s))return {kind:'capital',unit:/uf/.test(s)?'UF':'',period:''};
  if(/^tasa/.test(s))return {kind:'rate',unit:/%o|‰/.test(s)?'‰':/%/.test(s)?'%':'',period:/anual/.test(s)?'año':''};
  if(/registro cmf/.test(s))return {kind:'cmf',unit:'',period:''};
  if(/edad|^(?:ingreso|permanencia)$/.test(s))return {kind:'age',unit:'años',period:/permanencia/.test(s)?'permanencia':/maxima|maximo/.test(s)?'ingreso máximo':'ingreso'};
  if(/^(?:cobertura(?:s)?(?: vida)?|prestacion(?:es)?|beneficio(?:s)?.*|asegurado)$/.test(s))return {kind:'label',unit:'',period:''};
  return null;
}
function contextFor(table:DocumentTable,prior:{coverage:CoverageType|null;plan:string;groups:string[]}) {
  const ctx=table.context??'';
  let coverage=prior.coverage,plan=prior.plan;
  const titles=[...ctx.matchAll(/(?:condiciones plan (?:salud|dental)|plan cargas especiales[^\n]*|plan de beneficios para prestadores preferentes[^\n]*|(?:plan de reembolsos?|dental)\s+(?:DEN|MOD|VCV)[A-Z0-9]+|\b(?:MOD|DEN|VCV)[A-Z0-9]{3,})/gi)];
  const title=titles.at(-1)?.[0];
  if(title) {
    plan=clean(title);
    if(/dental|DEN/i.test(title))coverage='Dental';else if(/VCV/i.test(title))coverage='Vida';else coverage='Salud';
  }
  if(table.headers.some(h=>/capital|tasa/i.test(h))&&table.cells.some(c=>/fallecimiento/i.test(c.text))){coverage='Vida'; if(!/VCV/i.test(plan))plan='Coberturas Vida';}
  const groups=[...ctx.matchAll(/(?:[•·]\s*)?(Grupo\s+[^\n]+)/gi)].map(m=>clean(m[1])).filter(g=>g.length<140&&!/familiar|asegurado|beneficiario|plan general/i.test(g));
  return {coverage,plan,groups:groups.length?[...new Set(groups)]:plan===prior.plan?prior.groups:[]};
}
const intersects=(a:DocumentCell,b:DocumentCell)=>a.row < b.row+b.rowSpan&&b.row<a.row+a.rowSpan;
function tableCandidates(page:PageText, table:DocumentTable,context:ReturnType<typeof contextFor>):ContractCandidate[] {
  const total=table.cells.length<=6?table.cells.find(c=>/^tope anual cobertura en UF/i.test(clean(c.text))):undefined;
  if(total){
    const values=table.cells.filter(c=>c.row===total.row&&c.column>total.column&&/\d/.test(c.text));
    return values.map(cell=>({id:`${table.id}:${cell.id}`,coverage:context.coverage,plan:context.plan,groups:context.groups,benefit:clean(total.text),kind:'limit',value:clean(cell.text),unit:'UF',scope:'',period:'año',page:page.page,quote:sourceQuote(page.text,cell.text,total.text),region:cell.region,tableId:table.id,cellId:cell.id,notes:table.notes,warnings:table.cells.some(c=>/^UF$/i.test(clean(c.text)))?['Existe una modalidad sin valor numérico: revisar convenio y libre elección; no asumir el mismo tope.']:[],alternatives:[],eligibility:'restriction'}));
  }
  const labeled=table.cells.find(c=>c.row<=2&&role(c.text)?.kind==='label');
  const headerEnd=labeled?labeled.row+labeled.rowSpan:1;
  const headers=table.cells.filter(c=>c.row<headerEnd&&c.columnSpan===1&&role(c.text));
  const valueHeaders=headers.filter(c=>!['label','scope'].includes(role(c.text)!.kind));
  if(!valueHeaders.length)return [];
  const minValueColumn=Math.min(...valueHeaders.map(c=>c.column));
  const labelColumn=labeled?.column??Math.max(0,minValueColumn-1);
  if(!labeled&&labelColumn===minValueColumn)return [];
  const dataStart=headerEnd;
  const labels=table.cells.filter(c=>c.column===labelColumn&&c.row>=dataStart&&clean(c.text));
  const out:ContractCandidate[]=[];
  for(const label of labels){
    const benefit=clean(label.text);
    const category=table.cells.find(c=>c.column<labelColumn&&intersects(c,label)&&c.text)?.text??(/beneficio/i.test(labeled?.text??'')?labeled!.text:'');
    for(const h of valueHeaders){
      const r=role(h.text)!;
      const values=table.cells.filter(c=>c.column===h.column&&c.row>=dataStart&&intersects(c,label)&&clean(c.text));
      for(const cell of values){
        const value=clean(cell.text);const scopeCell=table.cells.find(c=>headers.some(h=>role(h.text)?.kind==='scope'&&h.column===c.column)&&intersects(c,label)&&c.row>=dataStart);
        let scope=/familiar/i.test(value)?'grupo familiar':/personal|beneficiario/i.test(scopeCell?.text??'')?'beneficiario':'';
        if(!scope&&/beneficiario|asegurado/i.test(h.text))scope=/beneficiario/i.test(h.text)?'beneficiario':'asegurado';
        let period=r.period;
        if(r.kind!=='age') {if(/evento/i.test(value))period='evento';else if(/anual|año/i.test(value))period='año';}
        if(r.kind==='reimbursement'&&/convenio|libre eleccion/i.test(h.text))scope=clean(h.text).replace(/porcentaje|reembolso/gi,'').trim();
        let unit=r.kind==='rate'?r.unit:/(?:UF|\$|pesos|CLP|USD|%|‰)/i.exec(value)?.[0]??r.unit;
        const warnings:string[]=[];
        if(cell.rowSpan>1)warnings.push('Celda compartida entre prestaciones; conserva el límite conjunto.');
        if(/evento/i.test(value)&&r.period==='año')warnings.push('Encabezado anual y texto por evento: revisar periodicidad.');
        if(!context.coverage||!context.plan)warnings.push('Cobertura o plan sin identificar.');
        if(/idem|ídem|seg[uú]n|arancel/i.test(value))warnings.push('Valor remite a otra condición o arancel; conservar referencia.');
        let kind=r.kind as ContractCandidate['kind'];
        if(/^carencia$/i.test(benefit)){kind='waiting';unit=/mes/i.test(value)?'meses':/d[ií]a/i.test(value)?'días':'';period='';}
        if(/^deducible (?:anual|por)/i.test(benefit)) {kind=/^\d/.test(value)?'deductible':'special';unit=kind==='deductible'?'UF':'';scope=cell.column===valueHeaders.at(-1)?.column?'grupo familiar':'asegurado';period=/anual/i.test(benefit)?'año':'';}

        out.push({id:`${table.id}:${label.id}:${cell.id}`,coverage:context.coverage,plan:context.plan,groups:context.groups,benefit,kind,value,unit,scope,period,page:page.page,quote:sourceQuote(page.text,cell.text,label.text),region:cell.region,tableId:table.id,cellId:cell.id,notes:[...(category?[`Rubro: ${clean(category)}`]:[]),...(/^sin tope$/i.test(value)?['Sin Tope se refiere a esta celda; no elimina límites generales del plan.']:[]),...table.notes],warnings,alternatives:[],eligibility:'benefit'});
      }
    }
  }
  return out;
}
function supplemental(page:PageText,context:ReturnType<typeof contextFor>):ContractCandidate[]{
  const out:ContractCandidate[]=[];
  // Párrafos completos, sin convertir restricciones en beneficios. La cita es un fragmento literal.
  let reference=false;
  for(const block of page.text.split(/\n\s*\n/)){
    if(/(?:^|\n)\s*(?:ART[IÍ]CULO\s+\d+.*EXCLUS|\d+[. ]*EXCLUSIONES|CONDICIONES GENERALES)/i.test(block))reference=true;
    if(!/deducible|carencia|exclusi[oó]n|edad.*(?:ingreso|permanencia)|condiciones especiales|tope.*(?:beneficiario|familiar|evento)/i.test(block))continue;
    const quote=block.trim();if(quote.length<10||quote.length>10000)continue;
    const kind:ContractCandidate['kind']=/carencia/i.test(block)?'waiting':/deducible/i.test(block)?'deductible':/exclusi[oó]n/i.test(block)?'exclusion':/edad/i.test(block)?'age':'special';
    const explicitDental=/dental|dentales|ortodoncia/i.test(block);
    const coverage=explicitDental?'Dental':context.coverage;
    const period=/anual|año/i.test(block)?'año':/vigencia de la p[oó]liza/i.test(block)?'vigencia póliza':/evento/i.test(block)?'evento':'';
    out.push({id:`p${page.page}:paragraph:${out.length}`,coverage,plan:explicitDental&&!/dental|DEN/i.test(context.plan)?'Cobertura Dental':context.plan,groups:context.groups,benefit:clean(quote.split('\n')[0]).slice(0,220),kind,value:clean(quote),unit:'',scope:/grupo familiar/i.test(block)?'grupo familiar':/beneficiario/i.test(block)?'beneficiario':'',period,page:page.page,quote,notes:[],warnings:['Condición narrativa: revisar alcance y excepciones antes de confirmar.'],alternatives:[],eligibility:reference?'reference':'restriction'});
  }
  // Tablas de deducible sin cuadrícula: filas completas conservan etiqueta y contexto.
  const sourceLines=page.text.split(/\r?\n/);
  for(const [lineIndex,line] of sourceLines.entries()){
    const m=/^\s*(Titular\s+(?:Solo|\+\s*1\s*Carga\(s\)|\+\s*2\s*Cargas\s*o\s*m[aàá]s))\s{2,}(\d+[,.]?\d*\s*UF)\s*$/i.exec(line);
    const section=sourceLines.slice(0,lineIndex).filter(l=>/deducible|primas?|tarifas?/i.test(l)).at(-1)??'';
    if(!m||!/deducible/i.test(section)||/primas?|tarifas?/i.test(section))continue;
    const coverage=/19[.]?\s*COBERTURA DENTAL/i.test(page.text)?'Dental':context.coverage??'Salud';
    out.push({id:`p${page.page}:deductible:${out.length}`,coverage,plan:coverage==='Dental'?'Cobertura Dental':context.plan||'Plan Salud',groups:[clean(m[1])],benefit:'Deducible '+clean(m[1]),kind:'deductible',value:clean(m[2]),unit:'UF',scope:'grupo familiar',period:/vigencia de la p[oó]liza/i.test(page.text)?'vigencia póliza':'',page:page.page,quote:line.trim(),notes:page.text.split(/\r?\n/).filter(l=>/\(\*\)|no aplicar[aá].*cargas especiales/i.test(l)).map(l=>l.trim()),warnings:[],alternatives:[],eligibility:'restriction'});
  }
  for(const line of page.text.split(/\r?\n/)) {
    const m=/^\s*(Tope anual de reembolso por Beneficiario[^\n]*)\s{2,}(?:UF\s+)?(\d+(?:[.,]\d+)?\s*(?:UF)?)\s*$/i.exec(line);
    if(!m)continue;
    out.push({id:`p${page.page}:annual:${out.length}`,coverage:context.coverage,plan:context.plan,groups:context.groups,benefit:clean(m[1]),kind:'limit',value:clean(m[2]),unit:'UF',scope:/beneficiario/i.test(m[1])?'beneficiario':'',period:'año',page:page.page,quote:line.trim(),notes:[],warnings:[],alternatives:[],eligibility:'restriction'});
  }
  return out;
}
export function extractContractConditions(pages:PageText[]):ContractCandidate[]{
  const all:ContractCandidate[]=[];
  let context:{coverage:CoverageType|null;plan:string;groups:string[]}={coverage:null,plan:'',groups:[]};
  let authorizedPage=-10;
  for(const page of pages){
    const list:ContractCandidate[]=[];
    for(const table of page.benefitTables??[]){
      if(table.method==='layout')continue;
      const next=contextFor(table,context);
      const assigned=/MOD Asignado\s+(VCV[A-Z0-9]+)/i.exec(page.text)?.[1];
      if(next.coverage==='Vida'&&assigned)next.plan=assigned;
      // No heredar beneficios desde exclusiones o anexos administrativos.
      const ctx=table.context??'';
      const forbidden=/exclusiones|procedimiento de liquidaci[oó]n/i.test(ctx)&&!/cuadro de (?:beneficios|condiciones)|plan de reembolso|cobertura y tasas|capital por cobertura/i.test(ctx);
      const candidates=tableCandidates(page,table,next);
      const explicit=/cuadro de (?:beneficios|condiciones)|plan de reembolsos?|plan de beneficios|condiciones plan|cobertura y tasas|capital por cobertura|tasa por cobertura|requisitos de (?:asegurabilidad|ingreso)/i.test(ctx);
      const permitted=explicit||page.page<=authorizedPage+1;
      if(explicit)authorizedPage=page.page;
      if(forbidden||!permitted)for(const c of candidates){c.eligibility='reference';c.warnings.push('Referencia en exclusiones o procedimiento: no importar como beneficio.');}
      list.push(...candidates);context=next;
    }
    list.push(...supplemental(page,context));
    page.contractCandidates=list.slice(0,1500);all.push(...page.contractCandidates);
  }
  extractTariffs(pages);
  for(const page of pages)page.contractCandidates=page.contractCandidates?.filter(c=>!isExcludedContractCandidate(c));
  all.length=0;all.push(...pages.flatMap(p=>p.contractCandidates??[]));
  // Solo comparar mismo campo, ámbito y plan. Mantener alternativas, nunca elegir por orden.
  const groups=new Map<string,ContractCandidate[]>();
  for(const c of all.filter(c=>c.eligibility==='benefit')){
    const key=[c.coverage,fold(c.plan),c.groups.join('|'),fold(c.benefit),c.kind,c.scope,c.period,c.unit,c.notes.find(n=>n.startsWith('Rubro:'))??'',c.tariff?.component,c.tariff?.category,c.tariff?.ageBand,c.tariff?.incomeBand].join(':');
    groups.set(key,[...(groups.get(key)??[]),c]);
  }
  for(const list of groups.values()){
    const alternatives=[...new Set(list.map(c=>c.value))];
    if(alternatives.length>1)for(const c of list){c.alternatives=alternatives;c.warnings.push('Valores contradictorios para el mismo alcance: revisión obligatoria.');}
  }
  return all;
}
