/**
 * Fester Datenstand für die Barrierefreiheits-Lane.
 *
 * Warum überhaupt: die Lane prüfte `/boards` datenabhängig — zwei Läufe
 * DERSELBEN Fassung ergaben 782 vs. 834 Vorkommen, und ein Nicht-Befund von
 * `nested-interactive` bedeutete nichts, weil das Board leer war. Eine Lane,
 * deren Ergebnis vom Zufallszustand einer Datenbank abhängt, kann nie
 * Required Check werden.
 *
 * Warum `page.route()` und kein echtes Backend: der Auth-Bypass ist rein
 * clientseitig (siehe Kommentar in `a11y.spec.ts`), die Seite braucht also
 * ohnehin keinen Server. Damit fällt in CI beides weg — das leere Secret
 * `DEV_AUTH_BYPASS_TOKEN` und die Service-Container für Postgres/Redis/API.
 *
 * Bewusst schmal: gemockt wird nur, was ein Prüfziel hat. Alles andere
 * beantworten wir mit einer leeren, aber wohlgeformten Hülle — eine Seite im
 * Leerzustand ist ein gültiges Prüfziel, eine Seite im Fehlerzustand wäre es
 * auch, aber nicht reproduzierbar.
 */
import { type Page, type Route } from '@playwright/test';

/** Feste ID, damit die Route in `ROUTES` und der Mock dieselbe Karte meinen. */
export const FIXTURE_BOARD_ID = '11111111-1111-4111-8111-111111111111';

const NUTZER_ID = '00000000-0000-4000-a000-000000000001';
const ZEITPUNKT = '2026-01-15T10:00:00.000Z';

const STATUS_FELD_ID = 'feld-status';
const TITEL_FELD_ID = 'feld-titel';

/** Genau eine Karte je Spalte: mehr prüft dieselben Komponenten noch einmal. */
const KARTEN = [
  { id: 'karte-1', titel: 'Antrag zur Verkehrswende schreiben', status: 'offen' },
  { id: 'karte-2', titel: 'Pressemitteilung abstimmen', status: 'in-arbeit' },
  { id: 'karte-3', titel: 'Kreisverband informieren', status: 'erledigt' },
];

const boardDocument = {
  id: FIXTURE_BOARD_ID,
  title: 'Prüf-Board',
  created_by: NUTZER_ID,
  last_edited_by: NUTZER_ID,
  document_subtype: 'boards',
  permissions: { [NUTZER_ID]: { level: 'owner', granted_at: ZEITPUNKT } },
  is_public: false,
  is_deleted: false,
  created_at: ZEITPUNKT,
  updated_at: ZEITPUNKT,
  creator_name: 'Test User',
  content: { board_type: 'kanban' },
  description: null,
};

const boardState = {
  id: FIXTURE_BOARD_ID,
  title: 'Prüf-Board',
  boardType: 'kanban',
  fields: [
    { id: TITEL_FELD_ID, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
    {
      id: STATUS_FELD_ID,
      name: 'Status',
      type: 'select',
      typeOptions: {
        options: [
          { id: 'offen', name: 'Offen', color: 'grey' },
          { id: 'in-arbeit', name: 'In Arbeit', color: 'yellow' },
          { id: 'erledigt', name: 'Erledigt', color: 'green' },
        ],
      },
      order: 1,
    },
  ],
  rows: KARTEN.map((k) => ({
    id: k.id,
    cells: { [TITEL_FELD_ID]: k.titel, [STATUS_FELD_ID]: k.status },
    createdBy: NUTZER_ID,
    createdAt: ZEITPUNKT,
  })),
  views: [
    {
      id: 'ansicht-kanban',
      name: 'Kanban',
      layout: 'kanban',
      groupByFieldId: STATUS_FELD_ID,
      filters: [],
      sorts: [],
      fieldSettings: [
        { fieldId: TITEL_FELD_ID, visible: true },
        { fieldId: STATUS_FELD_ID, visible: true },
      ],
    },
  ],
};

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Playwright wertet Routen in **umgekehrter** Registrierungsreihenfolge aus —
 * die zuletzt registrierte gewinnt. Deshalb steht die Auffangregel zuerst und
 * die spezifischen danach; andersherum würde die Auffangregel alles schlucken.
 */
export async function installApiFixtures(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Der Schlüssel, den das Banner in `index.html` wirklich liest. Die drei
    // Namen in `pageHelpers.ts` (`cookie-consent`, `gruenerator_cookie_consent`,
    // `cookieConsent`) trafen keinen davon — dort fällt es nicht auf, weil die
    // Hilfsfunktion den Knopf zusätzlich anklickt.
    localStorage.setItem('termsAccepted', 'true');
  });

  // react-scan wird in `index.html` auf JEDEM localhost-Host von unpkg
  // nachgeladen — also auch in CI. Sein Overlay-Knopf hat keinen
  // zugänglichen Namen und erschien als `button-name`-Verstoß auf allen 19
  // Routen. Das ist Werkzeug, nicht Oberfläche: in Produktion lädt es nie.
  // Blockieren statt ausschließen, damit die Lane nebenbei auch nicht mehr
  // davon abhängt, dass unpkg.com erreichbar ist.
  await page.route('**/react-scan/**', (route) => route.abort());

  // Auffangregel: leere, wohlgeformte Antwort statt eines Netzwerkfehlers.
  // `data` und `items` gleichzeitig, weil beide Hüllenformen im Bestand
  // vorkommen — eine Liste, die nichts enthält, rendert den Leerzustand.
  //
  // Als Prädikat, NICHT als Glob `**/api/**`: der Vite-Dev-Server liefert
  // Quelldateien unter ihrem echten Pfad aus, und
  // `/@fs/…/packages/shared/src/api/index.ts` enthält `/api/`. Der Glob hat
  // dieses Modul mit JSON beantwortet — React bootete gar nicht mehr, die
  // Seiten waren leer, und die Lane meldete 19× grün. Genau die Fehlerklasse,
  // gegen die diese Datei geschrieben ist.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => json(route, { success: true, data: [], items: [] })
  );

  // Server-Sent-Events: eine JSON-Antwort bringt den EventSource dazu, in einer
  // Schleife neu zu verbinden („MIME type is not text/event-stream").
  await page.route(
    (url) => url.pathname.endsWith('/stream'),
    (route) => route.abort()
  );

  /**
   * Endpunkte, deren Antwortform die Auffangregel nicht trifft. Die Liste ist
   * empirisch: jeder Eintrag stand vorher als Fehlerzustand auf dem Bildschirm.
   *
   * Warum das überhaupt zählt: ein fehlgeschlagener Aufruf erzeugt einen
   * Hinweis, und die Hinweisfarben erreichen 3,07:1 (Warnung) bzw. 4,34:1
   * (Fehler). Die Lane hätte also elf Routen wegen eines Fehlers gerügt, den
   * sie selbst ausgelöst hat — ein Befund über das Prüfmittel, nicht über die
   * Oberfläche. (Dass die Hinweisfarben ihrerseits unter 4,5:1 liegen, ist ein
   * echter Befund; er gehört in einen eigenen PR, nicht in diese Liste.)
   *
   * Die vier letzten Einträge kamen dazu, als der Fehlergrenzen-Riegel in
   * `a11y.spec.ts` sichtbar machte, dass drei Routen gar nicht die Seite
   * zeigten, deren Namen sie trugen: die Auffangregel ist ein *Objekt*, und wer
   * das Ergebnis durchläuft, bekommt keinen Leerzustand, sondern einen Absturz
   * („object is not iterable", „filtered.map is not a function"). Deshalb ist
   * die Form hier jeweils die, die der Vertrag zusagt — Array bleibt Array.
   */
  const SONDERFORMEN: Record<string, unknown> = {
    // `apiClient.get<ApiThread[]>` — ein nacktes Array, keine Hülle.
    '/api/chat-service/threads': [],
    // ts-rest, `res.body.agents`.
    '/api/user-agents': { agents: [] },
    '/api/user-agents/public': { agents: [] },
    '/api/recurring-tasks': { tasks: [] },
    '/api/auth/groups': { groups: [] },
    '/api/auth/notebook-collections': { success: true, collections: [] },
    '/api/auth/notebook-collections/public': { success: true, collections: [] },
    '/api/auth/notebook-collections/likes': { success: true, liked_ids: [] },
    '/api/research/filters': { filters: {} },
    // ts-rest `canvas.list`, `res.body` ist die Liste selbst — `/studio`.
    '/api/canvas': [],
    // ts-rest `groups.discoverPublicGroups`, ebenfalls nackt — `/projekte`.
    '/api/auth/groups/discover': [],
    // `MediaListResponse`: die Liste heißt `data` (nicht `items`), und
    // `pagination` ist nicht optional — `getNextPageParam` liest es ohne Umweg,
    // `flatMap((page) => page.data)` ebenso. Mit `items` statt `data` ergibt der
    // flatMap `[undefined]`, und `/media-library` stirbt eine Zeile später an
    // `item.id`. Deshalb hier genau die Form aus `types.ts`.
    '/api/media': {
      success: true,
      data: [],
      pagination: { total: 0, limit: 24, offset: 0, hasMore: false },
    },
  };
  for (const [pfad, antwort] of Object.entries(SONDERFORMEN)) {
    await page.route(
      (url) => url.pathname === pfad,
      (route) => json(route, antwort)
    );
  }

  await page.route(
    (url) => url.pathname === `/api/boards/${FIXTURE_BOARD_ID}`,
    (route) => json(route, boardDocument)
  );
  await page.route(
    (url) => url.pathname === `/api/boards/${FIXTURE_BOARD_ID}/state`,
    (route) => json(route, boardState)
  );
}
