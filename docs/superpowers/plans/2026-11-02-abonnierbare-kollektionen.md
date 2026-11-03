# Abonnierbare Kollektionen + Mustergrün Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Marktplatz-Kollektion lässt sich mit einem Klick abonnieren. Ihre Elemente erscheinen live in eigenen Abschnitten der Listen, und eine Startrampe führt direkt ins jeweilige Werkzeug. Als erstes Schaufenster wird „Wahlkampf für Moritz“ zu Mustergrün mit Maxi Mustermensch umgebaut.

**Architecture:**
- Der Server speichert nur, wer welche Kollektion abonniert hat (`collection_subscriptions`).
- Was eine Kollektion enthält, bleibt Code:
  - Sticker und Profilbild-Hintergründe tragen schon heute `kollektion` in ihren Katalogen (`SYSTEM_STICKERS`, `COLLECTION_PRESET_DESIGNS`).
  - Agents und Rezepte stehen in `pinned`.
  - Neu ist das Feld `kit` mit den Ids von Sharepic- und Druckvorlagen.
- Clients lesen die abonnierten Ids und rendern daraus Abschnitte und Startrampe. Paginierte Leser und der Papierkorb bleiben unberührt.

**Tech Stack:** Express 5 + ts-rest + Zod, Drizzle + Raw-SQL-Migration, React 19 + TanStack Query, Vitest (Node- und jsdom-Lane).

**Spec:** `docs/superpowers/specs/2026-11-02-abonnierbare-kollektionen-design.md`

## Korrekturen gegenüber dem Spec (Befund aus dem Code, Entscheidungen des Assistenten)

1. **Keine Element-Refs auf dem Draht.** Das Abo speichert nur die `collectionId`. Die Elemente kommen aus Code-Katalogen, die Client und Server teilen. Die Ref-Union `catalog:`/`asset:` aus dem Spec wird daher in Version 1 nirgends serialisiert und entfällt (YAGNI). Das Folgeprojekt führt sie mit den DB-Kollektionen ein.
2. **Kein `subscribed`-Feld in der Frontpage.** `/api/marketplace` liegt hinter `requireAuth` (`apps/api/routes.ts:550`), den Fall „ohne Login“ gibt es dort nicht. Die Abo-Abschnitte stehen außerdem auf Seiten, die die Frontpage gar nicht laden. Ein einziger Endpunkt `GET /api/marketplace/subscriptions` versorgt alle.
3. **Die Startrampe ist kein Story-Baustein**, sondern eine feste Komponente unter dem Kopf der Kollektionsseite. Ihre Position ist fix („oben nach Abo“), und es gibt schon acht Bausteintypen.
4. **Hintergründe meint in Version 1 die Profilbild-Hintergründe** (`PresetDesign`, schon kollektionsfähig). Canvas-Hintergründe als Studio-Assets haben keinen Code-Katalog und kommen mit dem Folgeprojekt.
5. **Ein Rahmen ist ein Sticker mit `frame: true`.** Er bekommt den Deep Link `?rahmen=<id>` und wird vollflächig über der Person platziert. Eine zweite Katalogart braucht es nicht.

## Global Constraints

- Knopftexte: „Abonnieren“, danach „Abonniert ✓“, Unterzeile „Neues vom Landesverband kommt automatisch dazu“.
- Abschnittstitel in den Listen: „Aus <Kollektionstitel>“. In `/grueneratoren` heißt der Abschnitt „Aus Kollektionen“.
- Die Kollektions-Id ist F0. `wahlkampf-moritz` bleibt im Enum und leitet per Alias auf `mustergruen-wahlkampf` weiter.
- Vorlagen-Ids folgen `^[a-z0-9-]{3,64}$` mit Präfix `mustergruen-maxi-`. Vorlagen-JSON und Persona-Text liegen nur in `gruenerator-intern`. `pnpm check:internal` muss grün bleiben.
- Mustergrün: `audience: 'de-DE'`, gelistet (ohne `listed: false`), kein erfundenes Zitat.
- Neue Bilder bekommen einen neuen Stem. `/images/**` und `/studio-tools/**` werden nie überschrieben.
- TypeScript: `import { type X }` inline, kein `undefined` (`| null` oder Feld weglassen).
- Commits nach Conventional Commits, Englisch, Subject klein geschrieben.
- Checks paketweise: `pnpm --filter <pkg> exec tsc --noEmit`, `npx vitest run <datei>`. Nie `pnpm run ci`.
- Worktree: `/Users/moritzwachter/Gruenerator-collections`, Branch `feat/subscribable-collections`. Vor Task 1 einmal `pnpm install --frozen-lockfile` (die Hooks brauchen es) und den gestagten Spec mitcommitten.

## Review Focus

1. **Doppelklick oder zweimal PUT auf „Abonnieren“** muss idempotent sein: 200, eine Zeile. Den Test bekommt Task 1.
2. **Ein abonnierter Kollektions-Eintrag, den die Registry nicht mehr kennt** (die Kollektion ist aus `MARKETPLACE_COLLECTIONS` gefallen), soll still verschwinden, ohne Absturz und ohne leeren Abschnitt. Den Test bekommt Task 3.
3. **Eine Person aus Österreich mit einem Abo auf eine `de-DE`-Kollektion** sieht keine Abschnitte. Das Abo bleibt bestehen. Den Test bekommt Task 3.
4. **Fehlen die privaten Vorlagen auf einer Instanz** (ohne `INTERN_CONTENT_DIR`), fallen nur diese Kacheln weg. Die Startrampe zeigt den Rest. Fehlt alles, wird sie nicht leer gerendert. Den Test bekommt Task 4.
5. **Der alte Link `?kollektion=wahlkampf-moritz`** öffnet Mustergrün. `?rahmen=` mit einer Id, die kein Rahmen ist, wird ignoriert. Die Tests bekommen Task 3 und Task 5.

---

### Task 1: Abo-Tabelle und Service

**Files:**
- Create: `apps/api/database/postgres/migrations/zz_20261102_collection_subscriptions.sql`
- Create: `apps/api/database/schema/collectionSubscriptions.ts`
- Modify: `apps/api/database/schema/index.ts` (`export * from './collectionSubscriptions.js';`, alphabetisch)
- Modify: `apps/api/database/postgres/schema.sql` (gleiche DDL, damit frische Instanzen sie haben)
- Create: `apps/api/services/marketplace/collectionSubscriptionService.ts`
- Test: `apps/api/services/marketplace/collectionSubscriptionService.db.vitest.ts`

**Interfaces:**
- Produces:
  - `listSubscribedCollectionIds(userId: string): Promise<MarketplaceCollectionId[]>`, sortiert nach `created_at` aufsteigend. Ids, die das Enum nicht kennt, werden gefiltert.
  - `subscribeCollection(userId: string, id: MarketplaceCollectionId): Promise<void>`, idempotent über `onConflictDoNothing`.
  - `unsubscribeCollection(userId: string, id: MarketplaceCollectionId): Promise<void>`, idempotent.
  - Drizzle `collectionSubscriptions` mit `type CollectionSubscriptionRow = InferSelectModel<…>`.

- [ ] **Step 1: Migration schreiben.** `CREATE TABLE IF NOT EXISTS collection_subscriptions (user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, collection_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, collection_id));`. Kopfkommentar nach dem Vorbild von `zz_20261014_user_library_items.sql`: kein Inhalt, darum kein Papierkorb; die Zeilen gehen mit dem Konto. Kein `BEGIN`/`COMMIT`. Kein CHECK auf die Id, weil das Enum im Code wächst.
- [ ] **Step 2: Drizzle-Schema und Re-Export** analog zu `userLibraryItems.ts`, mit `primaryKey({ columns: [t.userId, t.collectionId] })`.
- [ ] **Step 3: Failing DB-Test** nach dem Muster von `marketplaceService.db.vitest.ts` (läuft nur mit `MIGRATIONS_TEST_DATABASE_URL`):
  - `subscribe twice keeps one row`: zweimal subscribe, danach `listSubscribedCollectionIds(u)` ergibt `['mustergruen-wahlkampf']`.
  - `unsubscribe unknown is a no-op`
  - `ignores ids the enum no longer knows`: per SQL `'abgeschafft'` einfügen, die Liste ergibt `[]`.
  - `cascades with the profile`
- [ ] **Step 4: Run** `cd apps/api && MIGRATIONS_TEST_DATABASE_URL=… npx vitest run services/marketplace/collectionSubscriptionService.db.vitest.ts`. Erwartet: FAIL (Modul fehlt).
- [ ] **Step 5: Service implementieren** mit `getDrizzleInstance()` wie in `userLibraryService.ts`. Gefiltert wird mit `marketplaceCollectionIdSchema.safeParse`.
- [ ] **Step 6: Run** dasselbe Kommando. Erwartet: PASS. Außerdem `npx vitest run services/trash/trashReaders.vitest.ts`: bleibt grün, weil die Tabelle kein `deleted_at` hat und deshalb nicht gescannt wird.
- [ ] **Step 7: Commit** `feat(marketplace): add collection subscriptions table and service`. Spec-Datei und Plan-Datei werden mit `git add -f` mitcommittet.

### Task 2: Contract und Router

**Files:**
- Modify: `packages/contracts/src/schemas/marketplace.ts`
  - Enum um `'mustergruen-wahlkampf'` ergänzen (additiv, `wahlkampf-moritz` bleibt).
  - Neu: `marketplaceSubscriptionsResponseSchema = z.object({ collectionIds: z.array(marketplaceCollectionIdSchema) })`.
  - Neu: `marketplaceSubscribeResponseSchema = z.object({ subscribed: z.boolean() })`.
- Modify: `packages/contracts/src/contracts/marketplaceContract.ts`, Routen:
  - `subscriptions`: GET `/api/marketplace/subscriptions`
  - `subscribe`: PUT `/api/marketplace/collections/:collectionId/subscription`, `pathParams: z.object({ collectionId: marketplaceCollectionIdSchema })`, `body: c.noBody()`, Antworten 200, 400, 401 und 500
  - `unsubscribe`: DELETE auf denselben Pfad
- Modify: `apps/api/routes/marketplace/marketplaceContractRouter.ts`
- Test: `apps/api/routes/marketplace/marketplaceContractRouter.vitest.ts` (bestehende Datei, Service-Mock um die drei Funktionen erweitern)

**Interfaces:**
- Consumes: Task 1 (die drei Service-Funktionen).
- Produces: `getContractsClient().marketplace.subscriptions() / subscribe({ params: { collectionId } }) / unsubscribe(...)`. Die Antworten lauten `{ collectionIds }` bzw. `{ subscribed: true|false }`.

- [ ] **Step 1: Failing Tests**:
  - `subscribe returns {subscribed:true} and calls subscribeCollection('viewer','mustergruen-wahlkampf')`
  - `unsubscribe returns {subscribed:false}`
  - `subscriptions returns the service list`
  - `subscribe maps a thrown error to 500`
- [ ] **Step 2: Run** `cd apps/api && npx vitest run routes/marketplace/marketplaceContractRouter.vitest.ts`. Erwartet: FAIL.
- [ ] **Step 3: Handler implementieren** im Muster von `save`/`unsave`. Der User kommt aus `getAuthedUser(req).id`. Fehlertexte: „Abonnieren fehlgeschlagen.“ und „Abbestellen fehlgeschlagen.“
- [ ] **Step 4: Run** erneut, dazu `pnpm --filter @gruenerator/contracts exec tsc --noEmit` und `pnpm --filter @gruenerator/api exec tsc --noEmit`. Erwartet: PASS bzw. keine Fehler.
- [ ] **Step 5: Commit** `feat(marketplace): add collection subscription endpoints`

### Task 3: Shared – Kit, Rahmen-Flag, Alias, Hook

**Files:**
- Modify: `packages/shared/src/marketplace/frontpage.ts`
  - `MarketplaceCollection` bekommt `kit?: { sharepicVorlagen?: readonly string[]; printVorlagen?: readonly string[] }`.
  - Neu: `collectionContents(id, locale)`.
- Modify: `packages/contracts/src/stickers/catalog.ts`
  - optionales Feld `frame?: true` am Sticker-Typ
  - `stickersForLocale` schließt Rahmen aus (sie haben ohnehin `kollektion`)
  - Neu: `framesForCollection(id)`
- Modify: `packages/shared/src/marketplace/filters.ts:94`: `LEGACY_COLLECTION_ALIASES = { 'wahlkampf-moritz': 'mustergruen-wahlkampf' } as const` wird vor `safeParse` angewendet.
- Create: `packages/shared/src/marketplace/useCollectionSubscriptions.ts` (Export über den bestehenden Index von `marketplace`)
- Test: `packages/shared/src/marketplace/collectionContents.vitest.ts`, `packages/shared/src/marketplace/filters.vitest.ts` (bestehende Datei ergänzen)

**Interfaces:**
- Produces:
  - `collectionContents(id: MarketplaceCollectionId, locale: 'de-DE' | 'de-AT'): CollectionContents | null`. Der Rückgabewert ist `null`, wenn die Registry die Id nicht kennt oder die `audience` nicht passt.
    ```ts
    interface CollectionContents {
      collection: MarketplaceCollection;
      stickers: SystemSticker[];          // stickersForCollection ohne Rahmen
      frames: SystemSticker[];            // framesForCollection
      backgrounds: PresetDesign[];        // presetsForCollection
      agents: MarketplaceTarget[];        // pinned, kind 'agent' | 'recipe'
      sharepicVorlagen: readonly string[];
      printVorlagen: readonly string[];
    }
    ```
  - `useCollectionSubscriptions(): { ids: MarketplaceCollectionId[]; isSubscribed(id): boolean; subscribe(id): Promise<void>; unsubscribe(id): Promise<void>; isLoading: boolean }`.
    - Basis ist `useQuery` mit dem Key `marketplaceKeys.subscriptions()` (neu in `marketplaceKeys`).
    - Die Mutationen aktualisieren den Cache optimistisch und rollen bei einem Fehler zurück.
  - `useSubscribedContents(locale): CollectionContents[]` filtert per `collectionContents` und verwirft `null`.
  - `framesForCollection(id: MarketplaceCollectionId): SystemSticker[]`.

- [ ] **Step 1: Failing Tests:**
  - `collectionContents returns null for an unknown id` (z. B. `'abgeschafft' as MarketplaceCollectionId`)
  - `collectionContents returns null for de-AT on a de-DE collection`
  - `collectionContents splits frames from stickers` (Fixture: die Gruene-Jugend-Sticker sind keine Rahmen, also `frames` ist `[]`)
  - `parseMarketplaceParams maps kollektion=wahlkampf-moritz to mustergruen-wahlkampf`
- [ ] **Step 2: Run** `cd packages/shared && npx vitest run src/marketplace/collectionContents.vitest.ts src/marketplace/filters.vitest.ts`. Erwartet: FAIL.
- [ ] **Step 3: Implementieren.**
  - Den Eintrag `wahlkampf-moritz` in `MARKETPLACE_COLLECTIONS` vorerst auf die Id `mustergruen-wahlkampf` umstellen. Inhalt bleibt bis Task 8.
  - Die Fixtures, die `wahlkampf-moritz` erwarten, auf die neue Id ziehen:
    - `apps/api/services/marketplace/marketplaceFrontpage.vitest.ts`
    - `packages/shared/src/marketplace/{frontpage,showcase}.vitest.ts`
    - `apps/web/src/features/marketplace/MarketplacePage.vitest.tsx`
    - `apps/mobile/components/marketplace/MarketplaceFrontpage.test.tsx`
- [ ] **Step 4: Run** dieselben Tests plus `npx vitest run src/marketplace/frontpage.vitest.ts src/marketplace/showcase.vitest.ts`, dann `pnpm --filter @gruenerator/shared exec tsc --noEmit`. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(marketplace): describe collection contents and subscriptions in shared`

### Task 4: Kollektionsseite – Abonnieren und Startrampe

**Files:**
- Modify: `apps/web/src/features/marketplace/MarketplaceCollections.tsx:297-332`. Der Knopf „Alle hinzufügen“ (`collectionAddState`/`toggleSave`) wird durch `SubscribeButton` ersetzt. Wird `collectionAddState` dadurch verwaist, wird es entfernt.
- Create: `apps/web/src/features/marketplace/SubscribeButton.tsx`
- Create: `apps/web/src/features/marketplace/CollectionLaunchpad.tsx`
- Modify: `docs/CLAUDE-collections.md`, neuer Abschnitt „Abonnieren und Startrampe“ (was `kit` ist, Rahmen per `frame: true`, `git add -f`)
- Test: `apps/web/src/features/marketplace/CollectionLaunchpad.vitest.tsx`, `apps/web/src/features/marketplace/SubscribeButton.vitest.tsx`

**Interfaces:**
- Consumes: Task 3 (`useCollectionSubscriptions`, `collectionContents`), die Route aus Task 6 (`/studio/druck/:id`) und der Parameter aus Task 5 (`?rahmen=`).
- Produces:
  - `<SubscribeButton collectionId />`
  - `<CollectionLaunchpad contents={CollectionContents} />`
  - Die Kacheln stehen in dieser Reihenfolge, jede ist ein `Link`:
    1. Profilbild gestalten: `/studio/profilbild?rahmen=<frames[0].id>`, ohne Rahmen ohne Parameter
    2. je Sharepic- bzw. Story-Vorlage: `/studio/vorlage/<id>`
    3. je Visitenkarte: `/studio/druck/<id>`
    4. Sticker: `/studio/profilbild?sticker=<id>`, über `profilbildCatalogParams`
    5. Hintergrund: `?hintergrund=<id>`
    6. je Agent: `/agents/<identifier>`
- Vorlagen-Kacheln erscheinen nur, wenn die Id im geladenen Katalog steht (`useSharepicVorlagen(land)` bzw. `printVorlagenQuery`). Deren Thumbnails werden verwendet.

- [ ] **Step 1: Failing Tests (RTL + MSW + axe):**
  - `SubscribeButton shows „Abonnieren“, after click „Abonniert ✓“ and the subline, and calls PUT once on double click`. Während der Mutation ist er gesperrt.
  - `SubscribeButton reverts on 500` (Toast, wieder „Abonnieren“)
  - `CollectionLaunchpad renders „Profilbild gestalten“ first with ?rahmen=`
  - `CollectionLaunchpad drops vorlagen tiles whose id is not in the catalog`
  - `CollectionLaunchpad renders nothing when no tile remains`
  - `axe: no violations`
  - Die Hinweise dazu stehen in `apps/web/CLAUDE-testing.md`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/features/marketplace/CollectionLaunchpad.vitest.tsx src/features/marketplace/SubscribeButton.vitest.tsx`. Erwartet: FAIL.
- [ ] **Step 3: Implementieren.**
  - Die Startrampe steht direkt unter dem Header, wenn `isSubscribed(id)`.
  - Der Knopf hat `aria-pressed` und den Stil des bisherigen Knopfs (`size="lg" rounded-full`).
  - Raleway, `--editor-*`-Tokens nicht nötig. Der Kachel-Stil folgt `ProfilbildPicks` in `CollectionStory.tsx`.
- [ ] **Step 4: Run** erneut, dazu `npx vitest run src/features/marketplace/MarketplacePage.vitest.tsx` und `pnpm --filter @gruenerator/web exec tsc --noEmit`. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(marketplace): subscribe to a collection and open its launchpad`

### Task 5: Profilbild – Rahmen-Deep-Link und abonnierte Auswahl

**Files:**
- Modify: `packages/shared/src/profilbild/catalogLink.ts`
  - `ProfilbildCatalogPick.kind` wird um `'frame'` erweitert.
  - `profilbildCatalogParams` liefert für Rahmen `{ rahmen: id }`.
  - `parseProfilbildCatalogParams` liest `rahmen` zuerst und akzeptiert nur Sticker mit `frame: true`.
- Modify: `apps/web/src/features/studio-tools/components/ProfilbildEditor.tsx:700-713`
  - `pick.kind === 'frame'` platziert den Sticker vollflächig (x 0, y 0, volle Breite) als oberste Ebene.
  - Nutze die vorhandene Sticker-Platzierung (`addSticker`) mit Position und Größe. Kann die Funktion keine Position annehmen, bekommt sie ein optionales `placement`-Argument.
- Modify: `apps/web/src/features/studio-tools/components/ProfilbildStickerPicker.tsx:56` und `ProfilbildEditor.tsx:240`
  - Hinter die Standardlisten kommen die Sticker, Rahmen und Hintergründe aus `useSubscribedContents(locale)`, je Kollektion als eigene Gruppe „Aus <Titel>“.
- Test: `packages/shared/src/profilbild/catalogLink.vitest.ts` (vorhanden oder neu), `apps/web/src/features/studio-tools/components/ProfilbildStickerPicker.vitest.tsx`

**Interfaces:**
- Consumes: Task 3 (`framesForCollection`, `useSubscribedContents`).
- Produces: der Parameter `?rahmen=<stickerId>`, den Task 4 verlinkt.

- [ ] **Step 1: Failing Tests:**
  - `parse rahmen=<frame id> → {kind:'frame', id}`
  - `parse rahmen=<plain sticker id> → null`
  - `params round-trip for frame`
  - `picker shows a group „Aus Mustergrün“ only when subscribed` (Abo-Hook gemockt, Fixture-Kollektion mit einem Sticker)
- [ ] **Step 2: Run** `npx vitest run` für beide Dateien. Erwartet: FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** erneut, dazu `tsc` für `@gruenerator/shared` und `@gruenerator/web`. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(profilbild): open a collection frame by link and offer subscribed picks`

### Task 6: Deep Link für Druckvorlagen

**Files:**
- Create: `apps/web/src/features/vorlagen/PrintVorlageInstantiatePage.tsx`. Sie lädt `printVorlagenQuery`, sucht die Id und ruft `openPrintVorlage(vorlage)` aus `usePrintVorlage.ts`.
- Modify: `apps/web/src/config/routes.ts`: Route `/studio/druck/:id`, `layoutMode: 'immersive'`, lazy, neben `/studio/vorlage/:id` (Zeile 941).
- Test: `apps/web/src/features/vorlagen/PrintVorlageInstantiatePage.vitest.tsx`

**Interfaces:**
- Produces: die Route `/studio/druck/:id`, auf die Task 4 verlinkt.

- [ ] **Step 1: Failing Tests (MSW):**
  - `known id composes and navigates to /studio/canvas/<id>`
  - `unknown id shows „Diese Vorlage gibt es nicht (mehr).“ with a link to /vorlagen`
  - Die Fehlermeldung folgt dem Fehlerzustand von `SharepicVorlageInstantiatePage.tsx`. Gibt es dort einen anderen Wortlaut, wird dieser übernommen.
- [ ] **Step 2: Run** `npx vitest run` für diese Datei. Erwartet: FAIL.
- [ ] **Step 3: Implementieren** mit demselben Lade- und Fehlerverhalten wie `SharepicVorlageInstantiatePage.tsx`.
- [ ] **Step 4: Run** erneut. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(vorlagen): open a print template by link`

### Task 7: Abo-Abschnitte in den Listen

**Files:**
- Create: `apps/web/src/features/marketplace/SubscribedCollectionSection.tsx`
  - Props: `{ contents: CollectionContents; show: 'assets' | 'vorlagen' | 'agents' }`
  - Titel: „Aus <collection.title>“
  - In der Kopfzeile: „Kollektion abbestellen“ und ein Link zur Kollektion
- Modify: `apps/web/src/features/studio-assets/StudioAssetsPage.tsx` (`show='assets'`, oberhalb der eigenen Listen)
- Modify: `apps/web/src/features/media-library/MediaLibraryPage.tsx` (`show='assets'`)
- Modify: `apps/web/src/components/common/Gallery/VorlagenGallery.tsx` (`show='vorlagen'`, oberhalb von „Meine“)
- Modify: `apps/web/src/features/agentura/GrueneratorenPage.tsx`
  - Abschnitt „Aus Kollektionen“ (`show='agents'`) über alle Abos zusammengefasst
  - Agents, die schon in `useUserLibrary` stehen, fallen aus dem Abschnitt (eigen schlägt Abo)
- Test: `apps/web/src/features/marketplace/SubscribedCollectionSection.vitest.tsx`

**Interfaces:**
- Consumes: Task 3 (`useSubscribedContents`, `useCollectionSubscriptions`), die Deep Links aus Task 4, 5 und 6 (dieselben Href-Bauer; Task 4 exportiert dafür `launchpadHref(tile)` aus `CollectionLaunchpad.tsx`).

- [ ] **Step 1: Failing Tests:**
  - `renders nothing without subscriptions`
  - `shows „Aus Mustergrün“ with stickers and backgrounds for show='assets'`
  - `„Kollektion abbestellen“ calls unsubscribe and the section disappears`
  - `agents section omits agents already in the user library`
  - `axe: no violations`
- [ ] **Step 2: Run** `npx vitest run` für diese Datei. Erwartet: FAIL.
- [ ] **Step 3: Implementieren und in die vier Seiten einhängen.** Die bestehenden Hooks und die Paginierung bleiben unverändert.
- [ ] **Step 4: Run** erneut, dazu die vorhandenen Tests der vier Seiten, soweit es sie gibt (`VorlagenGallery.vitest.tsx`, `GrueneratorenPage*.vitest.tsx`), und `tsc` für `@gruenerator/web`. Erwartet: PASS.
- [ ] **Step 5: Commit** `feat(marketplace): show subscribed collections in mediathek, sticker, vorlagen and grueneratoren`

### Task 8: Mustergrün-Inhalte (erst nach Freigabe des Designs)

Grundlage sind die Dateien des Design-Agents unter `/private/tmp/claude-501/-Users-moritzwachter-Gruenerator/5dd58b6d-a723-46f0-bfb0-5d6793ef8f9b/scratchpad/mustergruen-design/`, freigegeben durch die Person.

**Files (öffentliches Repo):**
- Create: `apps/web/public/studio-tools/stickers/mustergruen-*.svg` (Sticker und Rahmen, mit expliziter `width` und `height`)
- Modify: `packages/contracts/src/stickers/profilbildAssets.ts` (die neuen `src` in die Union `ProfilbildAssetSrc`)
- Modify: `packages/contracts/src/stickers/catalog.ts`
  - Einträge mit `kollektion: 'mustergruen-wahlkampf'`, `audience: 'de-DE'`
  - die Rahmen zusätzlich mit `frame: true`
- Modify: `packages/shared/src/profilbild/backgrounds.ts` (`COLLECTION_PRESET_DESIGNS` um die Mustergrün-Hintergründe)
- Create: `apps/web/public/images/marketplace/collections/mustergruen-v1-{640,1200}.webp` und `mustergruen-v1-banner-{640,1200,1920,2400}.webp`
- Create: `packages/shared/src/marketplace/collections/mustergruen.ts`
  - der Eintrag `mustergruen-wahlkampf`: Kicker, Titel, Beschreibung, Story ohne `quote`
  - `pinned` mit dem neuen Agent plus den vorhandenen Agents und Rezepten des alten Eintrags
  - `kit` mit den Vorlagen-Ids
  - kein `listed`, `audience: 'de-DE'`
- Modify: `packages/shared/src/marketplace/frontpage.ts`
  - Den alten Eintrag ersetzen und Mustergrün importieren.
  - `samples: WAHLKAMPF_SAMPLES` entfernen. Bleibt `sampleCollection.ts` danach unbenutzt, wird die Datei samt Bildern gelöscht. Die alten Bilder sind dann tot, aber unschädlich.
- Create: `packages/shared/src/agents/definitions/mustergruen-maxi-mustermensch.md` (nur Frontmatter: identifier, title, description, iconKey, avatar, `audience: de-DE`), danach `pnpm --filter @gruenerator/shared build:agents`

**Files (privates Repo `netzbegruenung/gruenerator-intern`, eigener Branch und PR):**
- `sharepic-vorlagen/de.json` mit den Einträgen `mustergruen-maxi-*` (Feed und Story)
- `sharepic-vorlagen/print/de.json` mit der Visitenkarte `mustergruen-maxi-visitenkarte` sowie den Thumbs
- `agents/mustergruen-maxi-mustermensch.md` mit dem Persona-Text

- [ ] **Step 1: Failing Tests:**
  - in `collectionContents.vitest.ts`: `mustergruen-wahlkampf has ≥1 frame, ≥6 stickers, ≥4 backgrounds, ≥4 sharepicVorlagen, 1 printVorlage, includes agent mustergruen-maxi-mustermensch`
  - Die bestehenden Wächter `collectionStory.vitest.ts`, `frontpage.vitest.ts` und `apps/web/src/features/marketplace/collectionCovers.vitest.ts` müssen den neuen Eintrag abdecken.
- [ ] **Step 2: Run** diese vier Dateien. Erwartet: FAIL.
- [ ] **Step 3: Assets, Einträge und Agent-Frontmatter übernehmen.**
- [ ] **Step 4: Run** dieselben Tests sowie `pnpm check:internal && pnpm check:overlays`, `tsc` für `contracts`, `shared` und `web`. Erwartet: alles grün.
- [ ] **Step 5: Privaten PR anlegen** und im öffentlichen PR verlinken (Englisch).
- [ ] **Step 6: Commit** `feat(marketplace): rebuild the campaign sample as mustergruen collection`

### Abschluss

- [ ] Checks nacheinander ausführen: `pnpm check:internal && pnpm check:overlays`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`.
- [ ] Manuell prüfen (Dev-Bypass, Claude in Chrome):
  1. `/marktplatz?kollektion=wahlkampf-moritz` öffnen.
  2. Mustergrün abonnieren.
  3. Startrampe → Profilbild mit Rahmen.
  4. Prüfen, dass `/studio/sticker` und `/vorlagen` den Abschnitt zeigen.
  5. Abbestellen.
- [ ] PR gegen `master` (Englisch). Den Branch bei Bedarf in zwei gestapelte PRs aufteilen: Tasks 1–7 als Mechanik, Task 8 als Inhalt.
