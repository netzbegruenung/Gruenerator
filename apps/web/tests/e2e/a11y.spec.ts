/**
 * Barrierefreiheits-Audit-Lane (WCAG 2.2 AA im Rahmen von EN 301 549).
 *
 * Warum diese Lane zusätzlich zu den axe-Prüfungen im `dom`-vitest-Projekt
 * existiert: jsdom hat kein Layout und kein Canvas. `color-contrast`,
 * `target-size` und alles, was berechnete Styles braucht, ist dort
 * grundsätzlich nicht prüfbar und in `src/test-utils.tsx` bewusst abgeschaltet.
 * Erst ein echter Browser liefert diese Ergebnisse — deshalb hier.
 *
 * Die Lane prüft ROUTEN, nicht Komponenten. Komponenten-Regressionen gehören
 * weiter in die `.vitest.tsx`-Tests neben der Komponente.
 *
 * Voraussetzungen (sonst skippt die Suite):
 *   VITE_E2E_AUTH_BYPASS=true   im Web-Env (zur BUILD-/Dev-Server-Zeit)
 *   ALLOW_DEV_AUTH_BYPASS=true  + DEV_AUTH_BYPASS_TOKEN im API-Env
 *
 * Ohne Bypass würde jede Route auf die Loginseite umleiten und wir würden
 * 15× dieselbe Seite prüfen — ein grüner Lauf ohne Aussage.
 *
 * Abarbeitungsplan und Zielstandard: docs/barrierefreiheit-audit-plan.md
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

import { isDevBypassHonored } from './fixtures/pageHelpers.js';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const BYPASS_TOKEN = process.env.DEV_AUTH_BYPASS_TOKEN;

/**
 * Der Tag-Satz, gegen den geprüft wird. `wcag22aa` ist der eigentliche
 * Zielstandard; die älteren Tags sind kumulativ enthalten und müssen trotzdem
 * genannt werden, weil axe-core sie nicht implizit einschließt.
 *
 * `best-practice` ist bewusst NICHT dabei: das sind Deque-Empfehlungen ohne
 * Normbezug. Sie in dieselbe Liste zu werfen, macht den Unterschied zwischen
 * „verstößt gegen WCAG" und „könnte schöner sein" unsichtbar.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Die geprüften Routen. Bewusst die Einstiegsseiten der Hauptbereiche, nicht
 * jede Unterseite: eine Route, die dieselben Komponenten wie eine bereits
 * geprüfte rendert, findet keine neuen Verstöße, kostet aber dieselbe Zeit.
 */
const ROUTES = [
  '/',
  '/login',
  '/workplace',
  '/chat',
  '/settings',
  '/profile',
  // `/documents` stand hier und ist keine Route: die Anwendung kennt nur
  // `/documents/:documentId`. Die Lane hat dort also die Nicht-gefunden-Seite
  // geprüft und sie als Dokumentenübersicht ausgegeben. Die Übersicht ist
  // `/office` und steht weiter unten ohnehin drin. Gegen die Wiederholung
  // steht jetzt der 404-Riegel in `gotoAuthenticated()`.
  '/boards',
  '/notebooks',
  '/agentura',
  '/agents',
  '/wissen',
  '/office',
  '/studio',
  '/image-studio',
  '/media-library',
  '/apps',
  '/transkription',
  '/suche',
  '/projekte',
];

/**
 * Bekannte Altlast. Jeder Eintrag ist ein Befund aus dem Baseline-Lauf, der
 * noch nicht behoben ist — NICHT eine Regel, die uns egal wäre.
 *
 * Warum als Ausnahmeliste und nicht als roter Build: eine Lane, die am ersten
 * Tag rot ist, wird abgeschaltet statt abgearbeitet. Die Liste ist der
 * Arbeitsvorrat von Welle 3; sie darf nur schrumpfen. Wer einen Eintrag
 * hinzufügt, begründet ihn im PR.
 *
 * Leer = Ziel erreicht.
 *
 * Stand nach Welle 3 (Nachmessung 02.08.2026, hell + dunkel, Dev-Auth-Bypass
 * aktiv): `nested-interactive` (315), `button-name` (9), `aria-allowed-attr` (3)
 * und `link-name` sind weg. Übrig ist ausschließlich `color-contrast`, und zwar
 * an vier Farbpaaren, die alle an einer offenen **Designentscheidung** hängen
 * (weißer Text auf `--secondary-500`/`--secondary-600` erreicht 3,37 bzw.
 * 4,11 statt 4,5). Begründung und Auflösungsvorschläge mit gerechneten Werten:
 * docs/barrierefreiheit-followup-audit.md §1.
 *
 * Der Sprung-Link steht seit Welle 3 per Vorgabe an (WCAG 2.4.1 ist Level A) —
 * er benutzt dieselbe Markenfarbe und bringt den Kontrastbefund deshalb auf
 * JEDE Route. Das ist keine Verschlechterung, sondern derselbe Defekt an einer
 * Stelle, die jetzt überall sichtbar ist.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  '/': ['color-contrast'],
  '/login': ['color-contrast'],
  '/workplace': ['color-contrast'],
  '/chat': ['color-contrast'],
  '/settings': ['color-contrast'],
  '/profile': ['color-contrast'],
  // `nested-interactive` bleibt hier stehen, obwohl die Nachmessung es nicht
  // meldet: die Messung lief mit LEEREM Board (0 Karten). Die Ursache sitzt
  // nicht in unseren Karten, sondern in dnd-kits `role="button"` auf dem
  // Sortier-Wrapper — siehe Follow-up-Audit §3. Erst mit festem Datenstand
  // (B4.1) ist ein Nicht-Befund hier überhaupt eine Aussage.
  '/boards': ['color-contrast', 'nested-interactive'],
  '/notebooks': ['color-contrast'],
  '/agentura': ['color-contrast'],
  '/agents': ['color-contrast'],
  '/wissen': ['color-contrast'],
  '/office': ['color-contrast'],
  '/studio': ['color-contrast'],
  '/image-studio': ['color-contrast'],
  '/media-library': ['color-contrast'],
  '/apps': ['color-contrast'],
  '/transkription': ['color-contrast'],
  '/suche': ['color-contrast'],
  '/projekte': ['color-contrast'],
};

async function gotoAuthenticated(page: Page, route: string): Promise<void> {
  // Der Backend-Bypass hängt am Header, nicht am Cookie — also auf jede
  // API-Anfrage der Seite setzen, nicht nur auf die Navigation.
  if (BYPASS_TOKEN) {
    await page.setExtraHTTPHeaders({ 'x-dev-auth-bypass': BYPASS_TOKEN });
  }
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  // Auf Ruhe warten statt auf `networkidle`: die App hält SSE-Verbindungen
  // offen, `networkidle` würde in den Timeout laufen.
  await page.waitForTimeout(1500);

  // Zwei Riegel gegen dieselbe Fehlerklasse: eine Messung, die etwas anderes
  // prüft als die genannte Route, meldet ein Ergebnis, das erfreulich aussieht
  // und nichts aussagt. Ohne Bypass ist das 20× die Loginseite, bei einer
  // falsch geschriebenen Route 1× die Nicht-gefunden-Seite. Beides muss die
  // Lane als Fehler melden, nicht als Befund.
  const landed = new URL(page.url()).pathname;
  expect(
    landed.startsWith('/login') && route !== '/login',
    `${route} ist auf ${landed} umgeleitet — der Dev-Auth-Bypass greift nicht.`
  ).toBe(false);
  expect(
    await page.locator('.not-found-container').count(),
    `${route} rendert die Nicht-gefunden-Seite — die Route gibt es nicht.`
  ).toBe(0);
}

test.describe('Barrierefreiheit (WCAG 2.2 AA)', () => {
  test.beforeAll(async ({ request }) => {
    const honored = await isDevBypassHonored(request, API_BASE, BYPASS_TOKEN);
    test.skip(
      !honored,
      'Dev-Auth-Bypass nicht aktiv — ohne ihn prüft die Lane 15× die Loginseite.'
    );
  });

  for (const route of ROUTES) {
    test(`${route} hat keine WCAG-2.2-AA-Verstöße`, async ({ page }) => {
      await gotoAuthenticated(page, route);

      const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
      const known = KNOWN_VIOLATIONS[route];
      if (known?.length) builder.disableRules(known);

      const { violations } = await builder.analyze();

      // Bei Verstößen die betroffenen Selektoren mit ausgeben — eine reine
      // Regel-ID schickt die nächste Person auf die Suche.
      expect(
        violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          hilfe: v.helpUrl,
          stellen: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
        }))
      ).toEqual([]);
    });
  }
});
