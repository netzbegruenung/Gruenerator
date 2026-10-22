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
import { createServer, type RequestListener } from 'node:http';
import { createRequire } from 'node:module';
import { type AddressInfo } from 'node:net';
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

/**
 * Vor dem Crawl wird genau eine URL geprüft. got folgt Redirects von sich aus
 * (bis zu zehn) und löst Namen selbst auf — ohne die Optionen aus dem
 * Pre-Navigation-Hook ginge jeder Hop ungeprüft hinaus. Ein 3xx ist hier
 * deshalb ein Fehlschlag: der fetch-Fallback (safeFetch) folgt und prüft jeden
 * Hop.
 */
describe('Redirects und Adressen', () => {
  const PAGE = `<html><head><title>Seite</title></head><body><main><p>${'Ein Absatz mit genug Text, damit die Seite nicht als JavaScript-Seite gilt. '.repeat(5)}</p></main></body></html>`;

  async function listen(handler: RequestListener) {
    let hits = 0;
    const server = createServer((req, res) => {
      hits++;
      handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      port,
      origin: `http://127.0.0.1:${port}`,
      hits: () => hits,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  const page: RequestListener = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE);
  };

  it('liest eine Seite ohne Redirect weiterhin', { timeout: 30_000 }, async () => {
    const server = await listen(page);
    try {
      const { CrawleeCrawler } = await import('./CrawleeCrawler.js');
      const result = await new CrawleeCrawler(config).crawlWithCrawlee(`${server.origin}/`);
      expect(result.html).toContain('Ein Absatz mit genug Text');
    } finally {
      await server.close();
    }
  });

  it('folgt keinem Redirect', { timeout: 30_000 }, async () => {
    const elsewhere = await listen(page);
    const redirecting = await listen((_req, res) => {
      res
        .writeHead(302, { Location: `${elsewhere.origin}/`, 'Content-Type': 'text/html' })
        .end('<html><body>Moved</body></html>');
    });
    try {
      const { CrawleeCrawler } = await import('./CrawleeCrawler.js');
      await expect(
        new CrawleeCrawler(config).crawlWithCrawlee(`${redirecting.origin}/`)
      ).rejects.toThrow(/No content extracted/);
      expect(redirecting.hits()).toBe(1);
      expect(elsewhere.hits()).toBe(0);
    } finally {
      await redirecting.close();
      await elsewhere.close();
    }
  });

  it(
    'verbindet nicht, wenn der Name auf eine interne Adresse zeigt',
    { timeout: 30_000 },
    async () => {
      // `localhost` steht für einen Namen, der bei der Prüfung vor dem Crawl
      // öffentlich war und beim Verbinden intern auflöst (DNS-Rebinding).
      const server = await listen(page);
      try {
        const { CrawleeCrawler } = await import('./CrawleeCrawler.js');
        await expect(
          new CrawleeCrawler(config).crawlWithCrawlee(`http://localhost:${server.port}/`)
        ).rejects.toThrow(/No content extracted/);
        expect(server.hits()).toBe(0);
      } finally {
        await server.close();
      }
    }
  );
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
