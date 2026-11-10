import type { ExtractedField, PageText } from '../../shared/portfolio.js';

// Puerto para un proceso local separado. No hay transporte de red ni activación automática.
export interface LocalDocumentInterpreter {
  readonly mode: 'local';
  interpret(pages: readonly PageText[], signal: AbortSignal): Promise<ExtractedField[]>;
}
export async function interpretLocally(adapter: LocalDocumentInterpreter, pages: PageText[], signal: AbortSignal) {
  if (adapter.mode !== 'local') throw new Error('Solo se admite interpretación local');
  const fields = await adapter.interpret(pages, signal);
  if (signal.aborted) throw new Error('Interpretación cancelada');
  return fields.slice(0, 3000).filter(field => {
    const page = pages.find(p => p.page === field.page);
    return field.confidence === 'candidate' && field.quote.length >= 3 && page?.text.includes(field.quote) && field.value.length <= 12000;
  });
}
export const expectedDocumentFields = ['legal_name','rut','insurer','number','startsOn','endsOn','periodicity','currency','cmf'] as const;
export function extractionReview(fields: ExtractedField[]) {
  return {
    missing: expectedDocumentFields.filter(key => !fields.some(f => f.key === key)),
    conflicts: expectedDocumentFields.filter(key => new Set(fields.filter(f => f.key === key).map(f => f.value)).size > 1),
    coverageCandidates: [...new Set(fields.filter(f => f.key === 'coverage').map(f => f.value))],
  };
}
