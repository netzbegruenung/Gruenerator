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
 * Einzige Voraussetzung (sonst skippt die Suite):
 *   VITE_E2E_AUTH_BYPASS=true   im Env des Dev-Servers
 *
 * Ohne Bypass würde jede Route auf die Loginseite umleiten und wir würden
 * 13× dieselbe Seite prüfen — ein grüner Lauf ohne Aussage. Ein Backend
 * braucht die Lane nicht: die Datenpfade beantwortet `apiFixtures.ts`.
 *
 * Abarbeitungsplan und Zielstandard: docs/barrierefreiheit-audit-plan.md
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

import { FIXTURE_BOARD_ID, installApiFixtures } from './fixtures/apiFixtures.js';

/**
 * Der Bypass, an dem diese Lane hängt, ist **rein clientseitig**:
 * `useAuth.ts` liefert bei `VITE_E2E_AUTH_BYPASS=true` auf einem
 * localhost-Host eine synthetische Sitzung, ohne das Backend zu fragen
 * (`buildE2EBypassAuthData`). Die Lane braucht also kein laufendes Backend
 * und kein Token — sie braucht nur einen Dev-Server, der mit dem Flag
 * gestartet wurde.
 *
 * Das war bis 08/2026 anders verdrahtet: geprüft wurde, ob das *Backend* auf
 * `localhost:3001` den Header `x-dev-auth-bypass` honoriert. In CI lief dort
 * nie etwas, also skippte die Suite dort **immer** — 22 von 22 Prüfungen,
 * auf jedem PR, unter einem grünen Haken namens „axe-core (WCAG 2.2 AA)".
 */
const BYPASS_AKTIV = process.env.VITE_E2E_AUTH_BYPASS === 'true';

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
 *
 * **Jede Route hier muss die Seite sein, die sie behauptet.** Von den bisher
 * zwanzig Einträgen waren SIEBEN Weiterleitungen — die Lane maß in Wahrheit
 * dreizehn verschiedene Seiten, `/workplace` davon viermal:
 *
 * | stand hier | landete auf | weil |
 * | --- | --- | --- |
 * | `/` | `/workplace` | angemeldete Nutzer werden weitergeleitet |
 * | `/settings`, `/profile` | `/workplace` | `SettingsRedirect` — die Einstellungen sind ein Dialog, keine Seite |
 * | `/notebooks` | `/wissen` | `WissenRedirect` |
 * | `/agents` | `/agentura` | `createRedirect` |
 * | `/image-studio` | `/studio` | `createRedirect` |
 * | `/boards` | `/office` | `createRedirect` |
 * | `/documents` | 404 | die Route existiert nur mit `:documentId` (in Welle 3 entfernt) |
 *
 * Die Einträge in `KNOWN_VIOLATIONS` für diese Namen bewachten damit Seiten,
 * die nie besucht wurden. Dagegen steht jetzt der Weiterleitungs-Riegel in
 * `gotoAuthenticated()`.
 */
const ROUTES = [
  // `/` und `/startseite` fehlen hier: beide leiten Angemeldete auf
  // `/workplace`. Die öffentliche Startseite ist nur ohne Sitzung messbar und
  // braucht deshalb einen eigenen, ausgeloggten Kontext — bis dahin deckt
  // `/login` den öffentlichen Teil ab.
  '/login',
  '/workplace',
  '/chat',
  // Das Kanban liegt auf `/boards/:id` — `/boards` ist eine Weiterleitung.
  // Erreichbar nur mit festem Datenstand, siehe apiFixtures.
  `/boards/${FIXTURE_BOARD_ID}`,
  '/wissen',
  '/agentura',
  '/office',
  '/studio',
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
 * Stand 08/2026, gemessen mit festem Datenstand über die bereinigte
 * Routenliste. `color-contrast` stand vorher auf ALLEN zwanzig Routen — das
 * war der Marken-Grün-Befund, und der ist mit #2334 (Eukalyptus) und der
 * Grau-Rampe erledigt. Zwölf Routen sind jetzt ohne jede Ausnahme.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // Beide Befunde sitzen im Board-Kopf, nicht in den Karten: `button-name` an
  // zwei Radix-Auslösern ohne zugänglichen Namen, `color-contrast` an der
  // Filterleiste.
  //
  // `nested-interactive` steht hier bewusst NICHT (mehr). Nicht, weil die
  // Lane es widerlegt hätte — sie kann es gar nicht sehen: die Karten leben
  // in einem Yjs-Dokument, das über Hocuspocus per WebSocket synchronisiert
  // wird (`useBoardState`), und ohne diesen Server bleibt `isSynced` false.
  // `page.route()` erreicht das nicht. Die Zusage für die Karten kommt
  // deshalb aus den Komponententests neben der Komponente
  // (`kanban.vitest.tsx`, `list.vitest.tsx`, mit Gegenprobe), nicht von hier.
  [`/boards/${FIXTURE_BOARD_ID}`]: ['button-name', 'color-contrast'],
};

async function gotoAuthenticated(page: Page, route: string): Promise<void> {
  await installApiFixtures(page);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  // Auf Ruhe warten statt auf `networkidle`: die App hält SSE-Verbindungen
  // offen, `networkidle` würde in den Timeout laufen.
  //
  // Vorher aber auf die STYLES warten, nicht nur auf den Inhalt.
  // `color-contrast` misst berechnete Farben — solange das Stylesheet nicht
  // angewandt ist, misst axe die Browser-Vorgaben und meldet Funde, die es im
  // Produkt nicht gibt. Erkennungszeichen: bei gleichem Stand fallen in jedem
  // Lauf ANDERE Routen durch, und einzeln ist keine davon reproduzierbar.
  // `load` wartet auf die verlinkten Stylesheets, `document.fonts.ready` auf
  // die Schriften — beides verschiebt Layout und Farben.
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  // Drei Riegel gegen dieselbe Fehlerklasse: eine Messung, die etwas anderes
  // prüft als die genannte Route, meldet ein Ergebnis, das erfreulich aussieht
  // und nichts aussagt. Ohne Bypass ist das 19× die Loginseite, bei einer
  // falsch geschriebenen Route 1× die Nicht-gefunden-Seite, und bei einer
  // Weiterleitung eine zweite Messung derselben Seite unter fremdem Namen.
  // Alle drei muss die Lane als Fehler melden, nicht als Befund.
  const landed = new URL(page.url()).pathname;
  expect(
    landed.startsWith('/login') && route !== '/login',
    `${route} ist auf ${landed} umgeleitet — der Dev-Auth-Bypass greift nicht.`
  ).toBe(false);
  // Der Riegel, der `/boards` entlarvt hat: die Route war ein
  // `createRedirect('/office')`, also maß die Lane `/office` zweimal.
  expect(
    landed,
    `${route} leitet auf ${landed} weiter und misst dort eine Seite,
die unter ihrem eigenen Namen ohnehin geprüft wird.`
  ).toBe(route);
  expect(
    await page.locator('.not-found-container').count(),
    `${route} rendert die Nicht-gefunden-Seite — die Route gibt es nicht.`
  ).toBe(0);

  // Der vierte Riegel derselben Klasse, und der teuerste bisher: `/studio`,
  // `/media-library` und `/projekte` zeigten die Fehlergrenze statt der Seite,
  // und axe fand darauf brav null Verstöße. Drei von dreizehn Routen meldeten
  // also „sauber" über eine Seite, die niemand je zu sehen bekommt.
  // Die Ursachen lagen alle in apiFixtures, aber das ist genau der Punkt: ohne
  // diesen Riegel merkt man es nicht — die Lane wird umso grüner, je kaputter
  // die Seite ist.
  const absturz = await page.locator('[data-testid="error-boundary"]').count();
  if (absturz > 0) {
    const details = await page.locator('[data-testid="error-boundary"] p').allTextContents();
    expect(
      details.join(' | '),
      `${route} zeigt die Fehlergrenze statt der Seite. axe prüft dann eine
Fehlermeldung und meldet sie als sauber.`
    ).toBe('');
  }

  // Das Cookie-Banner liegt sonst über der Seite. Es steht in `index.html`,
  // nicht in React, und lässt sich nur über den Schlüssel wegbekommen, den es
  // wirklich liest — siehe apiFixtures.
  expect(
    await page.locator('#terms-banner:visible').count(),
    `${route}: das Cookie-Banner liegt über der Seite.`
  ).toBe(0);

  // Ein Hinweis in Rot oder Gelb heißt hier fast immer: eine Fixture-Antwort
  // hat nicht die Form, die der Aufrufer erwartet. Ohne diesen Riegel meldet
  // die Lane das als Kontrastverstoß der Oberfläche — ein Befund über das
  // Prüfmittel, der wie ein Befund über das Produkt aussieht. Genau so hätte
  // diese Fassung 11 von 13 Routen zu Unrecht gerügt.
  // `allTextContents()` und nicht `first().textContent()`: letzteres wartet auf
  // ein Element, das im Gutfall nie kommt — 30 Sekunden Leerlauf je Route.
  const hinweise = await page
    .locator('[data-sonner-toast][data-type="error"], [data-sonner-toast][data-type="warning"]')
    .allTextContents();
  expect(
    hinweise,
    `${route} zeigt einen Fehler- oder Warnhinweis. Das ist in aller Regel eine
fehlende oder falsch geformte Antwort in apiFixtures.ts, kein Befund über die
Oberfläche.`
  ).toEqual([]);
}

test.describe('Barrierefreiheit (WCAG 2.2 AA)', () => {
  test.beforeAll(() => {
    test.skip(
      !BYPASS_AKTIV,
      'VITE_E2E_AUTH_BYPASS ist nicht gesetzt — ohne das Flag im Dev-Server prüft die Lane 19× die Loginseite.'
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
