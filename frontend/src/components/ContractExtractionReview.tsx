import { isExcludedContractCandidate } from "../../../shared/contractPolicy.mjs";
import { useEffect, useState } from 'react';
import type { ContractCandidate, DocumentTable, EvidenceRegion, PolicyDocument } from '../../../shared/portfolio';
import { openPolicyOriginal, previewPolicyPage } from '../api';
import TariffReviewTable from "./TariffReviewTable";
import { conditionLabels } from '../lib/contractCandidates';
function rawRows(table:DocumentTable,onInspect:(page:number,region:EvidenceRegion,quote:string)=>void) {
  const height=Math.max(0,...table.cells.map(c=>c.row+c.rowSpan));
  const width=Math.max(0,...table.cells.map(c=>c.column+c.columnSpan));
  if(height>300||width>30)return <tr><td>Vista extensa: consulta el texto íntegro de la página para revisar todas las filas.</td></tr>;
  return Array.from({length:height},(_,row)=>{
    const rendered=[];
    for(let column=0;column<width;column++){
      const cell=table.cells.find(c=>c.row===row&&c.column===column);
      if(cell){rendered.push(<td key={column} rowSpan={cell.rowSpan} colSpan={cell.columnSpan}><button style={{whiteSpace:'pre-wrap'}} className="portfolio-link" type="button" onClick={()=>onInspect(table.page,cell.region,cell.quote)}>{cell.text||'—'}</button></td>);column+=cell.columnSpan-1;}
      else if(!table.cells.some(c=>c.row<=row&&c.row+c.rowSpan>row&&c.column<=column&&c.column+c.columnSpan>column))rendered.push(<td key={column}/>);
    }
    return <tr key={row}>{rendered}</tr>;
  });
}
export default function ContractExtractionReview({document,editable,password,onApply}:{document:PolicyDocument;editable:boolean;password:string;onApply:(document:PolicyDocument)=>void}) {
  const [candidates,setCandidates]=useState<ContractCandidate[]>([]);
  const [coverage,setCoverage]=useState(''),[plan,setPlan]=useState(''),[references,setReferences]=useState(false);
  const [focus,setFocus]=useState<{page:number;region?:EvidenceRegion;quote:string}|null>(null);
  const [image,setImage]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{setCandidates(document.pages.flatMap(p=>p.contractCandidates??[]).filter(c=>!isExcludedContractCandidate(c)));setFocus(null);},[document]);
  useEffect(()=>{
    if(!focus){setImage('');return;}
    let live=true,url='';setLoading(true);setImage('');setError('');
    previewPolicyPage(document.id,focus.page,password).then(blob=>{if(live){url=URL.createObjectURL(blob);setImage(url);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[document.id,focus]);
  if(!candidates.length&&!document.pages.some(p=>p.benefitTables?.length))return null;
  const shown=candidates.filter(c=>(!coverage||c.coverage===coverage)&&(!plan||c.plan===plan)&&(references||c.eligibility!=='reference'));
  const update=(id:string,patch:Partial<ContractCandidate>)=>setCandidates(old=>old.map(c=>c.id===id?{...c,...patch}:c));
  const ambiguous=candidates.filter(c=>c.eligibility!=='reference'&&(!c.coverage||!c.plan||c.warnings.length&&!c.reviewed));
  const inspect=(c:ContractCandidate)=>setFocus({page:c.page,region:c.region,quote:c.quote});
  return <section className="contract-extraction-review account-form">
    <h3>Condiciones por cobertura y plan</h3>
    <p>{candidates.length} condiciones propuestas · {ambiguous.length} con revisión pendiente. Se conservan las unidades y los límites compartidos; no se confirma el contrato al incorporar un borrador.</p>
    {document.pages.flatMap(p=>(p.extractionWarnings??[]).map((w,i)=><p className="condition-warning" key={`${p.page}:${i}`}>Página {p.page}: {w}</p>))}
    <div className="contract-grid">
      <label>Filtrar cobertura<select value={coverage} onChange={e=>{setCoverage(e.target.value);setPlan('');}}><option value="">Todas</option>{['Vida','Salud','Dental','Catastrófico'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Filtrar plan<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="">Todos</option>{[...new Set(candidates.filter(c=>!coverage||c.coverage===coverage).map(c=>c.plan))].filter(Boolean).map(v=><option key={v}>{v}</option>)}</select></label>
      <label><input type="checkbox" checked={references} onChange={e=>setReferences(e.target.checked)}/>Mostrar referencias generales y exclusiones sin asociación confirmada</label>
    </div>
    <TariffReviewTable candidates={shown.filter(c=>!!c.tariff)} editable={editable} onChange={update} onInspect={inspect}/>
    <div className="portfolio-table condition-review-table"><table><thead><tr><th>Cobertura / plan / grupos</th><th>Prestación / campo</th><th>Valor y unidad</th><th>Ámbito / período</th><th>Revisión y evidencia</th></tr></thead><tbody>{shown.map(c=><tr key={c.id} data-candidate={c.id}>
      <td><select aria-label="Cobertura de condición" disabled={!editable||c.eligibility==='reference'} value={c.coverage??''} onChange={e=>update(c.id,{coverage:(e.target.value||null) as ContractCandidate['coverage'],reviewed:false})}><option value="">Sin identificar</option>{['Vida','Salud','Dental','Catastrófico'].map(v=><option key={v}>{v}</option>)}</select><input aria-label="Plan de condición" disabled={!editable} value={c.plan} onChange={e=>update(c.id,{plan:e.target.value,reviewed:false})}/><textarea aria-label="Grupos de condición" disabled={!editable} value={c.groups.join('\n')} onChange={e=>update(c.id,{groups:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean),reviewed:false})}/></td>
      <td><input aria-label="Prestación extraída" disabled={!editable} value={c.benefit} onChange={e=>update(c.id,{benefit:e.target.value,reviewed:false})}/><small>{conditionLabels[c.kind]} · {c.eligibility==='benefit'?'Beneficio propuesto':c.eligibility==='reference'?'Referencia: no se incorpora':'Restricción contractual'}</small></td>
      <td><textarea aria-label="Valor extraído" disabled={!editable} value={c.value} onChange={e=>update(c.id,{value:e.target.value,reviewed:false})}/><input aria-label="Unidad extraída" disabled={!editable} value={c.unit} onChange={e=>update(c.id,{unit:e.target.value,reviewed:false})}/>{c.alternatives.length>1&&<p>Alternativas conservadas: {c.alternatives.join(' / ')}</p>}</td>
      <td><input aria-label="Ámbito extraído" disabled={!editable} value={c.scope} onChange={e=>update(c.id,{scope:e.target.value,reviewed:false})}/><input aria-label="Período extraído" disabled={!editable} value={c.period} onChange={e=>update(c.id,{period:e.target.value,reviewed:false})}/></td>
      <td><button className="portfolio-link" type="button" onClick={()=>inspect(c)}>Ver evidencia · pág. {c.page}</button>{c.warnings.map((w,i)=><p className="condition-warning" key={i}>{w}</p>)}{c.notes.length>0&&<details><summary>Notas y contexto ({c.notes.length})</summary>{c.notes.map((n,i)=><p key={i}>{n}</p>)}</details>}{editable&&c.eligibility!=='reference'&&<label><input type="checkbox" checked={c.reviewed??false} onChange={e=>update(c.id,{reviewed:e.target.checked})}/>Ambigüedad revisada</label>}</td>
    </tr>)}</tbody></table></div>
    {editable&&<button type="button" className="account-primary" disabled={!document.client_id} onClick={()=>onApply({...document,pages:document.pages.map(p=>({...p,contractCandidates:candidates.filter(c=>c.page===p.page)}))})}>Incorporar condiciones al borrador</button>}
    {!document.client_id&&<p>Guarda o selecciona el cliente y asocia el documento antes de incorporar condiciones.</p>}
    {focus&&<aside className="condition-pdf-viewer"><h4>Visor del PDF · página {focus.page}</h4><button className="account-secondary" type="button" onClick={async()=>{try{const original=await openPolicyOriginal(document.id);window.open(`${original.url}#page=${focus.page}`,'_blank','noopener,noreferrer');}catch(e){setError((e as Error).message);}}}>Abrir página original</button>{loading&&<p role="status">Renderizando página localmente…</p>}{error&&<p role="alert">{error}</p>}{image&&<div className="condition-pdf-page"><img src={image} alt={`Página ${focus.page} del PDF original`}/>{focus.region&&<span className="condition-region" aria-label="Región de evidencia" style={{left:`${focus.region.x*100}%`,top:`${focus.region.y*100}%`,width:`${focus.region.width*100}%`,height:`${focus.region.height*100}%`}}/>}</div>}<blockquote>{focus.quote}</blockquote></aside>}
    <details><summary>Tablas originales, encabezados y celdas combinadas</summary>{document.pages.flatMap(p=>(p.benefitTables??[]).map(t=><section key={t.id}><h4>Página {p.page} · {t.id}</h4><p>{t.headers.join(' · ')}</p>{t.warnings.map((w,i)=><p key={i}>{w}</p>)}<div className="portfolio-table"><table><tbody>{rawRows(t,(page,region,quote)=>setFocus({page,region,quote}))}</tbody></table></div>{t.notes.map((note,i)=><p key={i}>{note}</p>)}</section>))}</details>
  </section>;
}
