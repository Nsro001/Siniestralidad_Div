declare module 'unzipper' {
  import type { Readable } from 'node:stream';
  export const Open: { buffer(buffer: Buffer): Promise<{ files: Array<{ path: string; stream(): Readable }> }> };
}
