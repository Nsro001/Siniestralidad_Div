import { useEffect, useState } from 'react';
import { fetchBranding, saveBranding } from '../api';
import type { ReportBranding } from '../../../shared/executive';
export default function ReportBrandingAdmin({ clients }: { clients: Array<{id:string;name:string}> }) {
  const [client, setClient] = useState('');
  return <section className="glass-panel account-card mt-6"><h2 className="font-display text-xl">Portada del reporte por cliente</h2>
    <label>Empresa <select value={client} onChange={e=>setClient(e.target.value)}><option value="">Selecciona cliente</option>{clients.map(c=><option key={c.id}>{c.name}</option>)}</select></label>
    {client && <BrandingForm key={client} client={client} />}
  </section>;
}
function BrandingForm({ client }: {client:string}) {
  const [value,setValue] = useState<ReportBranding | null>(null);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(()=>{let cancelled=false; fetchBranding(client).then(v=>{if(!cancelled)setValue(v);}).catch(e=>{if(!cancelled)setNotice(e.message);});return()=>{cancelled=true;};},[client]);
  async function read(file:File, key:'broker_logo'|'client_logo') {
    setBusy(true);setNotice('');
    try {
      if (!['image/png','image/jpeg'].includes(file.type) || file.size > 500*1024) throw new Error('Usa PNG o JPEG de hasta 500 KB.');
      const data = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('No se pudo leer el logo.'));r.readAsDataURL(file);});
      const img = new Image(); img.src=data; await img.decode();
      if (img.width > 4096 || img.height > 4096) throw new Error('El logo debe medir como máximo 4096 píxeles por lado.');
      setValue(v=>v ? {...v,[key]:data}:v);
    } catch(e) {setNotice(e instanceof Error ? e.message:'No se pudo cargar el logo.');} finally {setBusy(false);}
  }
  return <form className="account-form mt-4" onSubmit={async e=>{e.preventDefault();if(!value)return;setBusy(true);setNotice('');try{await saveBranding(client,value);setNotice('Portada guardada.');}catch(e){setNotice(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}}}>
    {value && <><label>Nombre de la corredora<input maxLength={120} disabled={busy} value={value.broker_name} onChange={e=>setValue({...value,broker_name:e.target.value})}/></label>
    {(['broker_logo','client_logo'] as const).map(key=><div key={key}><label>{key==='broker_logo'?'Logo del corredor':'Logo del cliente'}<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f,key);}}/></label>{value[key]&&<><img src={value[key]!} alt="Vista previa del logo" style={{maxWidth:200,maxHeight:80,objectFit:'contain'}}/><button type="button" disabled={busy} onClick={()=>setValue({...value,[key]:null})}>Quitar logo</button></>}</div>)}
    <p className="account-muted">PNG/JPEG hasta 500 KB. Configuración independiente por cliente. KAM: {value.kam_name}, obtenido de la cartera.</p><button className="account-primary" disabled={busy}>Guardar portada</button></>}
    {notice&&<p role="status">{notice}</p>}
  </form>;
}
