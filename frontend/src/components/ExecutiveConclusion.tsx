import type { ExecutiveConclusion as Conclusion } from '../../../shared/executive';
export default function ExecutiveConclusion({ conclusion }: {conclusion: Conclusion}) {
  return <section className="executive-conclusion glass-panel rounded-3xl p-6"><h2 className="font-display text-2xl">Conclusión ejecutiva</h2>
    {conclusion.sections.map((s,i)=><div className="conclusion-item mt-4" key={s.title}><h3 className="font-semibold">{i+1}. {s.title}</h3><p>{s.text}</p></div>)}
    <div className="conclusion-notes mt-4 text-sm"><h3 className="font-semibold">Alcance de la lectura</h3>{conclusion.notes.map(n=><p key={n}>{n}</p>)}</div>
  </section>;
}
