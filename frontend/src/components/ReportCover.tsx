import type { ReportBranding } from '../../../shared/executive';
export default function ReportCover({ client, coverages, periods, branding, generated }: { client:string;coverages:string[];periods:string[];branding:ReportBranding;generated:Date }) {
  const sorted=[...periods].sort();
  const consolidated=coverages.includes('Consolidado S+D+C');
  const subtitle=consolidated ? ['Salud','Dental','Catastrófico',...coverages.filter(c=>!['Consolidado S+D+C','Salud','Dental','Catastrófico'].includes(c))].join(' + ') : coverages.join(' + ');
  const continuous = sorted.length > 0 && (Number(sorted.at(-1)!.slice(0,4))*12+Number(sorted.at(-1)!.slice(5)))-(Number(sorted[0].slice(0,4))*12+Number(sorted[0].slice(5)))+1===sorted.length;
  return <section className="report-cover print-only" aria-label="Portada del informe">
    <div className="cover-logos"><div>{branding.broker_logo&&<img src={branding.broker_logo} alt="Logo del corredor"/>}<p>{branding.broker_name || 'Corredora no registrada'}</p></div><div>{branding.client_logo&&<img src={branding.client_logo} alt={`Logo de ${client}`}/>}</div></div>
    <div className="cover-title"><p>Informe de Siniestralidad</p><h1>{client}</h1><h2>{subtitle}</h2></div>
    <dl><dt>Período analizado</dt><dd>{continuous ? `${sorted[0]} a ${sorted.at(-1)}` : sorted.join(' · ')}</dd><dt>Fecha de generación</dt><dd>{generated.toLocaleDateString('es-CL',{timeZone:'America/Santiago'})}</dd><dt>KAM a cargo</dt><dd>{branding.kam_name}</dd></dl>
    <footer><strong>NOERGON</strong><span>Proveedor tecnológico</span></footer>
  </section>;
}
