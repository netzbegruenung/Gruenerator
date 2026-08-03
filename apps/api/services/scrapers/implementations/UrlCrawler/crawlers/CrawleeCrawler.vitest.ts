/**
 * Der Crawler muss ladbar sein — und das muss auffallen, wenn er es nicht ist.
 *
 * Seit dem jsdom-Pin in `pnpm.overrides` (f453965bc, 31.07.2026) warf
 * `await import('crawlee')` in jedem Container, bei jeder URL. Der Grund lag
 * elf Re-Exporte tief in einem Paket, das wir gar nicht benutzen. Sichtbar war
 * davon nichts: die Meldung stand auf `console.log` neben echten Seitenfehlern,
 * und der fetch-Fallback lieferte weiter Text. Drei Tage lang bekam der Chat
 * 403-Seiten statt Primärquellen.
 *
 * Diese Datei prüft deshalb beides: dass der Ladepfad hält, und dass ein
 * Ladefehler laut wird.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CrawlerConfig } from '../types.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const SCOPED = ['@crawlee/cheerio', '@crawlee/core', '@crawlee/playwright'] as const;

const config: CrawlerConfig = {
  crawlerMode: 'crawlee',
  maxConcurrency: 1,
  maxRetries: 0,
  timeout: 1000,
  maxContentLength: 1024,
  userAgent: 'vitest',
};

describe('der Ladepfad von Crawlee', () => {
  it('lädt genau die drei Pakete, die der Crawler auspackt', async () => {
    const [cheerio, core, playwright] = await Promise.all(SCOPED.map((name) => import(name)));

    expect(typeof cheerio.CheerioCrawler).toBe('function');
    expect(typeof playwright.PlaywrightCrawler).toBe('function');
    expect(typeof core.Configuration).toBe('function');
    expect(core.log).toBeTruthy();
  });

  it('holt nichts über den `crawlee`-Sammelexport', () => {
    // Der Sammelexport zieht `@crawlee/jsdom` eager mit, und dessen
    // `jsdom-crawler.js` baut auf Modulebene ein `new ResourceLoader(...)` —
    // in jsdom 27+ existiert dieser Export nicht mehr. Ein einzelnes
    // `from 'crawlee'` legt damit das ganze Crawlen still.
    const code = readFileSync(path.join(here, 'CrawleeCrawler.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // der Kommentar dort NENNT den Sammelexport
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from ['"]crawlee['"]/);
    expect(code).not.toMatch(/import\(['"]crawlee['"]\)/);
  });

  it('hängt an keinem Paket, das das jsdom-Override treffen könnte', () => {
    // Der Pin `"jsdom": "30.0.1"` in den Root-Overrides ERSETZT den Bereich,
    // den ein Paket selbst deklariert — geprüft wird er nicht. Solange keines
    // der drei jsdom fordert, kann der Sicherheits-Bump bleiben, wo er ist.
    for (const name of SCOPED) {
      const manifest = JSON.parse(
        readFileSync(require.resolve(`${name}/package.json`), 'utf8')
      ) as { dependencies?: Record<string, string> };
      expect(manifest.dependencies?.jsdom).toBeUndefined();
    }
  });
});

describe('ein Ladefehler', () => {
  afterEach(() => {
    vi.doUnmock('@crawlee/cheerio');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('wird als Fehler gemeldet — und genau einmal je Prozess', async () => {
    vi.resetModules();
    // Ein Modul, das beim Auspacken bricht — vitest ersetzt die Meldung einer
    // werfenden Factory durch seine eigene, ein werfender Getter kommt
    // unverfälscht in denselben catch.
    vi.doMock('@crawlee/cheerio', () => ({
      get CheerioCrawler(): never {
        throw new Error(
          "The requested module 'jsdom' does not provide an export named 'ResourceLoader'"
        );
      },
    }));

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    const { CrawleeCrawler } = await import('./CrawleeCrawler.js');
    const crawler = new CrawleeCrawler(config);

    await expect(crawler.crawlWithCrawlee('https://example.org')).rejects.toThrow(/ResourceLoader/);
    await expect(crawler.crawlWithCrawlee('https://example.org')).rejects.toThrow(/ResourceLoader/);

    // Zweimal geworfen, einmal gemeldet: der zweite Aufruf soll den Import
    // nicht erneut versuchen und das Log nicht fluten.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Installationsfehler, kein Seitenproblem/);
    expect(errors[0]).toMatch(/ResourceLoader/);
  });
});
