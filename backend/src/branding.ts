import { HttpError } from './supabase.js';
export function validateBranding(body: unknown) {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.broker_name !== 'string' || b.broker_name.length > 120) throw new HttpError(400, 'Nombre de corredora inválido.');
  for (const key of ['broker_logo', 'client_logo']) {
    const value = b[key];
    if (value === null) continue;
    if (typeof value !== 'string' || value.length > 700000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new HttpError(400, 'Usa un logo PNG o JPEG de hasta 500 KB.');
    const bytes = Buffer.from(value.split(',')[1], 'base64');
    const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (bytes.length > 500 * 1024 || !(value.startsWith('data:image/png') ? png : jpeg)) throw new HttpError(400, 'El contenido del logo no corresponde a PNG o JPEG.');
  }
  return { broker_name: b.broker_name.trim(), broker_logo: b.broker_logo as string | null, client_logo: b.client_logo as string | null };
}
