import PolicyAnalysisPanel from './PolicyAnalysisPanel';
import { useEffect, useRef, useState } from 'react';
import type { Evidence, PortfolioDetail } from '../../../shared/portfolio';
import type { TechnicalReview, QualityStatus, ExpenseBasis } from '../../../shared/technicalReview';
import type { PolicyIndicators, RenewalResults, ScopeQuery } from '../lib/technicalTypes';
import { fetchPolicyIndicators, calculatePolicyRenewal, fetchTechnicalReviews, saveTechnicalReview } from '../api';
import ContractEvidence from './ContractEvidence';
import { technicalLabel } from '../lib/technicalLabels';

export const QUALITY_LABELS:Record<QualityStatus,string>={complete:'Completo',incomplete:'Incompleto',partial:'Parcial · revisar datos',ambiguous:'Ambiguo · revisar datos',pending_validation:'Pendiente de validación'};
export const BASIS_LABELS:Record<ExpenseBasis,string>={paid:'Pagado',incurred:'Incurrido',undetermined:'No determinada'};
const fmt=(v:number|null|undefined,suffix='')=>v==null?'Sin datos':`${v.toLocaleString('es-CL',{maximumFractionDigits:2})}${suffix}`;
const numericFields=[['targetLossRatio','Siniestralidad objetivo (razón decimal)'],['annualClaimTrend','Tendencia anual (razón decimal)'],['trendYears','Años de tendencia'],['developmentFactor','Factor de desarrollo'],['exposureFactor','Factor de exposición'],['forecastMonths','Meses proyectados'],['minimumObservedMonths','Mínimo de meses observados'],['maintenanceBand','Banda de mantención (razón decimal)']] as const;
export default function PolicyTechnicalPanel({detail,editable,onReviewAssignments}:{detail:PortfolioDetail;editable:boolean;onReviewAssignments:()=>void}){
  const [policyId,setPolicyId]=useState(''),[premiumSnapshotId,setPremium]=useState(''),[expenseSnapshotId,setExpense]=useState(''),[periods,setPeriods]=useState(''),[coverages,setCoverages]=useState<string[]>([]);
  const [data,setData]=useState<PolicyIndicators|null>(null),[renewal,setRenewal]=useState<RenewalResults|null>(null),[reviews,setReviews]=useState<TechnicalReview[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const sequence=useRef(0);
  const [analysisRevision,setAnalysisRevision]=useState(0);
  const [review,setReview]=useState({versionId:'',period:'',coverage:'',review_kind:'expense_basis',decision:'pending',expense_basis:'undetermined',data_complete:null as boolean|null,note:''});
  const [evidence,setEvidence]=useState<Evidence|undefined>();
  const [assumptions,setAssumptions]=useState<Record<string,string>>({name:'',version:'',source:'',...Object.fromEntries(numericFields.map(([k])=>[k,'']))});
  const [targetIncludesExpenses,setTargetIncludesExpenses]=useState(false);
  const selectedPolicy=detail.policies.find(p=>p.id===policyId);
  const contractualTypes=[...new Set(selectedPolicy?.versions.filter(v=>v.validation_status==='validated').flatMap(v=>Array.isArray(v.contract.coverages)?v.contract.coverages.filter(c=>c&&['Vida','Salud','Dental','Catastrófico'].includes(c.type)).map(c=>c.type):[])??[])];
  const query:ScopeQuery={premiumSnapshotId,expenseSnapshotId,periods,coverages:coverages.join(',')};
  const ready=!!policyId&&!!premiumSnapshotId&&!!expenseSnapshotId&&!!periods.trim()&&coverages.length>0;
  useEffect(()=>{sequence.current++;setData(null);setRenewal(null);setReviews([]);setError('');setNotice('');setBusy(false);},[policyId,premiumSnapshotId,expenseSnapshotId,periods,coverages]);
  useEffect(()=>()=>{sequence.current++;},[]);
  async function act(fn:(current:number)=>Promise<void>){const current=++sequence.current;setBusy(true);setError('');setNotice('');try{await fn(current);}catch(e){if(sequence.current===current)setError(e instanceof Error?e.message:'No se pudo completar.');}finally{if(sequence.current===current)setBusy(false);}}
  async function load(current:number){const [d,r]=await Promise.all([fetchPolicyIndicators(policyId,query),fetchTechnicalReviews(policyId,query)]);if(current!==sequence.current)return;setData(d);setAnalysisRevision(v=>v+1);setReviews(r.reviews);setRenewal(null);}
  const cells=data?.scope.monthly.flatMap(m=>m.coverages)??[];
  const bases=[...new Set(cells.map(c=>c.expenseBasis))];
  const forecastReady=!!data&&data.scope.monthly.every(m=>m.complete&&m.coverages.every(c=>c.completenessConfirmed&&c.reconciliation==='matched'))&&bases.length===1&&bases[0]!=='undetermined';
  return <section className="contract-panel account-form policy-technical" aria-label="Indicadores por póliza">
    <h2 className="font-display text-2xl">Póliza individual · indicadores técnicos</h2>
    <p className="account-muted">Esta vista aísla una póliza y snapshots explícitos. Los reportes empresariales permanecen separados. Selecciona meses como 2026-01,2026-02.</p>
    <div className="contract-grid">
      <label>Póliza de análisis<select value={policyId} onChange={e=>{setPolicyId(e.target.value);setReview({...review,versionId:''});setCoverages([]);}}><option value="">Selecciona</option>{detail.policies.map(p=><option key={p.id} value={p.id}>{p.versions[0]?.contract.insurer} · {p.versions[0]?.contract.number}</option>)}</select></label>
      <label>Snapshot de primas<select value={premiumSnapshotId} onChange={e=>setPremium(e.target.value)}><option value="">Selecciona</option>{detail.snapshots.filter(s=>s.kind==='primas').map(s=><option key={s.id} value={s.id}>{new Date(s.created_at).toLocaleString('es-CL')} · {s.row_count} filas</option>)}</select></label>
      <label>Snapshot de gastos<select value={expenseSnapshotId} onChange={e=>setExpense(e.target.value)}><option value="">Selecciona</option>{detail.snapshots.filter(s=>s.kind==='gastos').map(s=><option key={s.id} value={s.id}>{new Date(s.created_at).toLocaleString('es-CL')} · {s.row_count} filas</option>)}</select></label>
      <label>Meses seleccionados<input value={periods} placeholder="2026-01,2026-02" onChange={e=>setPeriods(e.target.value)}/></label>
    </div>
    <fieldset><legend>Coberturas contractuales del análisis</legend>{!contractualTypes.length&&<p>Selecciona una póliza con versión contractual validada.</p>}{contractualTypes.map(c=><label key={c} className="inline-flex gap-2 mr-4"><input type="checkbox" checked={coverages.includes(c)} onChange={e=>setCoverages(e.target.checked?[...coverages,c]:coverages.filter(x=>x!==c))}/>{c}</label>)}</fieldset>
    <button className="account-primary" disabled={!ready||busy} onClick={()=>act(load)}>Consultar indicadores</button>
    {busy&&<p role="status">Consultando información verificada…</p>}{error&&<p role="alert" className="account-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {data&&<>
      {!data.reviewStorageAvailable&&<p role="alert">Falta instalar la migración local de revisiones técnicas. La base del gasto y la completitud permanecen pendientes; las proyecciones están bloqueadas.</p>}
      <p>Fuentes separadas: gasto técnico de primas y reembolsos detallados. Un reembolso no acredita por sí solo siniestros incurridos. «Sin datos» nunca equivale a cero. La calidad se refiere al mes y cobertura seleccionados; no certifica toda la empresa o vigencia.</p>
      {data.monthly.map(m=>{const scope=data.scope.monthly.find(s=>s.period===m.period)!;return <section key={m.period} className="contract-panel"><h3>{m.period} · {m.status==='blocked'?'Análisis bloqueado':'Indicadores observados'}</h3>
        <p>Referencia: {m.referencePeriod}{m.referenceOutsideSelection?' (fuera de la selección; no se agrega al período)':''}.</p>
        <div className="portfolio-table"><table><thead><tr><th>Indicador</th><th>Mes</th><th>Anterior</th></tr></thead><tbody>
          <tr><td>Prima</td><td>{fmt(m.current.premiumUf,' UF')}</td><td>{fmt(m.previous.premiumUf,' UF')}</td></tr>
          <tr><td>Gasto técnico</td><td>{fmt(m.current.technicalSpendUf,' UF')}</td><td>{fmt(m.previous.technicalSpendUf,' UF')}</td></tr>
          <tr><td>Siniestralidad</td><td>{fmt(m.current.lossRatio==null?null:m.current.lossRatio*100,'%')}</td><td>{fmt(m.previous.lossRatio==null?null:m.previous.lossRatio*100,'%')}</td></tr>
          <tr><td>Reembolso neto</td><td>{fmt(m.current.reimbursementUf,' UF')}</td><td>{fmt(m.previous.reimbursementUf,' UF')}</td></tr>
          <tr><td>Diferencia técnico − reembolsos</td><td>{fmt(m.current.differenceUf,' UF')}</td><td>{fmt(m.previous.differenceUf,' UF')}</td></tr>
          <tr><td>Exclusiones y ajustes netos del desglose</td><td>{fmt(m.current.excludedNetUf,' UF')}</td><td>{fmt(m.previous.excludedNetUf,' UF')}</td></tr>
        </tbody></table></div>
        <p>Cambio: {fmt(m.comparison.lossRatioDeltaPp,' pp')}. Efecto gasto: {fmt(m.comparison.spendEffectPp,' pp')}; efecto prima: {fmt(m.comparison.premiumEffectPp,' pp')}. Variación relativa: {fmt(m.comparison.lossRatioVariationPercent,'%')}.</p>
        {!m.attribution.available&&<p className="account-error">No atribuir cambios a coberturas: falta conciliación suficiente, base verificada o alcance comparable.</p>}
        <div className="portfolio-table"><table><thead><tr><th>Cobertura contractual</th><th>Calidad</th><th>Base del gasto</th><th>Actual UF</th><th>Anterior UF</th><th>Diferencia UF</th><th>Variación %</th><th>Participación %</th><th>Contribución pp</th><th>Conciliación</th></tr></thead><tbody>{m.coverages.map(c=>{const q=scope.coverages.find(q=>q.coverage===c.type)!;return <tr key={c.type}><td>{c.name} ({c.type})</td><td><span className={`technical-quality quality-${q.qualityStatus}`}>{QUALITY_LABELS[q.qualityStatus]}</span></td><td>Actual: {BASIS_LABELS[q.expenseBasis]} · Anterior: {BASIS_LABELS[c.previousExpenseBasis??'undetermined']}</td><td>{fmt(c.currentSpendUf)}</td><td>{fmt(c.previousSpendUf)}</td><td>{fmt(c.differenceUf)}</td><td>{fmt(c.variationPercent)}</td><td>{fmt(c.shareOfTechnicalSpendPercent)}</td><td>{fmt(c.contributionTotalPp)}</td><td>{q.reconciliation==='matched'?'Conciliado':q.reconciliation==='difference'?`Diferencia ${fmt(q.differenceUf,' UF')}`:'Sin datos'}</td></tr>;})}</tbody></table></div>
        <ul>{m.warnings.map(w=><li key={w}>{w}</li>)}</ul>
      </section>;})}
      <PolicyAnalysisPanel key={`${policyId}:${analysisRevision}:${JSON.stringify(query)}`} detail={detail} policyId={policyId} query={query}/>
      <details><summary>Incidencias de datos ({Object.values(data.scope.quality.issueCounts).reduce((a,b)=>a+b,0)})</summary>{data.scope.quality.issues.map((i,index)=><p key={index}>Fila {i.rowIndex+1} · {technicalLabel(i.reason)} · Pendiente {i.unallocatedPercent}%</p>)}<p>Las incidencias se corrigen contra las fuentes. No se prorratean meses ni se reasignan filas automáticamente.</p></details>
      <h3>Escenario técnico de renovación</h3><p>Sin tasas predeterminadas. Usa punto decimal y razones decimales para porcentajes. El resultado es una hipótesis interna, no una oferta.</p>
      {!forecastReady&&<p role="status">Proyección restringida: requiere base del gasto acreditada, completitud revisada y conciliación. Los errores de meses o coberturas también deben corregirse.</p>}
      <div className="contract-grid">{[['name','Nombre del escenario'],['version','Versión de supuestos'],['source','Referencia de supuestos'],...numericFields].map(([k,label])=><label key={k}>{label}<input value={assumptions[k]} inputMode={numericFields.some(([key])=>key===k)?'decimal':undefined} onChange={e=>{setAssumptions({...assumptions,[k]:e.target.value});setRenewal(null);}}/></label>)}</div>
      <label><input type="checkbox" checked={targetIncludesExpenses} onChange={e=>{setTargetIncludesExpenses(e.target.checked);setRenewal(null);}}/>El objetivo contempla la base de gastos y comisiones relevante</label>
      <button className="account-secondary" disabled={busy||!forecastReady||!targetIncludesExpenses||Object.values(assumptions).some(v=>!v.trim())} onClick={()=>act(async current=>{setRenewal(null);const body={...assumptions,...Object.fromEntries(numericFields.map(([k])=>[k,Number(assumptions[k])])),claimsBasis:bases[0],dataCompletenessConfirmed:true,targetIncludesExpenses};const result=await calculatePolicyRenewal(policyId,query,[body]);if(current===sequence.current)setRenewal(result);})}>Calcular escenario técnico</button>
      {renewal&&<div aria-label="Resultado de renovación">{renewal.scenarios.map((s,i)=><p key={i}>{s.status==='blocked'?`Bloqueado: ${s.reasons.map(technicalLabel).join(', ')}`:`${{increase:'Alza',maintenance:'Mantención',discount:'Descuento'}[s.result!.direction]} · Ajuste ${fmt(s.result!.adjustmentPercent,'%')} · Prima requerida ${fmt(s.result!.requiredPremiumUf,' UF')} · Gasto proyectado ${fmt(s.result!.projectedSpendUf,' UF')}`}</p>)}<p>{renewal.notice}</p></div>}
      <h3>Revisión manual y trazabilidad</h3><p>Meses parciales y duplicidad de coberturas se consideran errores de datos pendientes de corrección. Registrar una revisión no modifica sábanas ni levanta sus bloqueos.</p>
      <button className="account-secondary" onClick={onReviewAssignments}>Revisar asignaciones y fuentes</button>
      {editable&&data.reviewStorageAvailable?<fieldset><legend>Registrar revisión autorizada</legend><div className="contract-grid">
        <label>Versión contractual de revisión<select value={review.versionId} onChange={e=>setReview({...review,versionId:e.target.value})}><option value="">Selecciona</option>{selectedPolicy?.versions.filter(v=>v.validation_status==='validated').map(v=><option key={v.id} value={v.id}>v{v.revision} · {v.contract.startsOn} — {v.contract.endsOn}</option>)}</select></label>
        <label>Mes revisado<input type="month" value={review.period} onChange={e=>setReview({...review,period:e.target.value})}/></label>
        <label>Cobertura revisada<select value={review.coverage} onChange={e=>setReview({...review,coverage:e.target.value})}><option value="">Selecciona</option>{coverages.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Tipo de revisión<select value={review.review_kind} onChange={e=>{setReview({...review,review_kind:e.target.value,decision:'pending'});setEvidence(undefined);}}>{[['expense_basis','Base del gasto'],['completeness','Completitud de fuentes'],['partial_month','Error de mes parcial'],['coverage_ambiguity','Error de cobertura ambigua'],['allocation','Asignaciones']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Decisión<select value={review.decision} onChange={e=>setReview({...review,decision:e.target.value})}><option value="pending">Pendiente</option><option value="rejected">Rechazada / requiere corrección</option>{!['partial_month','coverage_ambiguity'].includes(review.review_kind)&&<option value="validated">Validada con respaldo</option>}</select></label>
        {review.review_kind==='expense_basis'&&<label>Base acreditada<select value={review.expense_basis} onChange={e=>setReview({...review,expense_basis:e.target.value})}><option value="undetermined">No determinada</option><option value="paid">Pagado</option><option value="incurred">Incurrido</option></select></label>}
        {review.review_kind==='completeness'&&<label>Completitud acreditada<select value={review.data_complete===null?'':String(review.data_complete)} onChange={e=>setReview({...review,data_complete:e.target.value===''?null:e.target.value==='true'})}><option value="">No determinada</option><option value="true">Archivo completo confirmado</option><option value="false">Archivo incompleto confirmado</option></select></label>}
      </div><label>Fundamento técnico sin datos personales<textarea value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/></label><ContractEvidence documents={detail.documents} value={evidence} onChange={setEvidence}/>
      <button className="account-secondary" disabled={busy||!review.versionId||!review.period||!review.coverage||review.note.trim().length<3||(review.decision==='validated'&&!evidence?.quote)} onClick={()=>act(async current=>{await saveTechnicalReview(policyId,query,{...review,evidence});if(current!==sequence.current)return;await load(current);if(current===sequence.current)setNotice('Revisión registrada. Se conserva el historial; los bloqueos de datos requieren corrección de fuentes.');})}>Registrar revisión</button></fieldset>:!editable&&<p>Solo el administrador puede registrar revisiones o modificar asignaciones.</p>}
      <ul aria-label="Historial de revisiones">{reviews.map(r=><li key={r.id}>#{r.id} · {r.period} · {r.coverage} · {technicalLabel(r.review_kind)} · {technicalLabel(r.decision)} · {BASIS_LABELS[r.expense_basis]} · Usuario {r.created_by} · {new Date(r.created_at).toLocaleString('es-CL')}<details><summary>Ver fundamento y respaldo</summary><p>{r.note}</p>{r.evidence&&<p>{detail.documents.find(d=>d.id===r.evidence!.documentId)?.original_name??'Documento de respaldo'} · Página {r.evidence.page}: «{r.evidence.quote}»</p>}</details></li>)}</ul>
    </>}
  </section>;
}
