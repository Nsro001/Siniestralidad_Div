// Fixtures sintéticos para verificar la marca oficial junto a logos configurables.
import {createRoot} from 'react-dom/client';
import ReportCover from '../src/components/ReportCover';
import {ReportDeck} from '../src/components/ReportPresentation';
import '../src/noergon-tokens.css';
import '../src/styles.css';
const branding={broker_name:'Corredora de prueba',broker_logo:'/logo.png',client_logo:'/logo.png',interior_logo:'/logo.png',kam_name:'Ejecutivo de prueba'};
const client='Cliente de prueba',periods=['2025-01','2025-02'];
const slides=[{id:'cover',title:'Portada',content:<ReportCover client={client} periods={periods} coverages={['Salud','Dental']} branding={branding} generated={new Date('2026-10-30T12:00:00Z')}/>},{id:'summary',title:'Resumen ejecutivo de prueba',content:<p>Reporte sintético para verificar logo, proporciones y exportación PDF.</p>}];
createRoot(document.getElementById('root')!).render(<ReportDeck slides={slides} client={client} periods={periods} branding={branding}/>);
