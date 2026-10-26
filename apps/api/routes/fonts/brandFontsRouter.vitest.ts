/**
 * Die Route ist öffentlich und liest aus dem privaten Checkout — sie darf genau
 * die Schriftdateien der Allowlist herausgeben und sonst nichts aus diesem Baum.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const root = mkdtempSync(path.join(tmpdir(), 'intern-'));
mkdirSync(path.join(root, 'fonts'));
writeFileSync(path.join(root, 'fonts', 'GrueneType.woff2'), 'schrift');
writeFileSync(path.join(root, 'fonts', 'GrueneTypeNeue-Regular.otf'), 'nicht freigegeben');
writeFileSync(path.join(root, 'wolke-shares.json'), '{"geheim":"x"}');

vi.mock('../../services/skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

const { mountBrandFontsRouter } = await import('./brandFontsRouter.js');

it('serves listed fonts publicly cached and 404s everything else', async () => {
  const { default: express } = await import('express');
  const app = express();
  mountBrandFontsRouter(app);
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const get = (file: string) => fetch(`http://127.0.0.1:${port}/api/fonts/${file}`);

    const font = await get('GrueneType.woff2');
    expect(font.status).toBe(200);
    expect(font.headers.get('content-type')).toBe('font/woff2');
    expect(font.headers.get('cache-control')).toBe('public, max-age=604800');
    expect(await font.text()).toBe('schrift');

    // Liegt im Checkout, steht aber nicht auf der Liste.
    expect((await get('GrueneTypeNeue-Regular.otf')).status).toBe(404);
    // Steht auf der Liste, fehlt aber im Checkout.
    expect((await get('GothamNarrow-Ultra.woff2')).status).toBe(404);
    expect((await get('..%2Fwolke-shares.json')).status).toBe(404);
  } finally {
    server.close();
  }
});
