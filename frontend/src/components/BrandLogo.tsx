/** Marca NOERGON proporcionada por el usuario, compartida por vista, PDF y presentación. */
export default function BrandLogo({ src, interior = false }: { src?: string | null; interior?: boolean }) {
  return <img
    className={src ? "brand-custom" : `brand-default ${interior ? "brand-interior" : ""}`}
    src={src || "/noergon-brand.png"}
    alt={src ? "Logo corporativo" : "NOERGON · Creamos sistemas que potencian negocios"}
    decoding="async"
  />;
}
