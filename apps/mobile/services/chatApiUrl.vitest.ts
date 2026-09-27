import { useChatConfigStore } from '@gruenerator/chat/stores';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Ausfall (#2821): `EXPO_PUBLIC_API_URL` schliesst `/api` ein — so steht es
 * in .env.example, so lesen es die uebrigen fuenf Stellen der App. `chatConfig.ts`
 * las es als einzige ohne, waehrend jeder Pfad aus DEFAULT_ENDPOINTS mit `/api/`
 * beginnt. Lokal ergab das `…/api/api/chat-graph/stream`, in Produktion glich
 * die fehlende Vorgabe den doppelten Pfad zufaellig wieder aus.
 *
 * Behauptet wird deshalb ueber ALLE Endpunkte, und die Liste kommt aus dem Store
 * statt aus einer Kopie hier: der Fehler war nie ein einzelner Endpunkt, sondern
 * die Naht, durch die alle laufen — und ein neuer Endpunkt muss von selbst
 * mitgeprueft werden.
 */

/** Die echten DEFAULT_ENDPOINTS, ungefiltert aus dem Store des Chat-Pakets. */
const ENDPOINTS: string[] = Object.values(useChatConfigStore.getState().endpoints);

/**
 * Laedt das Modul mit der gewuenschten Umgebung neu — die Basis ist ein
 * Modul-const, wie bei den fuenf Geschwisterdateien auch. `stubEnv` statt
 * direkter Zuweisung, weil types/env.d.ts die Variable `readonly` deklariert.
 */
async function withBaseUrl(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_API_URL', value);
  return import('./chatApiUrl');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveChatUrl', () => {
  it('kennt ueberhaupt Endpunkte', () => {
    expect(ENDPOINTS.length).toBeGreaterThan(5);
    expect(ENDPOINTS.every((p) => p.startsWith('/api/'))).toBe(true);
  });

  it.each([
    ['lokal (Android-Emulator)', 'http://10.0.2.2:3001/api'],
    ['lokal (iOS-Simulator)', 'http://localhost:3001/api'],
    ['ungesetzt — Produktionsvorgabe', undefined],
  ])('doppelt %s den Praefix bei keinem Endpunkt', async (_name, base) => {
    const { resolveChatUrl } = await withBaseUrl(base);

    const doubled = ENDPOINTS.map(resolveChatUrl).filter((u) => u.includes('/api/api'));
    expect(doubled).toEqual([]);
  });

  it('setzt jeden Endpunkt genau einmal unter /api', async () => {
    const { resolveChatUrl } = await withBaseUrl('http://10.0.2.2:3001/api');

    // Nicht nur "nicht doppelt", sondern "genau einmal": ein Strip, der den
    // Praefix ganz verschluckt, waere ebenso kaputt und bestuende den Test oben.
    for (const path of ENDPOINTS) {
      expect(resolveChatUrl(path).match(/\/api\//g) ?? []).toHaveLength(1);
    }
  });

  it('trifft den Stream-Endpunkt wortgenau', async () => {
    const { resolveChatUrl } = await withBaseUrl('http://10.0.2.2:3001/api');

    expect(resolveChatUrl('/api/chat-graph/stream')).toBe(
      'http://10.0.2.2:3001/api/chat-graph/stream'
    );
  });

  it('laesst server-gelieferte Pfade ohne /api-Praefix unangetastet', async () => {
    // DocumentCreatedCard und ComputeCard reichen Pfade durch, die der Server
    // liefert. Ein bedingungsloses slice(4) wuerde sie verstuemmeln.
    const { resolveChatUrl } = await withBaseUrl('http://10.0.2.2:3001/api');

    expect(resolveChatUrl('/uploads/abc.png')).toBe('http://10.0.2.2:3001/api/uploads/abc.png');
  });

  it('reicht absolute URLs unveraendert durch', async () => {
    const { resolveChatUrl } = await withBaseUrl('http://10.0.2.2:3001/api');

    expect(resolveChatUrl('https://gruenerator.eu/api/exports/pdf')).toBe(
      'https://gruenerator.eu/api/exports/pdf'
    );
  });
});
