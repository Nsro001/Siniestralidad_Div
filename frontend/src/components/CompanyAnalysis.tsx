import {useEffect,useRef,useState} from 'react';
import type {CompanyNarrative,NarrativeBundle,NarrativeKind} from '../../../shared/companyNarrative';
import {readCompanyAnalysis,generateCompanyAnalysis,downloadCompanyAnalysis} from '../api';
const fmt=(v:number|null|undefined)=>v==null?'no disponible':v.toLocaleString('es-CL',{maximumFractionDigits:2});
export function CompanyAnalysisView({analysis}:{analysis:CompanyNarrative}){
 const monthly=analysis.kind==='monthly',p=analysis.projection;
 return <section className="glass-panel rounded-3xl p-6 company-analysis"><h2 className="font-display text-2xl">{monthly?`Qué pasó en ${analysis.month}`:'Conclusiones y renovación'}</h2>
 <h3 className="mt-4 font-semibold">{monthly?'Tres impactos del mes':'Tres conclusiones del período'}</h3>
 {monthly?<ol data-testid="monthly-impacts">{analysis.metrics.slice(0,3).map(m=><li key={m.id}><strong>{m.label}: {fmt(m.value)} {m.value===null?'':m.unit}</strong> · {m.reference}</li>)}</ol>:<ol data-testid="executive-conclusions">{analysis.conclusion.slice(0,3).map((line,i)=><li key={i}>{line}</li>)}</ol>}
 {!monthly&&<><h3 className="mt-4 font-semibold">Proyección de prima de renovación</h3>
 <p><strong>{p.available?`${p.variationPercent!>0?'Incremento':p.variationPercent!<0?'Decremento':'Sin variación'}: ${fmt(p.variationPercent)} % · ${fmt(p.variationUf)} UF`:'Proyección no disponible'}</strong></p>
 <p>Prima del período: {fmt(p.currentPremiumUf)} UF · Prima del escenario: {fmt(p.projectedPremiumUf)} UF.</p><p className="text-sm">{p.reason}</p></>}
 <h3 className="mt-4 font-semibold">Tres acciones correctivas</h3><ol data-testid="corrective-actions">{analysis.actions.slice(0,3).map(a=><li key={a.id}><strong>{a.title}</strong> {a.measure} Plazo: {a.deadline}.</li>)}</ol>
 <p className="text-sm mt-4">Las variaciones describen los datos, no prueban causalidad. El 75 % es un objetivo técnico solicitado, no el punto de equilibrio contractual de la aseguradora.</p>{analysis.fallbackReason&&<p role="status">{analysis.fallbackReason}</p>}
 </section>;
}
export function useCompanyAnalysis(query:Record<string,string>,revision:number){
 const key=JSON.stringify(query),epoch=useRef(0),locked=useRef(false);
 const [values,setValues]=useState<Partial<Record<NarrativeKind,NarrativeBundle>>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const enabled=!!query.client&&!!query.periods&&!!query.coverages;
 useEffect(()=>{const generation=++epoch.current;setValues({});setError('');setBusy(false);locked.current=false;
  if(enabled)Promise.all((['conclusions'] as const).map(async kind=>[kind,await readCompanyAnalysis(kind,JSON.parse(key))] as const)).then(entries=>{if(epoch.current===generation)setValues(Object.fromEntries(entries));}).catch(()=>{if(epoch.current===generation)setError('No se pudo preparar el análisis; los reportes existentes siguen disponibles.');});
  return ()=>{epoch.current++;};
 },[key,enabled,revision]);
 async function generate(kind:NarrativeKind){if(locked.current)return;locked.current=true;const generation=epoch.current;setBusy(true);setError('');try{const result=await generateCompanyAnalysis(kind,query);if(generation===epoch.current)setValues(v=>({...v,[kind]:result}));}catch{if(generation===epoch.current)setError('Gemini no completó el análisis. Se mantiene el respaldo determinístico; no se reintenta automáticamente.');}finally{if(generation===epoch.current){locked.current=false;setBusy(false);}}}
 async function verify(){if(!values.conclusions)throw Error('Espera la preparación del análisis.');const generation=epoch.current;await Promise.all((['conclusions'] as const).map(kind=>readCompanyAnalysis(kind,{...query,approvedId:values[kind]!.analysis.id})));if(generation!==epoch.current)throw Error('La selección cambió.');}
 async function excel(){await verify();return downloadCompanyAnalysis({...query,conclusionsApproved:values.conclusions!.analysis.id});}
 return {values,busy,error,generate,verify,excel};
}
export function CompanyAnalysisControls({controller}:{controller:ReturnType<typeof useCompanyAnalysis>}){
 const available=controller.values.monthly?.gemini.available || controller.values.conclusions?.gemini.available;
 if(!available)return controller.error?<p role="alert">{controller.error}</p>:null;
 return <div className="no-print mt-4">
 <button className="account-secondary" disabled={controller.busy||!controller.values.conclusions?.gemini.available} onClick={()=>void controller.generate('conclusions')}>Generar conclusiones con Gemini</button>
 {controller.busy&&<p role="status">Generando análisis bajo demanda…</p>}{controller.error&&<p role="alert">{controller.error}</p>}
 {controller.values.conclusions&&!controller.values.conclusions.gemini.available&&<p>{controller.values.conclusions.gemini.reason}</p>}</div>;
}
