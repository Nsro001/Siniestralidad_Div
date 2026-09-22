import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ReportSlide = { id: string; title: string; content: ReactNode };
export default function ReportPresentation({ slides, client, periods, onClose }: {
  slides: ReportSlide[]; client: string; periods: string[]; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
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
  return createPortal(<div ref={dialog} className="report-presentation account-ui no-print" role="dialog" aria-modal="true" aria-labelledby="presentation-title">
    <header className="presentation-header">
      <div><p className="account-eyebrow">Presentación · {client}</p><h1 id="presentation-title" className="font-display text-2xl">{slides[current].title}</h1><p className="account-muted text-sm">{sorted[0]} a {sorted[sorted.length - 1]}</p></div>
      <button ref={closeButton} className="account-secondary" onClick={onClose}>Salir de presentación</button>
    </header>
    <div ref={content} className="presentation-content" key={slides[current].id}>{slides[current].content}</div>
    <nav className="presentation-controls" aria-label="Navegación de presentación">
      <button className="account-secondary" disabled={current === 0} onClick={() => setIndex(current - 1)}>← Anterior</button>
      <label><span className="sr-only">Ir a una tarjeta</span><select value={current} onChange={event => setIndex(Number(event.target.value))}>{slides.map((slide, position) => <option key={slide.id} value={position}>{position + 1}. {slide.title}</option>)}</select></label>
      <span role="status" aria-live="polite">{current + 1} / {slides.length}</span>
      <button className="account-primary" disabled={current === slides.length - 1} onClick={() => setIndex(current + 1)}>Siguiente →</button>
      <span className="account-muted text-xs">← → para avanzar · Esc para salir</span>
    </nav>
  </div>, document.body);
}
