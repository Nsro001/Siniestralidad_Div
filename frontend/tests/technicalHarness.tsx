import React from 'react';
import {createRoot} from 'react-dom/client';
import PolicyTechnicalPanel from '../src/components/PolicyTechnicalPanel';
import ExecutiveSummary from '../src/components/ExecutiveSummary';
import PrimasCharts from '../src/components/PrimasCharts';
import PortfolioReconciliation from '../src/components/PortfolioReconciliation';
import type {PortfolioDetail} from '../../shared/portfolio';
import '../src/noergon-tokens.css';import '../src/styles.css';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const detail={client:{id:id(11),name:'Empresa sintética'},policies:[{id:id(21),versions:[{id:id(31),revision:1,validation_status:'validated',contract:{number:'001',insurer:'Aseguradora sintética',startsOn:'2026-01-01',endsOn:'2026-12-31',coverages:[{type:'Salud'}]}}]}],
 snapshots:[{id:id(41),kind:'primas',created_at:'2026-01-01T00:00:00Z',row_count:5},{id:id(42),kind:'gastos',created_at:'2026-01-01T00:00:00Z',row_count:50}],documents:[],audit:[],movements:[]} as unknown as PortfolioDetail;
const w=window as any;w.__technicalCalls=[];w.__verifiedTechnical=false;w.__technicalReviews=[];
const totals=(valid:boolean)=>({premiumUf:valid?100:null,technicalSpendUf:valid?80:null,lossRatio:valid?.8:null,reimbursementUf:valid?(w.__verifiedTechnical?80:70):null,differenceUf:valid?(w.__verifiedTechnical?0:10):null,excludedNetUf:valid?-2:null});
w.__analysisSource='deterministic';w.__printCalls=0;
window.print=()=>{w.__printCalls++;w.__policyPdfText=document.querySelector('.pdf-deck')?.textContent;w.__policyPdfHtml=document.querySelector('.pdf-deck')?.outerHTML;};
function analysis(url:URL,kind:'monthly'|'conclusions') {
 const available=w.__verifiedTechnical,source=w.__analysisSource,periods=(url.searchParams.get('periods')??'').split(',');
 return {status:available?'available':'blocked',kind,source,persisted:source==='simulated',reason:available?null:'unverified_or_unreconciled_scope',checkedAt:new Date().toISOString(),expiresAt:source==='simulated'?new Date(Date.now()+(w.__analysisTTL??60000)).toISOString():null,contextHash:'synthetic',
 scope:{clientId:id(11),clientName:'Empresa sintética',policyId:id(21),number:'001',insurer:'Aseguradora sintética',periods,coverages:['Salud'],versions:[id(31)],premiumSnapshotId:id(41),expenseSnapshotId:id(42)},
 sections:available?(kind==='monthly'?[{title:'Análisis técnico mensual',text:'Salud: gasto 80 UF frente a 60 UF. Diferencia 20 UF; efecto gasto 20 pp, prima 0 pp. Revisar condiciones sin modificar beneficios.',references:[]}]:[{title:'Resultado técnico del período',text:`Prima ${periods.length*100} UF; gasto técnico pagado ${periods.length*80} UF; siniestralidad 80%.`,references:[]},{title:'Variación y coberturas',text:'Salud aumenta 20 UF y aporta 20 puntos porcentuales.',references:[]},{title:'Acciones y alcance de renovación',text:'Revisar condiciones de Salud por aumento verificado de 20 UF. Sin supuestos no se proyecta renovación.',references:[]}]):[],
 quality:periods.map(period=>({period,coverage:'Salud',status:available?'complete':'pending_validation',expenseBasis:available?'paid':'undetermined',reconciliation:available?'matched':'difference'}))};
}
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname.replace(/^\/api/,'');
 const body=init?.body?JSON.parse(String(init.body)):null;w.__technicalCalls.push({path,body,query:url.search,method:init?.method??'GET'});let data:unknown;
 if(path.includes('/analysis/')){
  if(path.endsWith('/export')){const response=await window.fetch(`/api/report/policies/${id(21)}/monthly${url.search}`);const indicators=await response.json();const month=url.searchParams.get('month');const monthUrl=new URL(url);if(month)monthUrl.searchParams.set('periods',month);data={analysis:analysis(url,'conclusions'),monthly:month?analysis(monthUrl,'monthly'):null,indicators};}
  else data=analysis(url,path.endsWith('/conclusions')?'conclusions':'monthly');
 }else if(path==='/report/branding')data={broker_name:'NOERGON',broker_logo:null,client_logo:null,interior_logo:null,kam_name:'Equipo sintético'};
 else if(path.endsWith('/monthly')){
  const statuses=['complete','incomplete','partial','ambiguous','pending_validation'];
  data={reviewStorageAvailable:true,scope:{monthly:statuses.map((status,i)=>({period:`2026-0${i+1}`,complete:w.__verifiedTechnical||i===0,
    coverages:[{coverage:'Salud',qualityStatus:w.__verifiedTechnical?'complete':status,expenseBasis:w.__verifiedTechnical||i===0?'paid':'undetermined',completenessConfirmed:w.__verifiedTechnical||i===0,reconciliation:w.__verifiedTechnical?'matched':i===0?'difference':'unavailable',differenceUf:i===0?10:null,premiumUf:w.__verifiedTechnical?100:null,lossRatio:w.__verifiedTechnical?.8:null}]})),quality:{issueCounts:{missing_policy_number:1},issues:[{rowIndex:2,reason:'missing_policy_number',unallocatedPercent:100}]}},
   monthly:statuses.map((status,i)=>({period:`2026-0${i+1}`,referencePeriod:i===0?'2025-12':`2026-0${i}`,referenceOutsideSelection:i===0,status:w.__verifiedTechnical||i===0?'available':'blocked',current:totals(w.__verifiedTechnical||i===0),previous:w.__verifiedTechnical?{...totals(true),technicalSpendUf:60,reimbursementUf:60,lossRatio:.6,differenceUf:0}:totals(true),comparison:{lossRatioDeltaPp:w.__verifiedTechnical?20:0,spendEffectPp:w.__verifiedTechnical?20:0,premiumEffectPp:0,lossRatioVariationPercent:w.__verifiedTechnical?33.33:0},attribution:{available:w.__verifiedTechnical},warnings:['Las líneas de reembolso no son atenciones únicas.'],
    coverages:[{type:'Salud',name:'Salud colectivo',currentSpendUf:w.__verifiedTechnical||i===0?80:null,previousSpendUf:w.__verifiedTechnical?60:80,differenceUf:w.__verifiedTechnical?20:i===0?0:null,variationPercent:w.__verifiedTechnical?33.33:i===0?0:null,shareOfTechnicalSpendPercent:w.__verifiedTechnical||i===0?100:null,contributionTotalPp:w.__verifiedTechnical?20:null}]}))};
 }else if(path.endsWith('/renewal-scenarios'))data={reviewStorageAvailable:true,blockedReasons:[],scenarios:[{status:'available',reasons:[],result:{direction:'maintenance',adjustmentPercent:0,requiredPremiumUf:1200,projectedSpendUf:960}}],notice:'Escenario técnico interno, no oferta de aseguradora.'};
 else if(path.startsWith('/portfolio/manage/snapshots/'))data={id:id(41),offset:0,total:1,rows:[{period:'2026-01',policy:'001',coverage:'Salud',premiumUf:100}],links:w.__removedLink?[]:[{snapshot_id:id(41),row_index:0,policy_id:id(21),policy_version_id:id(31),coverage:'Salud',allocation_percent:100}]};
 else if(path==='/portfolio/manage/links/remove'){w.__removedLink=true;w.__removedLinkBody=body;data={status:'ok'};}
 else if(path.endsWith('/reviews')){if(init?.method==='POST'){w.__technicalReviews.push({...body,id:w.__technicalReviews.length+1,created_by:id(1),created_at:'2026-11-05T00:00:00Z'});data={id:w.__technicalReviews.length};}else data={reviews:w.__technicalReviews,reviewStorageAvailable:true};}
 else throw new Error(`Solicitud no simulada: ${path}`);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
const companyReport={series:[{coverage:'Salud',series:[{period:'2026-01',premiumUf:100,spendUf:0,lossRatio:0},{period:'2026-02',premiumUf:null,spendUf:null,lossRatio:null}]}]};
createRoot(document.getElementById('root')!).render(<div className="account-ui accounts-page">{new URLSearchParams(location.search).get('view')==='company'?<><p>Consolidado empresarial</p><ExecutiveSummary report={companyReport} claimants={null} periods={['2026-01','2026-02']}/><PrimasCharts report={companyReport} client="Empresa sintética"/></>:new URLSearchParams(location.search).get('view')==='assignments'?<PortfolioReconciliation detail={detail} editable={new URLSearchParams(location.search).get('role')!=='executive'} onUpdated={()=>{}}/>:<PolicyTechnicalPanel detail={detail} editable={new URLSearchParams(location.search).get('role')!=='executive'} onReviewAssignments={()=>{w.__assignmentReviewOpened=true;}}/>}</div>);
