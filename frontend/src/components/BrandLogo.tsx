export default function BrandLogo({ src, interior = false }: { src?: string | null; interior?: boolean }) {
  return src ? <img className="brand-custom" src={src} alt="Logo corporativo" /> : <span role="img" aria-label="NOERGON · Creamos sistemas que potencian negocios" className={`brand-default ${interior ? 'brand-interior' : ''}`} />;
}
