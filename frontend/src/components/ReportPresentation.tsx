import { PresentationDetailContext } from "./PresentationDetailContext";
import { useEffect, useRef, useState, type ReactNode } from "react";
import BrandLogo from "./BrandLogo";
import { formatReportPeriods } from "../lib/reportPeriods";
import type { ReportBranding } from "../../../shared/executive";
import { createPortal } from "react-dom";

export type ReportSlide = { id: string; title: string; content: ReactNode };
export function SlideFrame({ slide, client, periods, branding, page, total }: { slide: ReportSlide; client: string; periods: string[]; branding: ReportBranding; page: number; total: number }) {
  const area = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const measure = () => {
      if (area.current && inner.current) setScale(Math.min(1, area.current.clientHeight / Math.max(1, inner.current.scrollHeight), area.current.clientWidth / Math.max(1, inner.current.scrollWidth)));
    };
    const observer = new ResizeObserver(measure);
    if (area.current) observer.observe(area.current);
    if (inner.current) observer.observe(inner.current);
    measure(); return () => observer.disconnect();
  }, [slide.content]);
  return <article className={`report-slide ${slide.id === 'cover' ? 'slide-cover' : ''}`}>
    {slide.id !== 'cover' && <header className="slide-heading"><div><p>{client} · {formatReportPeriods(periods)}</p><h2>{slide.title}</h2></div><BrandLogo interior src={branding.interior_logo}/></header>}
    <div className="slide-body" ref={area}><div ref={inner} style={{transform:`scale(${scale})`,transformOrigin:'top left'}}>{slide.content}</div></div>
    <footer className="slide-footer"><span>NOERGON · Analítica de siniestralidad</span><span>{String(page).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></footer>
  </article>;
}
export function ReportDeck({ slides, client, periods, branding }: { slides:ReportSlide[];client:string;periods:string[];branding:ReportBranding }) {
  return <div className="pdf-deck">{slides.map((slide,i)=><SlideFrame key={slide.id} slide={slide} client={client} periods={periods} branding={branding} page={i+1} total={slides.length}/>)}</div>;
}
export default function ReportPresentation({ slides, client, periods, branding, onExport, onClose }: {
  slides: ReportSlide[]; client: string; periods: string[]; branding: ReportBranding; onExport: () => void; onClose: () => void;
}) {
  const [detailTarget, setDetailTarget] = useState<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const resize = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setZoom(Math.max(0.01, Math.min(width / 1280, height / 720)));
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, []);
  const dialog = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const current = Math.min(index, slides.length - 1);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key === "Tab") {
        const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, a[href], input, [tabindex="0"]') ?? [])];
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if ((event.target as HTMLElement)?.closest("input, select, textarea, [contenteditable=true]")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex(value => Math.min(value + 1, slides.length - 1)); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex(value => Math.max(value - 1, 0)); }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      document.body.style.overflow = overflow;
      if (root) root.inert = wasInert ?? false;
      previousFocus?.focus();
    };
  }, [slides.length]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [current]);
  if (!slides.length) return null;
  const sorted = [...periods].sort();
  return createPortal(<PresentationDetailContext.Provider value={detailTarget}><div ref={dialog} className="report-presentation account-ui no-print" role="dialog" aria-modal="true" aria-labelledby="presentation-title">
    <header className="presentation-header">
      <div><p className="account-eyebrow">Presentación · {client}</p><h1 id="presentation-title" className="font-display text-2xl">{slides[current].title}</h1><p className="account-muted text-sm">{sorted[0]} a {sorted[sorted.length - 1]}</p></div>
      <button className="account-secondary" onClick={onExport}>Exportar PDF 16:9</button><button ref={closeButton} className="account-secondary" onClick={onClose}>Salir de presentación</button>
    </header>
    <div ref={content} className="presentation-content"><div style={{width:1280*zoom,height:720*zoom}}><div style={{width:1280,transform:`scale(${zoom})`,transformOrigin:"top left"}}><SlideFrame key={slides[current].id} slide={slides[current]} client={client} periods={periods} branding={branding} page={current+1} total={slides.length}/></div></div><div ref={setDetailTarget} className="presentation-detail-host" /></div>
    <nav className="presentation-controls" aria-label="Navegación de presentación">
      <button className="account-secondary" disabled={current === 0} onClick={() => setIndex(current - 1)}>← Anterior</button>
      <label><span className="sr-only">Ir a una tarjeta</span><select value={current} onChange={event => setIndex(Number(event.target.value))}>{slides.map((slide, position) => <option key={slide.id} value={position}>{position + 1}. {slide.title}</option>)}</select></label>
      <span role="status" aria-live="polite">{current + 1} / {slides.length}</span>
      <button className="account-primary" disabled={current === slides.length - 1} onClick={() => setIndex(current + 1)}>Siguiente →</button>
      <span className="account-muted text-xs">← → para avanzar · Esc para salir</span>
    </nav>
  </div></PresentationDetailContext.Provider>, document.body);
}
