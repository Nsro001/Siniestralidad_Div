// Política exclusiva del módulo contractual. No se aplica a fuentes ni modelos técnicos.
export function isAggregatePremiumLabel(value) {
  const text=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const priced=text.replace(/\binvalidez total(?: y permanente)?(?:\s*2\/3)?/g,'invalidez');
  return /^(?:sub\s*total(?:es)?|total(?:es)?|sumatoria|suma de primas)\b/.test(priced)||/\bprimas?\b.*\b(?:(?:sub\s*)?total(?:es)?|agregad[ao]s?|consolidad[ao]s?)\b/.test(priced);

}
export function isExcludedContractCandidate(c) {
  return c?.key==='premium'||c?.key==='estimatedPremium'||c?.tariff?.subtotal===true||[c?.benefit,c?.label,c?.tariff?.category,c?.tariff?.componentLabel].some(isAggregatePremiumLabel)||isAggregatePremiumLabel(c?.value??'');
}
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const proof=value=>object(value)?{...pick(value,['documentId','page','quote']),...(object(value.region)?{region:pick(value.region,['x','y','width','height'])}:{})}:value;
export function sanitizeFunctionalContract(value) {
  if(!object(value))return value;
  const next=pick(value,['number','insurer','startsOn','endsOn','currency','periodicity','commission','commissionBasis','broker','kam','status','cancellationDate','coverages','evidence']);
  if(object(next.evidence))next.evidence=Object.fromEntries(Object.entries(next.evidence).filter(([key])=>!['premium','estimatedPremium','totalPremium'].includes(key)).map(([key,value])=>[key,proof(value)]));
  if(Array.isArray(next.coverages))next.coverages=next.coverages.map(coverage=>{
    if(!object(coverage))return coverage;
    const cv=pick(coverage,['id','type','name','plans']);
    if(Array.isArray(cv.plans))cv.plans=cv.plans.map(plan=>{
      if(!object(plan))return plan;
      const p=pick(plan,['id','name','groups','terms']);
      if(Array.isArray(p.terms))p.terms=p.terms.filter(t=>!isExcludedContractCandidate(t)).map(term=>{
        if(!object(term))return term;
        const t=pick(term,['id','label','value','unit','scope','period','evidence','sourceCandidateId','reviewStatus','sourceNotes','sourceGroups','sourceWarnings','alternatives','tariff']);
        if(t.evidence)t.evidence=proof(t.evidence);
        if(object(t.tariff))t.tariff=pick(t.tariff,['concept','component','componentLabel','category','currency','rateUnit','calculationBasis','periodicity','ageBand','incomeBand','capitalBasis','contextEvidence']);
        return t;
      });
      return p;
    });
    return cv;
  });
  return next;
}
