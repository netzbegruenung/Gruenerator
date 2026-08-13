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
 * Routen UND Überlagerungen werden in BEIDEN Farbmodi geprüft (siehe
 * `THEMES`). Das ist die einzige Stelle im Haus, an der der Dunkelmodus
 * überhaupt messbar ist — die Begründung steht dort.
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
 * dreizehn verschiedene Seiten, den Chat-Einstieg (damals `/workplace`, heute
 * `/start`) davon viermal:
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
  // `/` und `/startseite` fehlen hier: beide leiten Angemeldete auf ihre
  // Startfläche (`/start` oder `/workplace`). Die öffentliche Startseite ist
  // nur ohne Sitzung messbar und braucht deshalb einen eigenen, ausgeloggten
  // Kontext — bis dahin deckt `/login` den öffentlichen Teil ab.
  '/login',
  // Chat-Einstieg; bis 08/2026 lag diese Seite auf `/workplace`. Die
  // Arbeiten-Fläche (heute `/workplace`) war nie Teil der Lane und bleibt es
  // vorerst — sie gehört in den Arbeitsvorrat, nicht in diesen Umbau.
  '/start',
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
 * Beide Farbmodi. Der Grund, warum das hier steht und nicht in den
 * Komponententests: Dunkelmodus ist im Wesentlichen eine Aussage über
 * *berechnete Farben*, und die sind nur im echten Browser messbar — in jsdom
 * ist `color-contrast` abgeschaltet (siehe `src/test-utils.tsx`), ein
 * Dunkelmodus-Lauf dort würde also exakt dieselben Regeln prüfen wie der helle
 * und nur die Laufzeit verdoppeln. Auch die Struktur-Lane
 * (`a11y-structure.spec.ts`) bleibt bewusst einfarbig: ein ARIA-Baum kennt
 * keine Farbe.
 *
 * Der Modus wird auf zwei Wegen gestellt, weil die App ihn auf zwei Wegen
 * lesen kann (`index.html`, Vorbemalungs-Skript): die Playwright-Emulation
 * `colorScheme` beantwortet `prefers-color-scheme` für die Vorgabe `system`,
 * der gesetzte `themePreference`-Schlüssel deckt die ausdrückliche Wahl ab.
 * Beide auf denselben Wert — widersprächen sie sich, wüsste man hinterher
 * nicht, welcher Pfad gemessen wurde.
 */
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const modusName = (theme: Theme): string => (theme === 'dark' ? 'dunkel' : 'hell');

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

/**
 * Zusätzliche Altlast, die NUR im Dunkelmodus auftritt. Getrennt von der Liste
 * oben, weil die Trennung die eigentliche Information ist: ein Eintrag hier
 * heißt „dieselbe Stelle ist hell in Ordnung und dunkel nicht" — also ein
 * Token, das nur eine der beiden Rollen bedient, und kein allgemeiner Mangel.
 *
 * Leer = der Dunkelmodus trägt so weit wie der helle. Der Baseline-Lauf vom
 * 13.08.2026 fand über alle Routen keinen einzigen Dunkelmodus-Verstoß.
 */
const KNOWN_VIOLATIONS_DARK: Record<string, string[]> = {};

function bekannteAusnahmen(theme: Theme, route: string): string[] {
  const basis = KNOWN_VIOLATIONS[route] ?? [];
  if (theme !== 'dark') return basis;
  return [...new Set([...basis, ...(KNOWN_VIOLATIONS_DARK[route] ?? [])])];
}

async function gotoAuthenticated(page: Page, theme: Theme, route: string): Promise<void> {
  await page.addInitScript((gewuenscht) => {
    localStorage.setItem(
      'themePreference',
      JSON.stringify({ value: gewuenscht, timestamp: Date.now() })
    );
  }, theme);
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
  //
  // `load` allein genügt hier aber NICHT, und das ist der Kern: der
  // Vite-Dev-Server liefert CSS als JS-Modul aus und hängt es erst beim
  // Auswerten als `<style>` ein. `load` ist da längst gefeuert.
  await page.waitForLoadState('load');
  // Einmal nachfassen: `/apps` und `/suche` navigieren nach dem ersten Rendern
  // noch clientseitig, und wer dabei in `page.evaluate` steht, stirbt mit
  // „Execution context was destroyed". Das ist ein Wackler des Prüfmittels und
  // kein Befund — er trifft hell wie dunkel und in jedem Lauf andere Routen.
  // Bisher fiel er nicht auf, weil CI zweimal wiederholt; sichtbar wurde er
  // erst, als die Lane mit beiden Farbmodi doppelt so viele Seiten lud.
  for (const versuch of [1, 2]) {
    try {
      await page.evaluate(() => document.fonts.ready);
      break;
    } catch (fehler) {
      if (versuch === 2) throw fehler;
      await page.waitForLoadState('load');
    }
  }
  // Das Bereitschaftssignal statt einer Uhr: `--background-color` steht in
  // `assets/styles/common/variables.css`. Ist es berechenbar, liegt unsere
  // Farbebene an. Eine feste Frist kann das nicht leisten — sie ist auf einem
  // ausgelasteten CI-Runner mal lang genug und mal nicht, und der Unterschied
  // sieht aus wie ein Kontrastbefund.
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() !==
      '',
    undefined,
    { timeout: 15_000 }
  );

  // Und dann auf die SEITE warten, nicht nur auf ihre Farben. Im CI-Lauf vom
  // 13.08.2026 hieß die gemeldete Stelle `:root` — das ist keine Oberfläche,
  // das ist der Ladezustand: `AuthSplash` liegt als `fixed inset-0` über allem,
  // solange `/auth/status` nicht geantwortet hat, und axe misst dann brav den
  // Platzhalter.
  //
  // Als **positive** Bedingung formuliert, und das ist der Punkt: ein erster
  // Versuch wartete mit `waitFor({ state: 'detached' })` auf das Verschwinden
  // des Splashs — und der Zustand ist erfüllt, solange das Element noch gar
  // nicht da ist. Auf einem langsamen Runner lief die Prüfung damit VOR dem
  // Ladezustand durch und maß ihn anschließend mit. Der Lauf wurde dadurch
  // schlechter, nicht besser (11 Wiederholungen statt 2).
  //
  // `AuthSplash` rendert kein `<main>` — die Bedingung unten kann er also
  // nicht erfüllen, egal wie die Zeiten fallen. `PageLayout` setzt genau ein
  // `<main id="main-content">` auf jeder Route.
  await page.waitForFunction(
    () => {
      if (document.querySelector('[aria-label="Wird geladen"]')) return false;
      const inhalt = document.querySelector('main');
      return !!inhalt?.querySelector('h1, h2, button, a, input');
    },
    undefined,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(1500);

  // Der Riegel für den Farbmodus, und er gehört zur selben Fehlerklasse wie die
  // vier darunter: greift die Umschaltung nicht, misst der dunkle Lauf zweimal
  // dieselbe helle Seite — doppelte Laufzeit, verdoppelte Zusage, kein
  // zusätzliches Wissen. Und weil hell heute grün ist, wäre er grün.
  //
  // Mit Gegenprobe: setzt man BEIDE Hebel oben auf `light` und lässt den
  // dunklen Durchlauf trotzdem laufen, fallen alle 13 Prüfungen hier durch.
  // Nur einen zu neutralisieren genügt nicht — der gesetzte
  // `themePreference`-Schlüssel überstimmt `prefers-color-scheme`, weil eine
  // ausdrückliche Wahl die Systemvorgabe schlägt. Genau deshalb stehen beide.
  const gemessen = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(
    gemessen,
    `${route} steht auf data-theme="${gemessen}", geprüft werden sollte "${theme}".`
  ).toBe(theme);

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

/**
 * Überlagerungen, die erst nach einem Klick im DOM stehen.
 *
 * Der Grund für diesen Block: die Routen-Prüfungen oben messen den Zustand
 * direkt nach dem Laden. Menüs, Dialoge und Blätter sind zu diesem Zeitpunkt
 * **gar nicht da** — Radix rendert sie in ein Portal, und zwar erst beim
 * Öffnen. `/chat` steht seit jeher in `ROUTES` und meldete trotzdem nie etwas
 * über das Plusmenü, weil die Lane nie eines geöffnet hat. Ein grüner Haken
 * über eine Fläche, die nicht im DOM war, ist dieselbe Fehlerklasse wie die
 * übersprungenen Prüfungen weiter oben: er sieht aus wie eine Zusage.
 *
 * Gemessen wird nur die Überlagerung (`include`), nicht die ganze Seite —
 * sonst meldet jeder Eintrag hier die Routen-Befunde ein zweites Mal und der
 * Fehlertext zeigt nicht mehr auf die Fläche, um die es geht.
 *
 * Beide Breiten sind nötig, weil `ResponsiveMenu` an `(width < 48rem)` in zwei
 * verschiedene Bäume verzweigt: Desktop bekommt Radix' `menuitemcheckbox`
 * geschenkt, das Blatt zeichnet seinen An/Aus-Zustand mit zwei divs und trägt
 * `role="switch"` + `aria-checked` von Hand (`ResponsiveMenuToggle`). Genau
 * die handgeschriebene Zusage braucht eine Messung.
 */
const OVERLAYS = [
  {
    name: 'Plusmenü (Desktop-Dropdown)',
    route: '/chat',
    viewport: { width: 1280, height: 720 },
    // Radix' DropdownMenuContent
    scope: '[role="menu"]',
    // `scrollable-region-focusable` trifft hier zu und ist trotzdem kein
    // Hindernis. Der Befund stimmt im DOM: `DropdownMenuContent` trägt
    // `overflow-y-auto` und eine gedeckelte Höhe, und seit dem Umbau ist die
    // Liste bei 720 px Fensterhöhe länger als der Deckel. Die Regel verlangt
    // dann `tabindex="0"` am Rollbereich — sie kennt nur Tab.
    //
    // Ein Menü wird aber nicht mit Tab durchlaufen, sondern mit den Pfeiltasten
    // (roving tabindex, WAI-ARIA Menu Pattern): der Rollbereich ist genau ein
    // Tabstopp, und der Browser rollt den fokussierten Eintrag ins Bild. Ein
    // zusätzlicher Tabstopp am Container wäre eine Verschlechterung.
    //
    // Deshalb steht die Regel hier ab — aber NICHT auf Zuruf: der Test unten
    // fährt mit der Tastatur ans Listenende und belegt, was die Regel bezweifelt.
    // Fällt das weg, ist die Ausnahme unbelegt und muss neu verhandelt werden.
    disableRules: ['scrollable-region-focusable'],
  },
  {
    name: 'Plusmenü (mobiles Blatt)',
    route: '/chat',
    viewport: { width: 390, height: 844 },
    // Das Blatt ist ein Radix-Dialog, siehe ResponsiveMenu.
    scope: '[role="dialog"]',
    disableRules: [],
  },
];

test.describe('Barrierefreiheit: Überlagerungen', () => {
  test.beforeAll(() => {
    test.skip(!BYPASS_AKTIV, 'VITE_E2E_AUTH_BYPASS ist nicht gesetzt.');
  });

  // Auch die Überlagerungen laufen in beiden Farbmodi. Sie sind der Ort, an dem
  // ein einseitiges Farbtoken am ehesten durchrutscht: ein Menü liegt über der
  // Seite, hat eigene Flächen- und Randfarben und wird von keiner
  // Routen-Prüfung erfasst.
  for (const theme of THEMES) {
    test.describe(modusName(theme), () => {
      test.use({ colorScheme: theme });

      for (const overlay of OVERLAYS) {
        test(`${overlay.name} hat keine WCAG-2.2-AA-Verstöße`, async ({ page }) => {
          // Vor dem Laden: `useIsMobile` liest die Breite schon im ersten Frame
          // (`useSyncExternalStore`), ein späterer Wechsel würde die falsche
          // Verzweigung messen.
          await page.setViewportSize(overlay.viewport);
          await gotoAuthenticated(page, theme, overlay.route);

          await page.getByRole('button', { name: 'Aktionen und Modus' }).click();

          const inhalt = page.locator(overlay.scope);
          await expect(
            inhalt,
            `${overlay.name}: die Überlagerung ist nach dem Klick nicht erschienen —
ohne sie prüft axe eine leere Auswahl und meldet null Verstöße.`
          ).toBeVisible();
          // Radix blendet mit einer Opazitäts-Animation ein. Währenddessen misst
          // `color-contrast` Zwischenwerte und meldet Funde, die nach dem Einblenden
          // nicht mehr existieren.
          await page.waitForTimeout(500);

          const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS).include(overlay.scope);
          if (overlay.disableRules.length) builder.disableRules(overlay.disableRules);

          const { violations } = await builder.analyze();

          expect(
            violations.map((v) => ({
              rule: v.id,
              impact: v.impact,
              hilfe: v.helpUrl,
              stellen: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
              // Axes eigene Begründung, und die ist der Unterschied zwischen
              // „irgendwo stimmt ein Kontrast nicht" und einem Befund, mit dem
              // man arbeiten kann: sie nennt die gemessenen Farben und das
              // Verhältnis. Ohne sie stand im CI-Log nur ein Klassenname, und
              // die Ursache (eine Überlagerung, die sich in die Messung
              // schob) war von einem echten Mangel nicht zu unterscheiden.
              messwerte: v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 300),
            }))
          ).toEqual([]);
        });
      }
    });
  }

  // Einfarbig, und mit Absicht: hier geht es um Tastaturführung, nicht um
  // Farben. Ein zweiter Durchlauf im Dunkelmodus prüfte exakt dieselbe Sache.
  test('das Ende des Dropdowns ist mit der Tastatur erreichbar', async ({ page }) => {
    // Der Beleg für die abgeschaltete Regel oben. Geprüft wird nicht, ob ein
    // `tabindex` irgendwo steht, sondern die Sache selbst: kommt man ans untere
    // Ende der Liste, obwohl sie über den Deckel hinausragt?
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoAuthenticated(page, 'light', '/chat');

    await page.getByRole('button', { name: 'Aktionen und Modus' }).click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    // Radix fokussiert beim Öffnen per Zeiger den Container, nicht einen
    // Eintrag. Pfeil-hoch springt von dort ans ENDE der Liste — also genau in
    // den Bereich, den die Regel für unerreichbar hält.
    await page.keyboard.press('ArrowUp');

    const eintraege = menu.locator('[role^="menuitem"]');
    const letzter = eintraege.last();
    await expect(
      letzter,
      `Pfeil-hoch hat den letzten Eintrag des Plusmenüs nicht fokussiert. Damit
ist die Ausnahme für scrollable-region-focusable nicht mehr belegt: entweder
ist die Tastaturführung kaputt, oder das Menü endet nicht mehr auf einem
Eintrag (ein Fußtext als letztes Kind reicht dafür schon).`
    ).toBeFocused();

    // Und der Eintrag muss auch sichtbar sein, nicht nur fokussiert — sonst
    // hätte der Rollbereich den Fokus zwar, zeigte ihn aber nicht.
    await expect(letzter).toBeInViewport();
  });
});

test.describe('Barrierefreiheit (WCAG 2.2 AA)', () => {
  test.beforeAll(() => {
    test.skip(
      !BYPASS_AKTIV,
      'VITE_E2E_AUTH_BYPASS ist nicht gesetzt — ohne das Flag im Dev-Server prüft die Lane 19× die Loginseite.'
    );
  });

  for (const theme of THEMES) {
    test.describe(modusName(theme), () => {
      test.use({ colorScheme: theme });

      for (const route of ROUTES) {
        test(`${route} hat keine WCAG-2.2-AA-Verstöße`, async ({ page }) => {
          await gotoAuthenticated(page, theme, route);

          const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
          const known = bekannteAusnahmen(theme, route);
          if (known.length) builder.disableRules(known);

          const { violations } = await builder.analyze();

          // Bei Verstößen die betroffenen Selektoren mit ausgeben — eine reine
          // Regel-ID schickt die nächste Person auf die Suche.
          expect(
            violations.map((v) => ({
              rule: v.id,
              impact: v.impact,
              hilfe: v.helpUrl,
              stellen: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
              // Axes eigene Begründung, und die ist der Unterschied zwischen
              // „irgendwo stimmt ein Kontrast nicht" und einem Befund, mit dem
              // man arbeiten kann: sie nennt die gemessenen Farben und das
              // Verhältnis. Ohne sie stand im CI-Log nur ein Klassenname, und
              // die Ursache (eine Überlagerung, die sich in die Messung
              // schob) war von einem echten Mangel nicht zu unterscheiden.
              messwerte: v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 300),
            }))
          ).toEqual([]);
        });
      }
    });
  }
});
