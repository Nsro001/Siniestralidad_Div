import { HttpError } from './supabase.js';
// Read dimensions from raster headers; never trust the supplied MIME type alone.
function dimensions(b: Buffer, type: string): [number, number] | null {
  if (type === 'png' && b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16) === 'IHDR') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (type === 'jpeg' && b[0] === 255 && b[1] === 216) {
    let offset = 2;
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 255) return null;
      while (b[offset] === 255) offset++;
      const marker = b[offset++];
      if (marker === 217 || marker === 218) break;
      const length = b.readUInt16BE(offset);
      if (length < 2 || offset + length > b.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) return [b.readUInt16BE(offset+5),b.readUInt16BE(offset+3)];
      offset += length;
    }
  }
  if (type === 'webp' && b.length >= 30 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') {
    const kind = b.toString('ascii',12,16);
    if (kind === 'VP8X') return [b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];
    if (kind === 'VP8 ' && b.subarray(23,26).equals(Buffer.from([157,1,42]))) return [b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];
    if (kind === 'VP8L' && b[20] === 47) { const bits=b.readUInt32LE(21); return [(bits&16383)+1,((bits>>>14)&16383)+1]; }
  }
  return null;
}
export function validateBranding(body: unknown) {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.broker_name !== 'string' || b.broker_name.length > 120) throw new HttpError(400, 'Nombre de corredora inválido.');
  for (const key of ['broker_logo', 'client_logo', 'interior_logo']) {
    const value = b[key];
    if (value === null || (key === 'interior_logo' && value === undefined)) continue;
    const match = typeof value === 'string' && value.length <= 700000 && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new HttpError(400, 'Usa un logo PNG, JPEG o WebP de hasta 500 KB.');
    const bytes = Buffer.from(match[2], 'base64');
    const size = dimensions(bytes, match[1]);
    if (bytes.length > 500*1024 || !size || size.some(n=>n < 1 || n > 4096)) throw new HttpError(400, 'Logo inválido: verifica formato y dimensiones (1 a 4096 px por lado).');
  }
  return { broker_name: b.broker_name.trim(), broker_logo: b.broker_logo as string | null, client_logo: b.client_logo as string | null, ...(b.interior_logo !== undefined ? {interior_logo: b.interior_logo as string | null} : {}) };
}
