import {useEffect,useRef,useState} from 'react';
import type {CompanyNarrative,NarrativeBundle,NarrativeKind} from '../../../shared/companyNarrative';
import {readCompanyAnalysis,generateCompanyAnalysis,downloadCompanyAnalysis} from '../api';
export function CompanyAnalysisView({analysis}:{analysis:CompanyNarrative}){
 return <section className="glass-panel rounded-3xl p-6 company-analysis"><h2 className="font-display text-2xl">{analysis.kind==='monthly'?`Qué pasó en ${analysis.month}`:'Conclusión ejecutiva'}</h2>
 <p className="text-sm">{analysis.source==='gemini'?`Priorizado con Gemini · ${analysis.model}`:'Análisis determinístico del backend'}</p>
 <h3 className="mt-4 font-semibold">Proyección de prima de renovación</h3><p>Proyección no disponible</p><p>{analysis.projection.reason}</p>
 <p>Prima declarada: {analysis.projection.currentPremiumUf===null?'no disponible':`${analysis.projection.currentPremiumUf.toLocaleString('es-CL',{maximumFractionDigits:2})} UF`} · Prima proyectada: no disponible · Variación: no disponible.</p>
 <h3 className="mt-4 font-semibold">Indicadores explicativos</h3><ul>{analysis.metrics.map(m=><li key={m.id}>{m.label}: {m.value===null?'no disponible':m.value.toLocaleString('es-CL',{maximumFractionDigits:2})} {m.value===null?'':m.unit} · {m.reference}</li>)}</ul>
 <h3 className="mt-4 font-semibold">{analysis.kind==='monthly'?'Lectura del mes':'Conclusión ejecutiva'}</h3>{analysis.conclusion.map((line,i)=><p key={i}>{line}</p>)}
 {analysis.kind==='conclusions'&&<><h3 className="mt-4 font-semibold">Exactamente tres acciones correctivas</h3><ol>{analysis.actions.map(a=><li key={a.id}><strong>{a.title}</strong> {a.measure} Plazo: {a.deadline}.</li>)}</ol></>}
 <p className="text-sm mt-4">{analysis.limitations.join(' ')}</p>{analysis.fallbackReason&&<p role="status">{analysis.fallbackReason}</p>}
 </section>;
}
export function useCompanyAnalysis(query:Record<string,string>,revision:number){
 const key=JSON.stringify(query),epoch=useRef(0),locked=useRef(false);
 const [values,setValues]=useState<Partial<Record<NarrativeKind,NarrativeBundle>>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const enabled=!!query.client&&!!query.periods&&!!query.coverages;
 useEffect(()=>{const generation=++epoch.current;setValues({});setError('');setBusy(false);locked.current=false;
  if(enabled)Promise.all((['monthly','conclusions'] as const).map(async kind=>[kind,await readCompanyAnalysis(kind,JSON.parse(key))] as const)).then(entries=>{if(epoch.current===generation)setValues(Object.fromEntries(entries));}).catch(()=>{if(epoch.current===generation)setError('No se pudo preparar el análisis; los reportes existentes siguen disponibles.');});
  return ()=>{epoch.current++;};
 },[key,enabled,revision]);
 async function generate(kind:NarrativeKind){if(locked.current)return;locked.current=true;const generation=epoch.current;setBusy(true);setError('');try{const result=await generateCompanyAnalysis(kind,query);if(generation===epoch.current)setValues(v=>({...v,[kind]:result}));}catch{if(generation===epoch.current)setError('Gemini no completó el análisis. Se mantiene el respaldo determinístico; no se reintenta automáticamente.');}finally{if(generation===epoch.current){locked.current=false;setBusy(false);}}}
 async function verify(){if(!values.monthly||!values.conclusions)throw Error('Espera la preparación del análisis.');const generation=epoch.current;await Promise.all((['monthly','conclusions'] as const).map(kind=>readCompanyAnalysis(kind,{...query,approvedId:values[kind]!.analysis.id})));if(generation!==epoch.current)throw Error('La selección cambió.');}
 async function excel(){await verify();return downloadCompanyAnalysis({...query,monthlyApproved:values.monthly!.analysis.id,conclusionsApproved:values.conclusions!.analysis.id});}
 return {values,busy,error,generate,verify,excel};
}
export function CompanyAnalysisControls({controller}:{controller:ReturnType<typeof useCompanyAnalysis>}){
 return <div className="no-print mt-4"><button className="account-secondary" disabled={controller.busy||!controller.values.monthly?.gemini.available} onClick={()=>void controller.generate('monthly')}>Analizar este mes con Gemini</button>{' '}
 <button className="account-secondary" disabled={controller.busy||!controller.values.conclusions?.gemini.available} onClick={()=>void controller.generate('conclusions')}>Generar conclusiones con Gemini</button>
 {controller.busy&&<p role="status">Generando análisis bajo demanda…</p>}{controller.error&&<p role="alert">{controller.error}</p>}
 {controller.values.conclusions&&!controller.values.conclusions.gemini.available&&<p>{controller.values.conclusions.gemini.reason}</p>}</div>;
}
