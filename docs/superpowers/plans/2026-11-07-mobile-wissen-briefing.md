# App: Wissen, Briefing, Umfragen nativ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App bekommt den Wissen-Screen im neuen /wissen-Design, einen nativen Briefing-Screen und einen nativen Umfragen-Screen. Die Daten und Regeln teilen sich App und Web über `packages/shared`.

**Architecture:**
- **Gemeinsame Logik:** Die reine Datenlogik des Webs (ohne React, ohne DOM) zieht nach `packages/shared/src/monitor/` und `packages/shared/src/notebooks/`. Web und App importieren sie von dort.
- **Daten in der App:** schlanke TanStack-Query-Hooks über `getContractsClient().monitor.*`.
- **Oberfläche:** React-Native-Bausteine. Die Folien wechseln mit Reanimated auf dem UI-Thread, ihr Zustand liegt in einem Kind-Teil, damit ein Folienwechsel nicht den Screen neu rendert.

**Tech Stack:** Expo 58, React Native 0.86, Reanimated 4.7, Gesture Handler 3.3, react-native-svg 15.16, d3-geo/d3-scale/topojson-client, TanStack Query 5, expo-router, expo-web-browser, vitest (Node-Lane `*.vitest.ts`), jest-expo (`*.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-wissen-briefing-design.md`

## Global Constraints

- Branch `feat/mobile-wissen-briefing`, gestapelt auf `feat/wissen-dashboard-redesign` (PR #5427). Der PR geht gegen diesen Branch, nicht gegen master.
- Abhängigkeiten der App nur über `npx expo install <pkg>` (in `apps/mobile`), nie `pnpm add`.
- Bilder nur über `expo-image`.
- TypeScript strict, `import { type Foo }` inline, kein `undefined` in eigenen Typen (`| null`).
- Keine Farbwerte in Komponenten. Dashboard-Farben gibt es nur über `useDashboardColors()` (Task 3).

  Werte hell / dunkel:

  | Name | Hell | Dunkel |
  |---|---|---|
  | `mg` | `#b0005f` | `#f06ba8` |
  | `mgInk` | `#8a004a` | `#f7b3d2` |
  | `onMg` | `#ffffff` | `#161314` |
  | `mgTint` | `#fce4ef` | `#3a1a2b` |
  | `mgTint2` | `#f8cfe1` | `#4a2238` |
  | `mgSub` | `#6e2a4c` | `#d9a3bd` |
  | `mgDot` | `#e7c3d4` | `#5a3447` |
  | `page` | `#f9f6f7` | `#161314` |
  | `card` | `#ffffff` | `#242022` |
  | `skeleton` | `#efe8eb` | `#332c30` |

- **Folien:**
  - Intervall `SLIDE_INTERVAL_MS = 6000`.
  - Eine Folie, die von Hand gewählt oder gewischt wurde, hält das Durchwechseln an, bis jemand den Pause-Knopf drückt.
  - Nach dem Loslassen bekommt die Folie die volle Zeit.
  - Angesagt werden nur von Hand gewechselte Folien.
  - Bei „Bewegung reduzieren“ wechselt nichts von selbst.
- **Locale:** `useAuth().locale === 'de-AT'` ergibt `'at'`, alles andere `'de'`, auch solange das Profil lädt. Unter `at`:
  - der Slider zeigt nur den Watcher;
  - die Karte Landesverbände entfällt;
  - die Umfragen zeigen `oesterreich`.
- **Dieselben Abfragen wie im Web:**
  - `whatHappened` mit `{ days: 7 }`;
  - `entityResults('gruene' | 'gruene-at', locale)`;
  - `keywordArticles(locale)`;
  - `polls({ parliament })`;
  - `pollsOverview({ country })`;
  - `euGreens()`;
  - `latest({ locale })`.

  `staleTime` wie in `apps/web/src/features/monitor/hooks/useMonitor.ts`. Kein Speichern auf dem Gerät.
- **Zielflächen** ≥ 44 pt.
- **Barrierefreiheit:** Jede Folie hat ein `accessibilityLabel`, jeder Punkt eins wie „Meldung 2 von 6“, und es gibt einen Pause-Knopf.
- **Checks** paketweise und nacheinander, nie `pnpm run ci`:
  - `pnpm --filter <pkg> exec tsc --noEmit`;
  - `npx eslint <dateien>`;
  - `npx vitest run <datei>`;
  - `npx jest <datei>` (in `apps/mobile`).
- **Commits** nach Conventional Commits, englisch, Subject klein. Nie `git stash`, nie `git checkout -- <file>`.
- **Neuer Worktree:** `node_modules` ist nicht installiert. Vor dem ersten Check im Worktree-Root `pnpm install --frozen-lockfile` laufen lassen. Bei „Already up to date“ ohne Pakete erst `rm node_modules/.pnpm-workspace-state.json`.

## Native-Regeln und App-Performance

Aus den Skills `animate-expo`, `expo-native-ui`, `expo-design-system`, `expo-data-fetching` und `expo-ui` sowie dem Repo. Jeder Implementer lädt vor seinem Task die Skills `animate-expo` und `expo:expo-native-ui` (Task 7 zusätzlich `expo:expo-data-fetching`).

- **Animation auf dem UI-Thread:**
  - Shared Values nur mit `.get()`/`.set()`, nie `.value` und nie im Render lesen oder schreiben, denn der React Compiler läuft im Release-Build.
  - Von einem Worklet zu React geht es nur über `scheduleOnRN` (`react-native-worklets`), nicht über `runOnJS`, und nur beim Seitenwechsel, nie pro Frame.
  - Kein `setState` in Gesture- oder Scroll-Handlern.
- **Überblenden:** nur Opacity, `withTiming` 280 ms, `Easing.bezier(0.23, 1, 0.32, 1)`.
- **Wischen:**
  - `Gesture.Pan()` mit `activeOffsetX([-10, 10])` und `failOffsetY([-10, 10])`. Die Seite entscheidet sich nach Geschwindigkeit ODER Weg (40 px).
  - „Halten“ setzt `onBegin` und hebt `onFinalize` auf; das ruft `hold`/`release` über `scheduleOnRN`.
- **Bewegung reduzieren:** über `useReduceMotion()` aus `apps/mobile/hooks/useAccessibilityPreferences.ts`, nicht über den Hook von Reanimated. Er verbindet die Systemeinstellung mit der Profileinstellung. Bei reduzierter Bewegung gibt es keinen Selbstwechsel, das Überblenden bleibt.
- **Screenreader:** Der Slider bietet `accessibilityActions` (`increment`/`decrement`) zusätzlich zum Wischen.
- **Haptik:**
  - `Haptics.selectionAsync()` beim Punkt-Wechsel von Hand, beim Aufklappen einer Kachel oder Karte und beim Antippen eines Landes;
  - nie beim Selbstwechsel und höchstens eine Rückmeldung pro Aktion (Vorbild: `components/tools/ToolDock.tsx`).
- **Aufklappen:** Layout-Animationen (`LinearTransition` am Raster, `FadeIn`/`FadeOut` am Panel; Vorbild `components/common/NoticeToast.tsx`).
  - Nie `height` oder `flex` animieren.
  - Keine festen Höhen, weil Text skaliert.
  - Keys bleiben stabil, und der offene Zustand liegt im Kind-Teil.
  - `@expo/ui` wird hier nicht genutzt: `Collapsible`/`List` passen nicht zu den gestalteten Karten.
- **Druck-Rückmeldung:** Karten und Kacheln skalieren beim Drücken auf 0,97 (100–150 ms).
- **Screen-Rahmen:**
  - `ScreenScaffold` wie bisher, `ScrollView` mit Abständen in `contentContainerStyle` und `gap`.
  - Pull-to-Refresh über `RefreshControl`, das alle Abfragen des Screens neu lädt.
  - Schatten als `boxShadow`-String, `borderCurve: 'continuous'`, Zahlen mit `fontVariant: ['tabular-nums']`.
- **Vier Zustände je Karte:** laden (`Skeleton` aus `components/common/Skeleton.tsx` in Kartenform), Fehler, leer, Inhalt.
  - Für Fehler gilt: Daten im Cache bleiben stehen, darunter ein kleiner Hinweis mit „Erneut versuchen“ (Vorbild `components/workplace/LoadErrorNotice.tsx`).
  - Beim ersten Laden blitzt kein „leer“ auf.
- **Timer und Hintergrund:**
  - Der Folien-Timer hält bei `!useIsFocused()` und bei `AppState !== 'active'` (Task 4).
  - `services/queryClient.ts` bleibt unverändert, also ohne `focusManager` und ohne `onlineManager` *(Entscheidung: `refetchOnWindowFocus` ist dort global aus; das Verdrahten würde das Verhalten der ganzen App ändern und gehört in einen eigenen PR)*.
- **Keine virtualisierten Listen** im senkrechten `ScrollView`. Die Listen haben höchstens 10 Einträge und werden als einfache `map` ausgegeben, mit `memo` je Eintrag und stabilen Keys.
- **Karten-SVG:**
  - Die Pfade werden einmal je GeoJSON und Breite berechnet.
  - Ein `memo`-`Region` je `<Path>` mit `onPress`; die Auswahl kommt über die ID, nicht über Koordinaten.
  - Kleine Länder bekommen eine breitere, transparente Kontur als Zielfläche.
  - Farbe ist nie das einzige Signal: Ein angetipptes Land zeigt seinen Wert als Text.
  - Kein Pinch oder Pan auf der Karte.
- **Wiederverwenden statt neu bauen:**
  - `components/common/Skeleton.tsx`;
  - `components/common/EmptyState.tsx`;
  - `components/workplace/LoadErrorNotice.tsx`;
  - `components/navigation/ScreenScaffold.tsx`;
  - `hooks/useTheme.ts` und `theme/` (`spacing`, `typography`, `scale`);
  - `components/notebook/NotebookTile.tsx` und `NotebookCoverArt.tsx` für die Notebook-Bilder.
- **Nicht als Vorbild nehmen:** `components/image-studio/sharepic/SlideCarousel.tsx`. Es ist eine andere Bauart, eine waagerecht scrollende `FlatList`, die den Index im JS-`onScroll` berechnet. Gerendert wird dort nur beim Einrasten auf eine neue Folie, für ein reines Wisch-Karussell ist das in Ordnung. Für einen überblendenden, selbst wechselnden Slider ist das gute Vorbild `components/workplace/WorkplacePager.tsx`: Die Bewegung läuft auf dem UI-Thread, React erfährt nur den fertigen Wechsel.
- **Gefühl und Ruckeln beurteilen** nur im Release-Build (`--no-dev --minify`) auf dem Android-Emulator, nicht im Dev-Build.

## Review Focus

1. **Leere Daten:** Monitor ohne Snapshot (404), leere Feed- und Watcher-Listen, `at` ohne Feed. Jede Karte zeigt ihren leeren Zustand wie im Web und stürzt nicht ab. Der Slider zeigt mit 0 Schlagzeilen den leeren Zustand und mit 1 Schlagzeile keine Punkte. → Tests in Task 1 (`wissenHeadlines` mit leeren Eingaben) und Task 4 (`slideReducer` mit `count` 0 und 1).
2. **Screen verlassen oder App im Hintergrund:** Der Slider-Timer läuft nicht weiter, und nach der Rückkehr wechselt die Folie nicht sofort. → Test in Task 4 (`pausedByLifecycle`).
3. **Weniger Folien als vorher** (Refetch liefert 3 statt 6): Der aktive Index bleibt gültig. → Test in Task 4.
4. **Unbekanntes Land** in `/umfragen?land=xyz` führt zurück zur Übersicht und stürzt nicht ab. → Test in Task 7 (`umfragenRegion('xyz') === null` plus Redirect).
5. **Fehler beim Laden der Geodaten** (offline): Die Karten zeigen ihren Platzhalter, die Balken bleiben sichtbar. → Test in Task 7.

---

## Arbeitsteilung

- **Agent A:** Tasks 1–6, in dieser Reihenfolge.
- **Agent B:** Task 7, startet erst nach Task 3, im eigenen Worktree vom dann gepushten Stand.
  - B ändert die Dateien aus Tasks 1–3 nicht.
  - Neue Helfer legt B in eigenen Dateien an (`packages/shared/src/monitor/choropleth.ts` und unter `apps/mobile/components/umfragen/`).
  - Am Ende mergt A den Branch von B in `feat/mobile-wissen-briefing`, mit einem normalen Merge.
- **Task 8** (Vorführung) macht die Hauptsitzung.

---

### Task 1: Monitor-Logik nach `packages/shared/src/monitor`

**Files:**
- Move (`git mv`), jeweils mit Test, wo vorhanden:
  - `apps/web/src/components/dashboard/teaser.ts` und `teaser.vitest.ts` → `packages/shared/src/monitor/teaser.ts` und `teaser.vitest.ts`;
  - `apps/web/src/components/dashboard/timeAgo.ts` → `packages/shared/src/monitor/timeAgo.ts`;
  - `apps/web/src/features/monitor/briefing/briefingLead.ts` und `.vitest.ts` → `packages/shared/src/monitor/`;
  - `apps/web/src/features/monitor/briefing/briefingSignals.ts` und `.vitest.ts` → `packages/shared/src/monitor/`;
  - `apps/web/src/features/monitor/pollFormat.ts` → `packages/shared/src/monitor/`;
  - `apps/web/src/features/monitor/umfragenRegion.ts` und `.vitest.ts` → `packages/shared/src/monitor/`;
  - `apps/web/src/features/monitor/bundeslaender.ts` → `packages/shared/src/monitor/`.
- Create:
  - `packages/shared/src/monitor/news.ts` und `news.vitest.ts`;
  - `packages/shared/src/monitor/index.ts`.
- Modify:
  - `packages/shared/package.json` bekommt den Subpath `"./monitor"` nach dem Muster von `"./utils"`;
  - die Web-Konsumenten werden auf `@gruenerator/shared/monitor` umgestellt. Liste: `grep -rln "dashboard/teaser\|dashboard/timeAgo\|briefingLead\|briefingSignals\|pollFormat\|umfragenRegion\|bundeslaender" apps/web/src`.
  - `apps/web/src/features/notebook/wissen/useWissenNews.ts` und `apps/web/src/features/monitor/briefing/useBriefingNews.ts` nutzen die neuen Funktionen aus `news.ts`.
  - `standLine` wandert aus `BriefingView.tsx` nach `news.ts`.

**Interfaces:**
- Produces (`@gruenerator/shared/monitor`): alle bisherigen Exporte unverändert. `umfragenRegion.ts` importiert `MonitorLocale` jetzt aus `@gruenerator/contracts`. Neu in `news.ts`:
  - `interface DashboardArticle { key: string; title: string; text: string; source: string; time: string; href: string }`. Das ist das bisherige `WissenArticle`; das Web exportiert `WissenArticle` als Alias weiter.
  - `const HEADLINE_COUNT = 6`;
  - `function feedArticles(days: WhatHappenedResponse['days'] | null, now?: number): DashboardArticle[]`;
  - `function watcherArticles(articles: MonitorArticle[] | null, now?: number): DashboardArticle[]`;
  - `function wissenHeadlines(feed: DashboardArticle[], watcher: DashboardArticle[], count?: number): DashboardArticle[]`. Abwechselnd, Feed zuerst, wie das bisherige `interleave`.
  - `interface BriefingNewsItem`, `interface BriefingNewsList` (aus `useBriefingNews.ts`), `const NEWS_LIMIT = 10`;
  - `function monitorNewsItems(articles: MonitorArticle[]): BriefingNewsItem[]`;
  - `function landesverbandNewsItems(days: WhatHappenedResponse['days']): BriefingNewsItem[]`;
  - `function standLine(snapshot: MonitorSnapshot): string`.
  - Die Typen kommen aus `@gruenerator/contracts`. Den Namen des Antwort-Typs von `whatHappened` dort nachsehen.

- [ ] **Step 1: Tests für `news.ts` schreiben**

```ts
// packages/shared/src/monitor/news.vitest.ts
it('interleaves feed and watcher, feed first, capped at count', () => {
  const f = [a('f1'), a('f2')], w = [a('w1'), a('w2'), a('w3')];
  expect(wissenHeadlines(f, w, 4).map((x) => x.key)).toEqual(['f1', 'w1', 'f2', 'w2']);
});
it('fills from one stream when the other is empty', () => {
  expect(wissenHeadlines([], [a('w1'), a('w2')]).map((x) => x.key)).toEqual(['w1', 'w2']);
  expect(wissenHeadlines([], [])).toEqual([]);
});
it('takes at most HEADLINE_COUNT per stream and teasers the text', () => { /* feedArticles mit 8 Artikeln → 6; text === teaser(title, excerpt) */ });
it('caps briefing lists at NEWS_LIMIT', () => { /* monitorNewsItems(12 Artikel).length === 10 */ });
it('formats the stand line', () => {
  expect(standLine(snap({ createdAt: '2026-11-07T08:05:00Z', totalArticles: 1234, sources: ['a', 'b'] })))
    .toMatch(/^Stand \d\d:\d\d · 1\.234 Artikel aus 2 Quellen$/);
});
```

- [ ] **Step 2:** `cd packages/shared && npx vitest run src/monitor/news.vitest.ts`. Erwartet: FAIL, Modul fehlt.
- [ ] **Step 3: Dateien verschieben, `news.ts` und `index.ts` anlegen, Subpath in `package.json` eintragen.** Die Logik übernimmst du 1:1 aus `useWissenNews.ts` und `useBriefingNews.ts`. In der Hook-Datei bleibt nur der Query-Aufruf mit `useMemo` über die neuen Funktionen.
- [ ] **Step 4:** `npx vitest run src/monitor` in `packages/shared`, dann `pnpm --filter @gruenerator/shared exec tsc --noEmit` und `pnpm --filter @gruenerator/web exec tsc --noEmit`. Erwartet: alles grün.
- [ ] **Step 5:** `cd apps/web && npx vitest run src/features/monitor src/features/notebook/wissen src/components/dashboard`. Erwartet: grün, mindestens die 103 Tests von vorher, abzüglich der verschobenen.
- [ ] **Step 6: Commit** `refactor(monitor): share the pure dashboard logic between web and app`

### Task 2: Notebook-Regale als reine Funktion

**Files:**
- Create: `packages/shared/src/notebooks/shelves.ts` und `shelves.vitest.ts`.
- Modify:
  - `packages/shared/src/notebooks/index.ts` exportiert die neue Datei;
  - `apps/web/src/features/notebook/wissen/useNotebookShelves.ts` baut nur noch die Eingaben und ruft `buildNotebookShelves`.

**Interfaces:**
- Produces:

```ts
export interface ShelfNotebook { id: string; title: string; meta: string }
export type ShelfEntry<NB, C, S> =
  | { kind: 'system'; key: string; notebook: NB }
  | { kind: 'own'; key: string; collection: C }
  | { kind: 'shared'; key: string; collection: C }
  | { kind: 'saved'; key: string; item: S };
export type Shelf<NB, C, S> =
  | { id: string; kind: 'group'; title: string; meta: string | null; entries: ShelfEntry<NB, C, S>[]; layout: 'photos' | 'cards' }
  | { id: string; kind: 'notebook'; title: string; meta: string; notebook: NB }
  | { id: string; kind: 'create'; title: string; meta: string };
export const SHELF_HIDDEN_NOTEBOOK_IDS: readonly string[]; // die vier IDs aus dem Web
export function buildNotebookShelves<NB extends ShelfNotebook, C extends { id: string }, S extends { ref: string }>(input: {
  austrian: boolean;
  austrianNotebooks: NB[];      // bereits nach Locale gefiltert
  laender: NB[];                // dto.
  bundesverband: NB | null;
  parlamente: NB[];             // dto.
  wiki: NB | null;
  own: C[]; shared: C[]; saved: S[];
  mineLoading: boolean;
}): Shelf<NB, C, S>[];
```

  Die Logik übernimmst du 1:1 aus dem `useMemo` in `useNotebookShelves.ts`, ebenso die Texte („Meine Notebooks“, „Erstes Notebook anlegen“, `plural`). Die Aufrufer filtern vorher nach Sichtbarkeit und `SHELF_HIDDEN_NOTEBOOK_IDS`.

- [ ] **Step 1: Tests**
  - Deutschland: Die Reihenfolge ist `laender, parlamente, meine, kommunalwiki`.
  - Der Bundesverband steht vorn in `laender`.
  - Ohne Länder, aber mit Bundesverband, wird der Bundesverband eine eigene `notebook`-Kachel.
  - Österreich ergibt `[...austrianNotebooks als notebook, meine]`.
  - `meine` ist `create`, wenn nichts lädt und nichts da ist.
  - `meta` ist `null`, solange es lädt.
  - `meta` von `meine` lautet „1 Notebook“ bzw. „3 Notebooks“.
- [ ] **Step 2:** `npx vitest run src/notebooks/shelves.vitest.ts`. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren und den Web-Hook umstellen.
- [ ] **Step 4:** Shared-Tests und `tsc` für shared und web, dann `cd apps/web && npx vitest run src/features/notebook/wissen`. Erwartet: grün.
- [ ] **Step 5: Commit** `refactor(notebooks): share the shelf model between web and app`

### Task 3: App-Fundament — Farben, Monitor-Hooks, geteilte Notebooks

**Files:**
- Create:
  - `apps/mobile/theme/dashboard.ts`: `dashboardColors.light` und `dashboardColors.dark` mit den Werten aus den Global Constraints, dazu `useDashboardColors()` über `useColorScheme()`;
  - `apps/mobile/hooks/monitor/useMonitor.ts`;
  - `apps/mobile/hooks/monitor/monitorLocale.ts` und `monitorLocale.vitest.ts`;
  - `apps/mobile/hooks/notebook/useSharedNotebookCollections.ts`.
- Modify: `apps/mobile/theme/index.ts` exportiert `dashboard.ts`.

**Interfaces:**
- Produces:
  - `type DashboardColors = { mg; mgInk; onMg; mgTint; mgTint2; mgSub; mgDot; page; card; skeleton: string }`;
  - `useDashboardColors(): DashboardColors`;
  - `toMonitorLocale(userLocale: string | null | undefined): MonitorLocale` und `useMonitorLocale(): MonitorLocale` in `monitorLocale.ts`;
  - in `useMonitor.ts`: `useMonitorSnapshot(locale)`, `useWhatHappened(locale, opts: { days: number })`, `useEntityResults(entityId, locale)`, `useKeywordArticles(locale)`, `usePolls(parliament)`, `usePollsOverview(country: 'DE' | 'AT')`, `useEuGreens()`. Jeder Hook ist ein `useQuery` mit dem Query-Key und der `staleTime` des Web-Hooks gleichen Namens. Bei einem Status ungleich 200 wirft er `apiErrorFromResponse(res, '<deutscher Text>')`. `useMonitorSnapshot` liefert bei 404 `null`, wie im Web.
  - `useSharedNotebookCollections()`: dieselbe Abfrage wie `apps/web/src/features/notebook/hooks/useSharedNotebookCollections.ts`.

- [ ] **Step 1: Test**

```ts
expect(toMonitorLocale('de-AT')).toBe('at');
expect(toMonitorLocale('de-DE')).toBe('de');
expect(toMonitorLocale(null)).toBe('de');
```

- [ ] **Step 2:** `cd apps/mobile && npx vitest run hooks/monitor/monitorLocale.vitest.ts`. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Test grün, dann `pnpm --filter @gruenerator/mobile exec tsc --noEmit`. Den Paketnamen in `apps/mobile/package.json` nachsehen.
- [ ] **Step 5: Commit und push**, damit Agent B starten kann: `feat(mobile): add dashboard colors and monitor data hooks`

### Task 4: Folien-Logik und Folien-Bausteine (App)

**Files:**
- Create:
  - `apps/mobile/components/dashboard/slideState.ts` und `slideState.vitest.ts`: reine Logik;
  - `apps/mobile/components/dashboard/useAutoAdvance.ts`;
  - `apps/mobile/components/dashboard/SlideDots.tsx`;
  - `apps/mobile/components/dashboard/SlideStack.tsx`;
  - `apps/mobile/components/dashboard/SlideStack.test.tsx`.

**Interfaces:**
- Produces:
  - `slideReducer(state: SlideState, action: SlideAction): SlideState` mit
    - `SlideState = { index: number; stopped: boolean; manual: boolean }`;
    - `SlideAction = { type: 'tick'; count: number } | { type: 'select'; index: number; count: number } | { type: 'toggle' }`;
  - `activeIndex(state, count): number`, also `index % count`, bei `count` 0 ergibt das 0;
  - `useAutoAdvance(count: number, intervalMs: number | null)` mit dem Rückgabewert `{ active, select, announced: number | null, playing: boolean, togglePlaying, hold: () => void, release: () => void }`.
- Verhalten von `useAutoAdvance`:
  - Es hält, solange der Screen nicht fokussiert ist (`useIsFocused` aus expo-router bzw. `@react-navigation/native`) oder `AppState` nicht `active` ist.
  - Nach Rückkehr oder `release` bekommt die Folie die volle Zeit (setTimeout-Kette mit Neustart, wie `apps/web/src/components/dashboard/slides.tsx`).
  - „Halten“ steht in einer Ref, nicht im State.
- `SlideDots({ labels, active, onSelect })` ist `memo`.
- `SlideStack({ slides: { key; label; content: ReactNode }[]; style? })`:
  - Wischen und Überblenden nach dem Abschnitt „Native-Regeln und App-Performance“. Senkrechtes Ziehen bleibt Scrollen.
  - Überblenden mit Reanimated-Opacity.
  - Inaktive Folien bekommen `accessibilityElementsHidden` und `importantForAccessibility="no-hide-descendants"`.

- [ ] **Step 1: Tests für `slideState.vitest.ts`**
  - `tick` zählt weiter und läuft am Ende auf 0 um;
  - `select` setzt `stopped` und `manual`;
  - `toggle` hebt `stopped` auf;
  - `activeIndex({index: 5}, 3) === 2`;
  - `activeIndex(s, 0) === 0`;
  - mit `count` 1 bleibt `tick` bei 0.
- [ ] **Step 2: Test für `SlideStack.test.tsx`**
  - Mit 3 Folien rendert ein Folienwechsel die Folien-Inhalte nicht neu. Die Inhalte bekommen einen Zähl-Kind-Teil per `memo`; der Zähler bleibt nach `select(1)` gleich.
  - Mit 1 Folie gibt es keine Punkte.
  - **Lebenszyklus** (`pausedByLifecycle`): Mit Fake-Timern läuft der Timer nicht weiter, solange `AppState` `background` meldet. Danach wartet die Folie wieder volle 6000 ms.
- [ ] **Step 3:** `npx vitest run components/dashboard/slideState.vitest.ts` und `npx jest components/dashboard/SlideStack.test.tsx`. Erwartet: FAIL.
- [ ] **Step 4:** Implementieren.
- [ ] **Step 5:** Beide Tests grün, `tsc` für mobile grün.
- [ ] **Step 6: Commit** `feat(mobile): add slide state, dots and swipeable slide stack`
- [ ] **Step 7: Monitor-Daten beim Zurückkehren in die App auffrischen**
  - In `apps/mobile/services/queryClient.ts` `focusManager.setEventListener((setFocused) => AppState.addEventListener('change', (s) => setFocused(s === 'active')).remove)` eintragen, nach dem React-Native-Rezept von TanStack Query v5.
  - Die globale Vorgabe `refetchOnWindowFocus: false` bleibt. Nur die Hooks in `apps/mobile/hooks/monitor/useMonitor.ts` setzen `refetchOnWindowFocus: true`. Ob sie wirklich neu laden, entscheidet ihre `staleTime`.
  - Test `apps/mobile/services/queryClient.test.ts` (jest-expo): Eine Abfrage mit `refetchOnWindowFocus: true` und abgelaufener `staleTime` lädt nach `focusManager.setFocused(true)` neu, eine Abfrage mit den Vorgaben nicht.
  - Commit: `feat(mobile): refresh monitor data when the app returns to the foreground`

### Task 5: Wissen-Screen

**Files:**
- Create unter `apps/mobile/components/wissen/`:
  - `HeadlineSlider.tsx`;
  - `TrendsCard.tsx`;
  - `PollCard.tsx`;
  - `NotebookShelf.tsx`;
  - `useNotebookShelves.ts`;
  - `WissenSkeletons.tsx`;
  - `WissenLayout.tsx` (Karten-Hüllen `SliderCard` und `AsideCard`, Titel-Stil).
- Modify: `apps/mobile/app/(focused)/wissen.tsx`.
- Test: `apps/mobile/components/wissen/HeadlineSlider.test.tsx`.

**Interfaces:**
- Consumes:
  - `useAutoAdvance`, `SlideStack` und `SlideDots` (Task 4);
  - die Hooks aus Task 3;
  - `feedArticles`, `watcherArticles`, `wissenHeadlines` und `pollFormat` (Task 1);
  - `buildNotebookShelves` (Task 2).
- Vorlage für Aufbau, Texte und Abstände sind die Web-Dateien gleichen Namens unter `apps/web/src/features/notebook/wissen/`, in Handybreite (Klassen ohne `md:`/`lg:`/`xl:`).
- **Aufbau des Screens**, von oben nach unten:
  1. Titel;
  2. `HeadlineSlider`;
  3. eine Zeile mit `TrendsCard` und `PollCard`, je `flex: 1`, Abstand 10;
  4. `NotebookShelf`.

  Darunter bleibt die vorhandene Favoriten-Reihe stehen, wenn sie Einträge hat *(Entscheidung: die App behält diese Funktion, das Web hat sie nicht)*. Unverändert bleiben auch:
  - `BottomComposerBar` mit Ask-Composer;
  - `NotebookCreator`;
  - die Action-Sheet-Aktionen für eigene Notebooks, also Teilen und Löschen per langem Druck auf einen Eintrag in „Meine Notebooks“.
- **Aufbau von `HeadlineSlider`:**
  - Der Folienzustand liegt in einem Kind-Teil `SliderBody`.
  - `SliderTitle`, `HeadlineSlide` und `PlayButton` sind `memo`.
  - Ein Druck auf eine Folie öffnet `WebBrowser.openBrowserAsync(article.href)`.
  - Ein Druck auf den Titel „Briefing“ öffnet `router.push('/briefing')`.
  - `onTouchStart` und `onTouchEnd` bzw. die Gesture rufen `hold` und `release`.
- `TrendsCard` öffnet `/briefing?karte=keywords`, `PollCard` öffnet `/umfragen`. Diese Route liefert Agent B. Bis dahin führt der Link ins Leere, das ist in Ordnung.
- `NotebookShelf`:
  - Der offene Zustand liegt in einem Kind-Teil `ShelfBrowser`.
  - Kacheln und Panel sind `memo`, `onToggle` ist stabil (`useCallback`).
  - Das Raster hat 2 Spalten in Handybreite, wie im Web.
  - Gruppen klappen ein Panel darunter auf; `layout: 'photos'` wird eine waagerechte `ScrollView`.
  - Einträge öffnen `/notebook/[id]` wie bisher.

- [ ] **Step 1: Test für `HeadlineSlider.test.tsx`**
  - Bei einem Folienwechsel bleibt der Render-Zähler von `SliderTitle` gleich (gemockte Hooks, 3 Schlagzeilen).
  - Leere Schlagzeilen zeigen den leeren Text aus dem Web.
  - Ein Druck auf eine Folie ruft `openBrowserAsync` mit der `href`.
- [ ] **Step 2:** `npx jest components/wissen`. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren und `wissen.tsx` umbauen.
- [ ] **Step 4:** Tests grün, `tsc` und `npx eslint` für die geänderten Dateien grün.
- [ ] **Step 5: Commit** `feat(mobile): bring the wissen dashboard design to the app`

### Task 6: Briefing-Screen

**Files:**
- Create:
  - `apps/mobile/app/(focused)/briefing.tsx`;
  - unter `apps/mobile/components/briefing/`: `BriefingCard.tsx`, `BriefingLeadLine.tsx`, `NewsCard.tsx`, `SignalCards.tsx`, `BriefingSkeleton.tsx`;
  - `apps/mobile/components/briefing/BriefingCard.test.tsx`.
- Modify: `apps/mobile/types/routes.ts`, falls Routen dort typisiert sind (Muster: vorhandene Einträge).

**Interfaces:**
- Consumes:
  - die Hooks aus Task 3;
  - aus Task 1: `buildBriefingLead`, `keywordStyles`, `trendInTheNews`, `monitorNewsItems`, `landesverbandNewsItems`, `standLine`, `NEWS_LIMIT`.
- Die Karten-IDs übernimmst du aus `BRIEFING_CARDS` in `apps/web/src/features/monitor/briefing/BriefingCard.tsx`, mit derselben Reihenfolge und denselben Titeln und Leertexten wie `BriefingView.tsx`.
- Höchstens eine Karte ist offen. Der Parameter `karte` (`useLocalSearchParams`) öffnet die passende Karte beim Start. Ein unbekannter Wert öffnet keine.
- Ein Druck auf eine Meldung öffnet `WebBrowser.openBrowserAsync(href)`.
- Unter `at` entfällt die Karte Landesverbände.
- Ganz unten steht die Zeile „Stand …“ (`standLine`), wenn ein Snapshot da ist.

- [ ] **Step 1: Test für `BriefingCard.test.tsx`**
  - `karte=keywords` öffnet beim Start die Karte Keywords.
  - Ein Druck auf eine andere Karte schließt die erste.
  - `karte=quatsch` öffnet keine.
  - Unter `at` gibt es keine Karte „Landesverbände“.
- [ ] **Step 2:** `npx jest components/briefing`. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests grün, `tsc` und eslint grün.
- [ ] **Step 5: Commit** `feat(mobile): add the briefing screen`

### Task 7 (Agent B): Umfragen-Screen

**Files:**
- Create:
  - `packages/shared/src/monitor/choropleth.ts` und `choropleth.vitest.ts`. Darin stehen die reinen Helfer aus `UmfragenView.tsx`/`GreensChoropleth.tsx`: `partyOrder`, `laenderGrueneValues`, die Farbskala sowie die Projektion und Pfade aus `d3-geo`, als Funktion über GeoJSON und Größe.
  - `apps/mobile/app/(focused)/umfragen.tsx` mit dem optionalen Parameter `land`;
  - unter `apps/mobile/components/umfragen/`: `GlanceHero.tsx`, `SonntagsfrageBars.tsx`, `Choropleth.tsx`, `useGeoJson.ts`, `UmfragenSkeleton.tsx`;
  - `apps/mobile/components/umfragen/Umfragen.test.tsx`.
- Modify:
  - `packages/shared/src/monitor/index.ts`, nur eine Exportzeile ergänzen;
  - die Web-Dateien `UmfragenView.tsx` und `GreensChoropleth.tsx` nutzen die Helfer aus `choropleth.ts`.

**Interfaces:**
- Consumes:
  - die Hooks aus Task 3 (`usePolls`, `usePollsOverview`, `useEuGreens`, `useMonitorLocale`, `useDashboardColors`);
  - aus Task 1: `umfragenRegion`, `BUNDESLAENDER`, `pollFormat`.
- Vorlage sind `apps/web/src/features/monitor/pages/MonitorUmfragenPage.tsx`, `components/UmfragenView.tsx` und `components/GreensChoropleth.tsx`. Aufbau, Reihenfolge, Texte und Farben bleiben so nah wie möglich am Original.
- **Abhängigkeiten:** `d3-geo`, `d3-scale` und `topojson-client` per `npx expo install`, falls sie in `apps/mobile/package.json` fehlen. Die Versionen sind dieselben wie in `apps/web/package.json`.
- **Geodaten:** `useGeoJson(path: '/geo/de-bundeslaender.geo.json' | '/geo/europe-110m.json')` lädt vom Web-Host der App. Die Basis ist `EXPO_PUBLIC_API_URL` ohne `/api`, Rückfall `https://gruenerator.eu`. Das geht über `useQuery` mit `staleTime: Infinity`.
- **Pfade** werden einmal je GeoJSON und Breite berechnet (`useMemo`). Ein Datenwechsel ändert nur `fill`.
- **Antippen** eines Bundeslands ergibt `router.push('/umfragen?land=<id>')`. Für ein unbekanntes `land` folgt `router.replace('/umfragen')`.

- [ ] **Step 1: Tests**
  - `choropleth.vitest.ts`: `partyOrder` sortiert absteigend; `laenderGrueneValues` liefert je Land den Grünen-Wert; der Pfad-Helfer liefert für ein kleines Polygon einen nichtleeren `d`-String.
  - `Umfragen.test.tsx`:
    - Bei unbekanntem `land` wird `router.replace` gerufen.
    - Schlägt das Laden der Geodaten fehl, zeigt die Karte den Platzhalter, und die Balken bleiben sichtbar.
    - Ein Druck auf ein Land pusht dessen Route.
- [ ] **Step 2:** Tests ausführen. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren und das Web auf die geteilten Helfer umstellen.
- [ ] **Step 4:** Mobile-Tests, Shared-Tests und `cd apps/web && npx vitest run src/features/monitor` grün, `tsc` für shared, web und mobile grün.
- [ ] **Step 5: Commit** `feat(mobile): add the native polls screen`, dann push auf den eigenen Branch und Meldung an die Hauptsitzung.

### Task 8: Vorführung im Android-Emulator

- [ ] Mock-Server um die Routen für `keyword-articles`, `polls`, `polls/overview`, `polls/eu-greens` und `/geo/*` ergänzen, oder gegen das lokale Backend fahren.
- [ ] App mit `EXPO_PUBLIC_API_URL=http://10.0.2.2:<port>/api` und Dev-Bypass im Android-Emulator starten (`docs/CLAUDE-expo.md`).
- [ ] Zeigen:
  - den Wissen-Screen mit laufendem Slider, Wischen, Pause, Trends, Umfragen und einer aufgeklappten Gruppe;
  - den Briefing-Screen mit offener Karte;
  - den Umfragen-Screen mit Karte und einem angetippten Land;
  - alles hell und dunkel.

  Screenshots oder eine Aufnahme an die Person.
- [ ] Danach Emulator und Metro per PID beenden. PR gegen `feat/wissen-dashboard-redesign` eröffnen.
