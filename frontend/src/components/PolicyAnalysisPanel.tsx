import { useEffect, useRef, useState } from 'react';
import type { PolicyAnalysis } from '../../../shared/analysis';
import type { PortfolioDetail } from '../../../shared/portfolio';
import type { ReportBranding } from '../../../shared/executive';
import type { PolicyIndicators, ScopeQuery } from '../lib/technicalTypes';
import { fetchBranding, readPolicyAnalysisExport, requestPolicyAnalysis } from '../api';
import PolicyAnalysisView from './PolicyAnalysisView';
import { ReportDeck, type ReportSlide } from './ReportPresentation';
import ReportCover from './ReportCover';
import PrimasCharts from './PrimasCharts';

const members=(s:string)=>[...new Set(s.split(',').map(s=>s.trim()).filter(Boolean))].sort().join(',');
export function compatibleAnalysis(a:PolicyAnalysis,clientId:string,policyId:string,q:ScopeQuery) {
  return a.scope.clientId===clientId&&a.scope.policyId===policyId&&a.scope.premiumSnapshotId===q.premiumSnapshotId&&a.scope.expenseSnapshotId===q.expenseSnapshotId&&members(a.scope.periods.join(','))===members(q.periods)&&members(a.scope.coverages.join(','))===members(q.coverages)&&(!a.expiresAt||Date.parse(a.expiresAt)>Date.now())&&a.source!=='real';
}
export default function PolicyAnalysisPanel({detail,policyId,query}:{detail:PortfolioDetail;policyId:string;query:ScopeQuery}) {
  const periods=members(query.periods).split(',');
  const [month,setMonth]=useState(periods.at(-1)??''),[monthly,setMonthly]=useState<PolicyAnalysis|null>(null),[final,setFinal]=useState<PolicyAnalysis|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [pdf,setPdf]=useState<{analysis:PolicyAnalysis;monthly:PolicyAnalysis|null;data:PolicyIndicators;branding:ReportBranding}|null>(null);
  const epoch=useRef(0);useEffect(()=>()=>{epoch.current++;},[]);
  const monthQuery={...query,periods:month};
  const assertScope=(a:PolicyAnalysis,q:ScopeQuery)=>{if(!compatibleAnalysis(a,detail.client.id,policyId,q))throw Error('El resultado expiró o no corresponde a esta empresa, póliza y selección. Consulta nuevamente.');};
  async function action(fn:(token:number)=>Promise<void>){const token=++epoch.current;setBusy(true);setError('');try{await fn(token);}catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'No se pudo completar.');}finally{if(token===epoch.current)setBusy(false);}}
  async function exportPdf(token:number) {
    // Read-only endpoints revalidate current reviews/versions/hashes. No POST or provider.
    const [bundle,branding]=await Promise.all([readPolicyAnalysisExport(policyId,query,monthly?month:undefined),fetchBranding(detail.client.name)]);
    const {analysis,monthly:monthResult,indicators:data}=bundle;
    if(token!==epoch.current)return;
    assertScope(analysis,query);if(monthResult)assertScope(monthResult,monthQuery);
    setFinal(analysis);setMonthly(monthResult);setPdf({analysis,monthly:monthResult,data,branding});
    try {
      await document.fonts.ready;
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.pdf-deck img')).map(img=>img.decode()));
      if(token!==epoch.current)return;
      assertScope(analysis,query);if(monthResult)assertScope(monthResult,monthQuery);
      window.print();
    } finally {if(token===epoch.current)setPdf(null);}
  }
  let slides:ReportSlide[]=[];
  if(pdf) {
    const a=pdf.analysis,label=`${a.scope.clientName} · Póliza ${a.scope.number} · ${a.scope.insurer}`;
    slides=[{id:'cover',title:'Informe final de póliza',content:<ReportCover client={label} periods={a.scope.periods} coverages={a.scope.coverages} branding={pdf.branding} generated={new Date()}/>},
      {id:'scope',title:'Alcance y calidad · póliza individual',content:<section><h3>{label}</h3><p>Alcance exclusivo de esta póliza; no representa el consolidado empresarial.</p><p>Períodos: {a.scope.periods.join(', ')} · Coberturas: {a.scope.coverages.join(', ')}</p><p>Versiones: {a.scope.versions.join(', ')}.</p><p>Snapshot primas: {a.scope.premiumSnapshotId}. Snapshot gastos: {a.scope.expenseSnapshotId}.</p><p>Gasto técnico y reembolsos se mantienen separados. Un reembolso pagado no acredita gasto incurrido. No se cuentan líneas como atenciones únicas.</p></section>}];
    a.scope.coverages.forEach(coverage=>slides.push({id:`policy-chart-${coverage}`,title:`Indicadores · ${coverage}`,content:<PrimasCharts interactive={false} scope="policy" qualityByPeriod={Object.fromEntries(pdf.data.scope.monthly.map(m=>[m.period,m.coverages.find(c=>c.coverage===coverage)?.qualityStatus??'incomplete']))} client={label} report={{series:[{coverage,series:pdf.data.monthly.map(m=>{const c=m.coverages.find(c=>c.type===coverage);const scope=pdf.data.scope.monthly.find(s=>s.period===m.period)?.coverages.find(c=>c.coverage===coverage);return {period:m.period,premiumUf:scope&&'premiumUf' in scope?scope.premiumUf as number|null:null,spendUf:c?.currentSpendUf??null,lossRatio:scope&&'lossRatio' in scope?scope.lossRatio as number|null:null};})}]}}/>}));
    const format=(v:number|null|undefined,suffix='')=>v==null?'Sin datos':`${v.toLocaleString('es-CL',{maximumFractionDigits:2})}${suffix}`;
    pdf.data.monthly.forEach(m=>slides.push({id:`policy-metrics-${m.period}`,title:`Indicadores y conciliación · ${m.period}`,content:<section><p>{label} · {m.period} · Referencia {m.referencePeriod}.</p><table className="analysis-pdf-table"><thead><tr><th>Indicador</th><th>Actual</th><th>Anterior</th></tr></thead><tbody>{[['Prima',m.current.premiumUf,m.previous.premiumUf],['Gasto técnico',m.current.technicalSpendUf,m.previous.technicalSpendUf],['Reembolsos',m.current.reimbursementUf,m.previous.reimbursementUf],['Diferencia de conciliación',m.current.differenceUf,m.previous.differenceUf],['Exclusiones netas',m.current.excludedNetUf,m.previous.excludedNetUf]].map(([name,current,previous])=><tr key={String(name)}><td>{name}</td><td>{format(current as number|null,' UF')}</td><td>{format(previous as number|null,' UF')}</td></tr>)}</tbody></table><p>Siniestralidad {format(m.current.lossRatio==null?null:m.current.lossRatio*100,'%')} · Variación {format(m.comparison.lossRatioDeltaPp,' pp')} · Efecto gasto {format(m.comparison.spendEffectPp,' pp')} · Efecto prima {format(m.comparison.premiumEffectPp,' pp')}.</p><table className="analysis-pdf-table"><thead><tr><th>Cobertura</th><th>Calidad / base</th><th>Actual UF</th><th>Anterior UF</th><th>Diferencia UF</th><th>Contribución pp</th></tr></thead><tbody>{m.coverages.map(c=>{const q=pdf.data.scope.monthly.find(s=>s.period===m.period)?.coverages.find(q=>q.coverage===c.type);return <tr key={c.type}><td>{c.type}</td><td>{q?.qualityStatus==='complete'?'Completo':'Revisar datos'} · {q?.expenseBasis==='paid'?'Pagado':q?.expenseBasis==='incurred'?'Incurrido':'No determinada'}</td><td>{format(c.currentSpendUf)}</td><td>{format(c.previousSpendUf)}</td><td>{format(c.differenceUf)}</td><td>{format(c.contributionTotalPp)}</td></tr>;})}</tbody></table>{!m.attribution.available&&<p>No atribuir cambios a coberturas: falta conciliación, base verificada o comparabilidad.</p>}</section>}));
    if(pdf.monthly)slides.push({id:'policy-monthly-analysis',title:'Análisis del mes · póliza individual',content:<PolicyAnalysisView analysis={pdf.monthly}/>});
    if(a.status==='available'&&a.source!=='real'&&a.sections.length===3)a.sections.forEach((section,index)=>slides.push({id:`policy-final-${index}`,title:`Conclusión ${index+1} de 3 · ${section.title}`,content:<PolicyAnalysisView analysis={a} sectionIndex={index}/>}));
    else slides.push({id:'policy-final-blocked',title:'Conclusiones bloqueadas · póliza individual',content:<PolicyAnalysisView analysis={a}/>});
  }
  return <section className="contract-panel policy-analysis-controls" aria-label="Análisis bajo demanda">
    <h3>Análisis y conclusiones · póliza individual</h3><p>Solo estas acciones solicitan análisis. Gemini permanece deshabilitado; los resultados deterministas no consumen tokens. Un resultado simulado nunca se presenta como IA real.</p>
    <label>Mes del análisis<select value={month} onChange={e=>{epoch.current++;setMonth(e.target.value);setMonthly(null);setBusy(false);setError('');}}>{periods.map(p=><option key={p}>{p}</option>)}</select></label>
    <div className="analysis-actions"><button className="account-secondary" disabled={busy||!month} onClick={()=>action(async token=>{const a=await requestPolicyAnalysis(policyId,monthQuery,'monthly');if(token===epoch.current){assertScope(a,monthQuery);setMonthly(a);}})}>Analizar mes seleccionado</button>
    <button className="account-secondary" disabled={busy} onClick={()=>action(async token=>{const a=await requestPolicyAnalysis(policyId,query,'conclusions');if(token===epoch.current){assertScope(a,query);setFinal(a);}})}>Preparar tres conclusiones</button>
    <button className="account-primary" disabled={busy} onClick={()=>action(exportPdf)}>Exportar PDF de póliza</button></div>
    {busy&&<p role="status">Verificando alcance y resultados…</p>}{error&&<p role="alert">{error}</p>}
    {monthly&&<PolicyAnalysisView analysis={monthly}/>} {final&&<PolicyAnalysisView analysis={final}/>}
    {pdf&&<ReportDeck slides={slides} client={`${pdf.analysis.scope.clientName} · Póliza ${pdf.analysis.scope.number}`} periods={pdf.analysis.scope.periods} branding={pdf.branding}/>}
  </section>;
}
