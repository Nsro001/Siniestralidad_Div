import { sanitizeFunctionalContract, isExcludedContractCandidate } from "../../../shared/contractPolicy.mjs";
import type { ContractCandidate, PolicyContract } from '../../../shared/portfolio';
export const conditionLabels:Record<ContractCandidate['kind'],string>={reimbursement:'Reembolso',limit:'Tope',deductible:'Deducible',capital:'Capital',rate:'Tasa',age:'Edad',waiting:'Carencia',exclusion:'Exclusión',special:'Condición especial',cmf:'Código CMF',tariff:'Tarificación'};
export function incorporateConditions(contract:PolicyContract,candidates:ContractCandidate[],documentId:string):PolicyContract {
  const next=structuredClone(sanitizeFunctionalContract(contract));
  for(const c of candidates){
    if(isExcludedContractCandidate(c))continue;
    if(c.eligibility==='reference'||!c.coverage||!c.plan.trim()||!c.value.trim()||!c.quote.trim())continue;
    let coverage=next.coverages.find(v=>v.type===c.coverage);
    const evidence={documentId,page:c.page,quote:c.quote,...(c.region?{region:c.region}:{})};
    if(!coverage){coverage={id:crypto.randomUUID(),type:c.coverage,name:c.coverage,plans:[]};next.coverages.push(coverage);next.evidence[coverage.id]=evidence;}
    let plan=coverage.plans.find(p=>p.name===c.plan);
    if(!plan){plan={id:crypto.randomUUID(),name:c.plan,groups:[...c.groups],terms:[]};coverage.plans.push(plan);next.evidence[plan.id]=evidence;}
    plan.groups=[...new Set([...plan.groups,...c.groups])];
    const sourceCandidateId=`${documentId}:${c.id}`;
    const previous=plan.terms.find(t=>t.sourceCandidateId===sourceCandidateId);
    // Reimportar no pisa correcciones de una versión existente.
    if(previous){
      if(c.tariff&&!previous.tariff){previous.tariff=structuredClone(c.tariff);previous.sourceWarnings=[...new Set([...(previous.sourceWarnings??[]),...c.warnings])];if(c.warnings.length)previous.reviewStatus='pending';}
      continue;
    }
    if(plan.terms.length>=500)throw new Error('El plan supera 500 condiciones; divide la revisión antes de incorporar.');
    const category=c.notes.find(n=>n.startsWith('Rubro:'))?.slice(6).trim();
    const pricing=c.tariff?` · ${c.tariff.componentLabel} · ${c.tariff.category} ${c.tariff.incomeBand} ${c.tariff.ageBand}`:"";
    const label=`${c.benefit} · ${conditionLabels[c.kind]}${pricing}${category?` · ${category}`:''}`.slice(0,240);
    const conflicting=plan.terms.filter(t=>t.label===label&&t.unit===c.unit&&t.scope===c.scope&&t.period===c.period&&JSON.stringify(t.sourceGroups??[])===JSON.stringify(c.groups)&&t.value!==c.value);
    const alternatives=[...new Set([...c.alternatives,...conflicting.flatMap(t=>[t.value,...(t.alternatives??[])]),c.value])];
    const conflictWarning='Otro documento o borrador contiene un valor distinto para el mismo alcance.';
    if(conflicting.length)for(const term of conflicting){term.reviewStatus='pending';term.alternatives=alternatives;term.sourceWarnings=[...new Set([...(term.sourceWarnings??[]),conflictWarning])];}
    const warnings=[...c.warnings,...(conflicting.length?[conflictWarning]:[])];
    plan.terms.push({id:crypto.randomUUID(),label,value:c.value,unit:c.unit,scope:c.scope,period:c.period,evidence,...(c.tariff?{tariff:structuredClone(c.tariff)}:{}),sourceCandidateId,reviewStatus:conflicting.length||c.warnings.length&&!c.reviewed?'pending':'reviewed',sourceNotes:c.notes,sourceGroups:c.groups,sourceWarnings:warnings,alternatives:alternatives.length>1?alternatives:[]});
  }
  return next;
}
