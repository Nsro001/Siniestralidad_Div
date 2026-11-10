import { useEffect, useState } from 'react';
import type { PolicyAnalysis } from '../../../shared/analysis';
const reasons:Record<string,string>={unverified_or_unreconciled_scope:'Calidad, completitud, base del gasto o conciliación pendientes de verificación.',privacy_threshold_not_met:'Anonimización insuficiente: agrupación pequeña, concentración o identidades no verificables.',monthly_requires_one_period:'Selecciona exactamente un mes.',expense_basis_changed:'Las bases del gasto son diferentes y no se pueden interpretar conjuntamente.',renewal_assumptions_or_data_missing:'Faltan datos o supuestos de renovación verificados.'};
export default function PolicyAnalysisView({analysis,sectionIndex}:{analysis:PolicyAnalysis;sectionIndex?:number}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{setNow(Date.now());if(!analysis.expiresAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[analysis]);
  const expired=!!analysis.expiresAt&&!(Date.parse(analysis.expiresAt)>now);
  const allowed=!expired&&analysis.status==='available'&&analysis.source!=='real'&&(analysis.kind!=='conclusions'||analysis.sections.length===3);
  return <section className="analysis-result contract-panel" aria-label={analysis.kind==='monthly'?'Análisis mensual':'Tres conclusiones ejecutivas'}>
    <h3>{analysis.kind==='monthly'?'Análisis técnico mensual':'Tres conclusiones ejecutivas'}</h3>
    <span className={`analysis-origin origin-${analysis.source}`}>{analysis.source==='simulated'?'Simulado · no es IA real':analysis.source==='real'?'IA real · no habilitada':'Análisis determinista · sin IA'}</span>
    <p className="analysis-scope">Póliza individual · {analysis.scope.clientName} · {analysis.scope.insurer} · Póliza {analysis.scope.number} · {analysis.scope.periods.join(', ')} · {analysis.scope.coverages.join(', ')}.</p>
    <p className="account-muted">Versiones contractuales: {analysis.scope.versions.join(', ')||'No determinadas'}. {analysis.persisted?'Resultado persistido y revalidado.':'Calculado con indicadores verificados; sin consumo de tokens.'}</p>
    {!allowed?<p role="status">Análisis bloqueado: {expired?'El resultado almacenado expiró. Solicita una nueva comprobación.':(reasons[analysis.reason??'']??'No existe un resultado válido y autorizado para este alcance.')} No se generan conclusiones.</p>:<ol className="analysis-conclusions" start={sectionIndex===undefined?1:sectionIndex+1}>{(sectionIndex===undefined?analysis.sections:analysis.sections.slice(sectionIndex,sectionIndex+1)).map((s,i)=><li key={i}><h4>{s.title}</h4><p>{s.text}</p></li>)}</ol>}
    <p className="account-muted">Última comprobación: {new Date(analysis.checkedAt).toLocaleString('es-CL')}{analysis.expiresAt?` · Vigente hasta ${new Date(analysis.expiresAt).toLocaleString('es-CL')}`:''}.</p>
    <ul className="analysis-quality" aria-label="Calidad del análisis">{analysis.quality.map((q,i)=><li key={i}>{q.period} · {q.coverage} · {q.status==='complete'?'Completo':'Pendiente / revisar datos'} · Base {q.expenseBasis==='paid'?'pagada':q.expenseBasis==='incurred'?'incurrida':'no determinada'} · {q.reconciliation==='matched'?'Conciliado':'Conciliación insuficiente'}</li>)}</ul>
  </section>;
}
