import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Eine Konvention, zwei Ausfaelle: `EXPO_PUBLIC_API_URL` schliesst `/api` ein —
 * so gibt es `.env.example` vor, so lesen es die uebrigen Stellen der App.
 *
 * Wer sie anders liest, faellt in Produktion nicht auf, weil dort nichts gesetzt
 * ist und die eigene Vorgabe die Abweichung ausgleicht; lokal bricht es.
 * `chatConfig.ts` verklebte sie ohne `/api` mit Pfaden, die damit beginnen
 * (#2821 — `…/api/api/chat-graph/stream`), `useNotebookSharing.ts` benutzte sie
 * als Web-Herkunft fuer einen Teilen-Link (#2841 — `http://10.0.2.2:3001/api/notebooks/…`).
 *
 * Geprueft wird deshalb die Naht, nicht der einzelne Aufrufer: wer die Variable
 * liest, traegt eine Vorgabe, und jede Vorgabe endet auf `/api`. Wer eine
 * Web-Herkunft braucht, nimmt `WEB_ORIGIN` aus `services/webOrigin.ts`.
 */

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.expo', 'android', 'ios', 'dist', 'build']);

/** Nur echte Lesestellen — Kommentare und `vi.stubEnv` nennen den Namen auch. */
const READ = 'process.env.EXPO_PUBLIC_API_URL';
/**
 * Die Vorgabe steht mal direkt am Lesen (`… || 'https://…/api'`), mal eine Zeile
 * weiter am durchgereichten Parameter (`searchImagesView.ts`) — gesucht wird
 * deshalb jede Origin-Vorgabe in einer Datei, die die Variable liest.
 */
const FALLBACK = /\|\|\s*'(https?:\/\/[^']*)'/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
    return [full];
  });
}

const readers = sourceFiles(APP_ROOT)
  // Ohne das findet der Waechter sich selbst — er nennt die Variable im Kopf.
  .filter((file) => file !== import.meta.filename)
  .map((file) => ({ file: path.relative(APP_ROOT, file), text: fs.readFileSync(file, 'utf8') }))
  .filter(({ text }) => text.includes(READ))
  .map(({ file, text }) => ({ file, fallbacks: [...text.matchAll(FALLBACK)].map((m) => m[1]) }));

describe('EXPO_PUBLIC_API_URL', () => {
  it('wird ueberhaupt gelesen', () => {
    expect(readers.length).toBeGreaterThan(5);
  });

  it('traegt an jeder Lesestelle eine Vorgabe', () => {
    const ohneVorgabe = readers.filter((r) => r.fallbacks.length === 0);
    expect(ohneVorgabe.map((r) => r.file)).toEqual([]);
  });

  it('hat nur Vorgaben MIT /api', () => {
    const abweichend = readers.flatMap((r) =>
      r.fallbacks.filter((f) => !f.endsWith('/api')).map((f) => `${r.file}: ${f}`)
    );
    expect(abweichend).toEqual([]);
  });
});

describe('WEB_ORIGIN', () => {
  it('ist die Web-Herkunft, nicht die API-Basis', async () => {
    const { WEB_ORIGIN } = await import('./webOrigin');

    expect(WEB_ORIGIN).toBe('https://gruenerator.eu');
    expect(WEB_ORIGIN).not.toMatch(/\/api\/?$/);
  });
});
