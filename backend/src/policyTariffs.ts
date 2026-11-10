import { isAggregatePremiumLabel } from "../../shared/contractPolicy.mjs";
import type { ContractCandidate, ContractTariff, CoverageType, DocumentCell, DocumentTable, PageText } from '../../shared/portfolio.js';
import {sourceQuote} from './policyTableGeometry.js';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const fold=(s:string)=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money=(s:string)=> /\bUF\b/i.test(s)?'UF':/\bCLP\b|\bpesos\b/i.test(s)?'CLP':/\bUSD\b/i.test(s)?'USD':/\$/.test(s)?'$':'';
const periodicity=(s:string)=>/\banual(?:es)?\b/i.test(s)?'anual':/\bmensual(?:es)?\b|\bmensuales\b/i.test(s)?'mensual':/\btrimestral(?:es)?\b/i.test(s)?'trimestral':/\bsemestral(?:es)?\b/i.test(s)?'semestral':'';
function component(s:string):ContractTariff['component'] {return /\biva\b|impuesto/i.test(s)?'tax':/brut[ao]/i.test(s)?'gross':/net[ao]|afect[ao]/i.test(s)?'net':'unspecified';}
function currencyContext(text:string):string {const clause=/(?:primas?[^\n]{0,100}(?:en UF|en pesos|en CLP|en USD)|capital asegurado[^\n]{0,80}(?:unidades de fomento|UF))/i.exec(text)?.[0]??'';return /unidades de fomento/i.test(clause)?'UF':money(clause);}
function classification(ctx:string,label:string):CoverageType|null {
  if(/fallecimiento|invalidez|muerte accidental/i.test(label))return 'Vida';
  const matches=[...ctx.matchAll(/cobertura dental|primas?[^\n]*dentales?|plan[^\n]*dental|19[.]?\s*cobertura dental|(?:cobertura|seguro|plan)[^\n]*catastr[oó]fic[oa]|seguro[^\n]*salud|condiciones plan salud/gi)];
  const last=matches.at(-1)?.[0]??'';return /catastr/i.test(last)?'Catastrófico':/dental/i.test(last)?'Dental':/salud/i.test(last)?'Salud':null;
}
function newMetadata():ContractTariff{return {concept:'plan_tariff',component:'unspecified',componentLabel:'',category:'',currency:'',rateUnit:'',calculationBasis:'',periodicity:'',ageBand:'',incomeBand:'',capitalBasis:''};}
function details(page:PageText,table:DocumentTable,header:DocumentCell,label:string,kind:'tariff'|'rate'|'capital',value:string):ContractTariff {
  const ctx=table.context??'';const text=ctx+'\n'+header.text;
  const meta=newMetadata();meta.componentLabel=clean(header.text);meta.component=component(header.text);meta.periodicity=periodicity(header.text)||periodicity(ctx);
  if(kind==='rate'){
    meta.concept='capital_rate';meta.rateUnit=/%o|‰|\bpor mil\b/i.test(header.text)?'‰':/%|por ciento/i.test(header.text)?'%':/(?:por cada \d+(?:[ .]\d+)*|por diez mil|por cien mil|puntos b[aá]sicos|\bppm\b)/i.exec(header.text)?.[0]??'';
    const formula=page.text.split(/\n\s*\n/).find(p=>/capital asegurado.*(?:por la tasa|multiplica)|tasa.*(?:sobre|aplicada al)\s+(?:el\s+)?capital/i.test(clean(p)));
    if(formula){meta.calculationBasis=clean(formula);meta.contextEvidence=[{page:page.page,quote:formula.trim()}];}
    meta.category=/por cada titular|titular asegurado/i.test(ctx)?'Titular':clean(/categor[ií]a\s*:\s*([^\n]+)/i.exec(ctx)?.[1]??'');
  }else if(kind==='capital'){
    meta.periodicity='';
    meta.concept='insured_capital';meta.capitalBasis=/renta|sueldo|remuneraci[oó]n/i.test(value)?'salary_multiple':'fixed_amount';
    meta.currency=meta.capitalBasis==='salary_multiple'?'':money(header.text+' '+value);
    meta.calculationBasis=meta.capitalBasis==='salary_multiple'?clean(value):'';
    meta.category=/(?:titular|c[oó]nyuge|hijos?|cargas adicionales)/i.exec(label)?.[0]??'';
  }else{
    meta.currency=money(header.text)||currencyContext(ctx);
    meta.category=/por cada titular/i.test(ctx)?'Titular':label;
    if(/por cada|por persona|por asegurado|individual/i.test(ctx))meta.concept='person_premium';
    else if(/seg[uú]n n[uú]mero de cargas|grupo familiar|titular.*carga/i.test(ctx+' '+label))meta.concept='family_premium';
    if(meta.component==='tax')meta.concept='tax';
    const basis=/por cada[^.\n]+|por persona[^.\n]*|por grupo familiar[^.\n]*|seg[uú]n n[uú]mero de cargas/i.exec(ctx)?.[0];
    if(basis)meta.calculationBasis=clean(basis);

  }
  const proof=ctx.split(/\n\s*\n/).find(p=>/primas?\s+mensuales|por cada|seg[uú]n n[uú]mero de cargas/i.test(p));
  if(proof){const quote=proof.trim();if(page.text.includes(quote))meta.contextEvidence=[...(meta.contextEvidence??[]),{page:page.page,quote}];}
  return meta;
}
function warnings(meta:ContractTariff,kind:ContractCandidate['kind']):string[]{
  return [...(kind!=='capital'&&!meta.periodicity?['Periodicidad de esta tarifa o tasa no indicada.']:[]),...(kind==='rate'&&!meta.rateUnit?['Unidad de tasa no indicada; no asumir porcentaje ni por mil.']:[]),...(kind!=='rate'&&meta.capitalBasis!=='salary_multiple'&&!meta.currency?['Moneda de esta tarifa o capital no indicada.']:[]),...(kind==='rate'&&!meta.calculationBasis?['Base de aplicación de la tasa sin fórmula explícita.']:[])];
}
export function extractTariffs(pages:PageText[]):void {
  const knownPlans=new Map<CoverageType,string[]>();
  for(const p of pages)for(const c of p.contractCandidates??[])if(c.coverage&&c.plan&&c.eligibility!=='reference')knownPlans.set(c.coverage,[...new Set([...(knownPlans.get(c.coverage)??[]),c.plan])]);
  let lastCoverage:CoverageType|null=null;
  for(const page of pages){
    if(/(?:^|\n)\s*(?:\d+[.]?\s*)?COBERTURA DENTAL/i.test(page.text))lastCoverage='Dental';
    for(const table of page.benefitTables??[]){
      if(table.method==='layout')continue;
      // Enriquecer tasas y capitales sin convertirlos en primas.
      for(const c of (page.contractCandidates??[]).filter(c=>c.tableId===table.id&&['rate','capital'].includes(c.kind))){
        const valueCell=table.cells.find(v=>v.id===c.cellId);if(!valueCell)continue;
        const header=table.cells.filter(v=>v.column===valueCell.column&&v.row<valueCell.row).find(v=>/tasa|capital/i.test(v.text));if(!header)continue;
        c.tariff=details(page,table,header,c.benefit,c.kind as 'rate'|'capital',c.value);
        c.tariff.periodicity=periodicity(header.text); // No deducir la frecuencia de la tasa desde otras primas de la página.
        if(c.kind==='rate')c.unit=c.tariff.rateUnit;
        if(c.tariff.capitalBasis==='salary_multiple')c.unit=/veces[^,;.\n]*|rentas?[^,;.\n]*/i.exec(c.value)?.[0]??'';
        c.warnings=[...new Set([...c.warnings,...warnings(c.tariff,c.kind)])];
      }
      const labelHeader=table.cells.find(c=>c.row<3&&/^(?:cobertura|asegurados?|categor[ií]a|grupo|plan|beneficiario|tipo de asegurado|tramo de renta|tramo de edad)$/i.test(clean(c.text)));
      if(!labelHeader)continue;
      const headers=table.cells.filter(c=>c.row<labelHeader.row+labelHeader.rowSpan&&c.column>labelHeader.column);
      const monetary=headers.filter(c=>/prima|\biva\b|tarifa/i.test(c.text));
      const transposed=/tramo de (?:renta|edad)/i.test(labelHeader.text);
      if(!monetary.length&&!transposed)continue;
      const labels=table.cells.filter(c=>c.column===labelHeader.column&&c.row>=labelHeader.row+labelHeader.rowSpan&&c.text);
      const ctx=table.context??'';
      const ref=/exclusiones|procedimiento de liquidaci[oó]n/i.test(ctx)&&!/primas? mensuales|tarifas y primas/i.test(ctx);
      for(const label of labels){
        if(isAggregatePremiumLabel(label.text))continue;
        const individual=transposed||/por cada|por persona|por asegurado|individual|seg[uú]n número de cargas|grupo familiar|por plan|por categoría/i.test(ctx)||/\b(?:titular|c[oó]nyuge|hij[oa]s?|cargas?|plan)\b/i.test(label.text)||/categor[ií]a|asegurados?|tipo de asegurado|tramo de/i.test(labelHeader.text);
        if(!individual)continue;
        const valueHeaders=transposed?headers:monetary;
        if(transposed&&!/prima|\biva\b/i.test(label.text))continue;
        for(const header of valueHeaders){
          const cells=table.cells.filter(c=>c.column===header.column&&c.row<label.row+label.rowSpan&&c.row+c.rowSpan>label.row&&c.row>header.row&&/\d/.test(c.text));
          for(const cell of cells){
            const value=clean(cell.text);if(!/^(?:UF\s*|\$\s*)?\d+(?:[.,]\d+)?(?:\s*(?:UF|CLP|USD))?$/i.test(value))continue;
            const category=transposed?clean(header.text):clean(label.text);
            const meta=details(page,table,transposed?label:header,category,'tariff',value);
            if(transposed){meta.category=clean(/Primas?\s+Cargas[^\n:]*:?/i.exec(ctx)?.[0]??'');meta.incomeBand=/renta/i.test(labelHeader.text)?category:'';meta.ageBand=/edad/i.test(labelHeader.text)?category:'';meta.concept=meta.component==='tax'?'tax':'plan_tariff';}
            let coverage:CoverageType|null=classification(ctx,clean(label.text))??lastCoverage;
            if(!coverage&&/seguro seg[uú]n n[uú]mero de cargas/i.test(clean(ctx)))coverage='Salud';
            if(coverage)lastCoverage=coverage;
            const plans=coverage?knownPlans.get(coverage)??[]:[];
            const explicit=[...ctx.matchAll(/\b(?:MOD|DEN|VCV)[A-Z0-9]{3,}/gi)].at(-1)?.[0];
            const plan=explicit??(plans.length===1?plans[0]:'');
            const warn=[...warnings(meta,'tariff'),...(!coverage||!plan?['Cobertura o plan de tarificación sin identificar.']:[])];
            if(transposed)warn.push('Tramo de tarificación: revisar base de cobro y asociación al plan.');
            const c:ContractCandidate={id:`${table.id}:tariff:${label.id}:${cell.id}`,coverage,plan,groups:[],benefit:clean(label.text),kind:'tariff',value,unit:meta.currency,scope:meta.concept==='person_premium'?'persona':meta.concept==='family_premium'?'grupo familiar':'',period:meta.periodicity,page:page.page,quote:sourceQuote(page.text,cell.text,label.text),region:cell.region,tableId:table.id,cellId:cell.id,notes:[...table.notes],warnings:warn,alternatives:[],eligibility:ref?'reference':'benefit',tariff:meta};
            page.contractCandidates??=[];page.contractCandidates.push(c);
          }
        }
      }
    }
  }
}
