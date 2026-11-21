# Sites-Bausteinmodell – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kandidat*innen-Seite wird von einem festen `sections`-Objekt auf eine geordnete Liste `blocks` umgebaut, ohne dass sich die generierte Standardseite sichtbar ändert.

**Architecture:** Zod-Schema und Registry der Baustein-Typen in `@gruenerator/contracts`; der Live-Entwurf (Y.Doc v2) hält Bausteine als `Y.Map<id, Y.Map>` plus Reihenfolge-`Y.Array`; `sites-design` rendert die sichtbaren Bausteine in Datenreihenfolge; der Editor adressiert alles über `blocks.<blockId>…`. Kein Konverter: eine Migration setzt Zeilen und Entwürfe zurück.

**Tech Stack:** TypeScript strict, Zod 4, Yjs, React 19, Tailwind v4 (`site:`-Präfix), Vitest, Express 5/ts-rest, Postgres.

**Spec:** `docs/superpowers/specs/2026-11-21-sites-blocks-design.md` (vor jeder Aufgabe lesen).

## Global Constraints

- Arbeitsverzeichnis: Worktree `/Users/moritzwachter/Gruenerator/.worktrees/sites-blocks`, Branch `feat/sites-blocks` (Basis `feat/sites-hero-fullscreen`). Bewegt sich die Basis, hineinmergen, nie rebasen. Nie `git stash`, nie `git checkout -- <file>`.
- Commits: Conventional Commits, Englisch, Subject klein geschrieben, Body-Zeilen ≤ 100 Zeichen (bei Bedarf `git commit -F <datei>`).
- `SITE_BLOCKS_MAX = 20`. `itemMax` für `themes` und `actions` = 6 (= bestehende `SITE_THEMES_MAX`/`SITE_ACTIONS_MAX`). `max`: `hero` 1, `socialFeed` 1, `contact` 1, sonst `null`.
- Hero: genau einer, Index 0, nicht ausblendbar/verschiebbar/löschbar/doppelbar.
- ID-Format: `/^[A-Za-z0-9_-]{1,40}$/`, erzeugt mit `crypto.randomUUID()`; eindeutig über alle Bausteine und Einträge einer Seite.
- Standardseite (Reihenfolge): `hero, about, heroImage, themes, actions, socialFeed, contact`, Default-Texte wie heute in `siteDraftFromSite` (`'Wer ich bin'`, `'Gemeinsam für eine nachhaltige Zukunft!'`, `'Kontakt'`, `'Instagram'`).
- F0: Spalten `user_sites.sections`/`published_snapshot` und der Body-Feldname `sections` bleiben.
- `SITE_YDOC_SCHEMA_VERSION = 2`; Snapshot `version: z.literal(2)`.
- Feldadressen: `blocks.<blockId>.<leaf>`, Einträge `blocks.<blockId>.items.<itemId>.<leaf>`; Seitenfelder nackt (`site_title`, `tagline`, `profile_image`, `contact_email`, `contact_phone`, `social_links.<net>`). DOM: `data-block-id`, `data-block-type` am `<section>`, `data-item-id` am Eintrag (ersetzt `data-section`/`data-index`).
- Draft-Schnittstelle für Teil 3 (Seitenleiste, andere Sitzung): Namen aus Task 3 sind nach dem Push eingefroren.
- Checks paketweise, nie `pnpm run ci`: `../../node_modules/.bin/vitest run <datei>`, `../../node_modules/.bin/tsc --noEmit -p .` im Paket.
- Englisch auf GitHub, deutsch in UI und Doku. Kein `undefined` als Wert schreiben: optionale Felder weglassen oder `| null`.

## Review Focus

1. **Zwei Personen verschieben denselben Baustein gleichzeitig** → er steht genau einmal in der Liste (Test in Task 3).
2. **Doppeln eines Themen-Bausteins** → neue IDs für Baustein und jede Karte, Rich Text kopiert, Bearbeiten der Kopie ändert das Original nicht (Test in Task 3).
3. **Zwei gleiche Bausteine hintereinander** → verschiedene Hintergründe und eindeutige HTML-IDs (`themen`, `themen-2`; keine doppelte `id=`) (Test in Task 4).
4. **Publish-Fehler in einem Listeneintrag** (Link ohne https in Kachel 2 des zweiten Mitmachen-Bausteins) → Issue-Pfad `blocks.<id>.items.<itemId>.link`, Klick wählt genau diesen Baustein und öffnet das Formular (Test in Task 2 und Task 6).
5. **Entwurf ohne Hero oder mit Hero an Stelle 3** (kaputter Y-Zustand) → Vorschau zeigt Hero oben, kein Absturz (Test in Task 3).

---

### Task 0: Arbeitsumgebung und Golden-Baseline

**Files:**
- Create: `packages/sites/src/generation/generatedPage.golden.vitest.ts`
- Create: `packages/sites/src/generation/__golden__/generated-de-DE.html`, `…/generated-de-AT.html` (vom Test geschrieben)

**Interfaces:**
- Produces: die beiden Golden-Dateien; Task 7 muss sie unverändert grün halten.

- [ ] **Step 1: Abhängigkeiten installieren**

Run (Worktree-Wurzel): `pnpm install --filter @gruenerator/contracts... --filter @gruenerator/sites... --filter @gruenerator/sites-design... --filter @gruenerator/api... --frozen-lockfile --ignore-scripts --prefer-offline`
Expected: Exit 0, `node_modules/.bin/vitest` existiert.

- [ ] **Step 2: Golden-Test auf dem alten Stand schreiben**

Ein fester `WebsiteContent`-Fixture (hero, about, hero_image, 3 themes, 3 actions, contact mit Bild-URLs `/api/share/abc/preview`), Legal-Fixture wie in `packages/sites-design/src/testing/fixtures.ts`. Pipeline pro Locale `de-DE` und `de-AT`:

```ts
const generated = transformAiResponse(FIXTURE);
const source = { site_title: generated.site_title, tagline: generated.tagline,
  contact_email: generated.contact_email, contact_phone: '', profile_image: '/api/share/abc/preview',
  social_links: {}, theme: null, sections: generated.sections, legal: LEGAL };
const draft = siteDraftFromSite(source, sequentialIds());
const built = buildSiteSnapshot(siteDraftToSnapshotSource(draft, LEGAL), locale);
expect(built.ok).toBe(true);
const { html } = renderSitePage({ snapshot: built.snapshot, ... });
await expect(normaliseHtml(html)).toMatchFileSnapshot(`__golden__/generated-${locale}.html`);
```

`normaliseHtml` entfernt die Attribute `data-field`, `data-section`, `data-index`, `data-block-id`, `data-block-type`, `data-item-id` (Regex über `\sdata-(field|section|index|block-id|block-type|item-id)="[^"]*"`). `renderSitePage`-Eingabe wie in `packages/sites-design/src/document/renderSitePage.vitest.tsx`. Nach dem Umbau ersetzt Task 7 nur die Pipeline-Zeilen bis `built`, nicht die Golden-Dateien.

- [ ] **Step 3: Laufen lassen, Dateien entstehen**

Run: `cd packages/sites && ../../node_modules/.bin/vitest run src/generation/generatedPage.golden.vitest.ts`
Expected: PASS, zwei `.html`-Dateien geschrieben; Sichtprüfung, dass sie sieben Abschnitte enthalten.

- [ ] **Step 4: Commit** — `test(sites): pin the generated page before the block refactor`

---

### Task 1: Baustein-Schema und Registry

**Files:**
- Create: `packages/contracts/src/schemas/siteBlocks.ts`
- Modify: `packages/contracts/src/schemas/sites.ts` (`siteSectionsSchema` ersetzen; `SITE_SECTION_IDS`, `SiteSectionId`, `siteOptionalSectionSchema`, `siteHeroLayoutSchema` als Seitenfeld, `hidden` entfernen; `siteHeroLayoutSchema` bleibt als Feldtyp des Hero)
- Modify: `packages/contracts/src/index.ts` (Exporte)
- Test: `packages/contracts/src/schemas/siteBlocks.vitest.ts`

**Interfaces:**
- Produces:
  - `siteBlockTypeSchema = z.enum(['hero','about','heroImage','themes','actions','socialFeed','contact'])`, `type SiteBlockType`
  - `SITE_BLOCK_TYPES: readonly { type: SiteBlockType; max: number | null; itemMax: number | null; pinned: boolean }[]` (`as const`), `siteBlockSpec(type): (typeof SITE_BLOCK_TYPES)[number]`
  - `SITE_BLOCKS_MAX = 20`, `siteIdSchema`
  - `siteThemeItemSchema` (`id, title, imageUrl, imageFocus?, content`), `siteActionItemSchema` (`id, text, link, imageUrl, imageFocus?`)
  - `siteBlockSchema` = `z.discriminatedUnion('type', …)`; gemeinsam `id`, `hidden?: boolean`; Felder je Typ wie in der Spec-Tabelle; `type SiteBlock`, `type SiteBlockOf<T extends SiteBlockType> = Extract<SiteBlock, { type: T }>`
  - `siteBlockListSchema` = `z.array(siteBlockSchema).max(SITE_BLOCKS_MAX).superRefine(checkPage)`
  - `siteSectionsSchema = z.object({ header?, profileImageFocus?, blocks: siteBlockListSchema })`, `type SiteSections`
  - `defaultSiteBlock<T extends SiteBlockType>(type: T, newId: () => string): SiteBlockOf<T>` und `defaultSiteBlocks(newId): SiteBlock[]` (Standardseite)
  - `checkPage` meldet als Issue: Hero fehlt/nicht an 0/doppelt; Typ über `max`; doppelte ID (Baustein oder Eintrag)

- [ ] **Step 1: Failing tests** `siteBlocks.vitest.ts`:
  - `defaultSiteBlocks` liefert die sieben Typen in Standardreihenfolge, alle IDs verschieden.
  - `siteSectionsSchema.safeParse({ blocks: [about, hero] })` → Fehler mit Pfad `['blocks']` und Text „Profil muss oben stehen“.
  - zwei `contact` → Fehler; zwei `themes` → ok; 21 Bausteine → Fehler.
  - doppelte Eintrags-ID über zwei Themen-Bausteine → Fehler.
  - Themen-Baustein mit 7 Einträgen → Fehler.
- [ ] **Step 2:** Run `cd packages/contracts && ../../node_modules/.bin/vitest run src/schemas/siteBlocks.vitest.ts` → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren; Grenzwerte und Texte wie oben. `sites.ts` behält `siteThemeCardSchema`/`siteActionTileSchema` nicht mehr – die Item-Schemas ersetzen sie.
- [ ] **Step 4:** Test → PASS. `../../node_modules/.bin/tsc --noEmit -p .` in contracts darf an den Folgestellen (siteDraft, siteDoc, Snapshot) rot sein – die repariert Task 2/3; nichts außerhalb dieser drei Dateien.
- [ ] **Step 5:** Commit — `feat(contracts): site block schema and registry`

---

### Task 2: Entwurf, Zeile und Snapshot

**Files:**
- Modify: `packages/contracts/src/schemas/siteDraft.ts`
- Modify: `packages/contracts/src/schemas/sites.ts` (`snapshotSchemaFor`, `normaliseSections`, `snapshotCandidate`, `buildSiteSnapshot`, `buildSitePreviewSnapshot`)
- Test: `packages/contracts/src/schemas/siteDraft.vitest.ts`, `packages/contracts/src/schemas/sites.vitest.ts` (anpassen)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `interface SiteDraft { site_title; tagline; profile_image; profileImageFocus?; variant; header; contact_email; contact_phone; social_links; blocks: SiteBlock[] }`
  - `siteDraftFromSite(site, newId?)`: übernimmt gespeicherte `blocks` samt IDs; fehlen sie oder sind leer → `defaultSiteBlocks(newId)`.
  - `siteDraftToRowColumns(draft)`: `sections = { header? (nur ≠ Default), profileImageFocus? (nur off-centre), blocks }`; `hidden` nur wenn `true`; Fokuswerte über `offCentre`.
  - `buildSiteSnapshot(source, locale)` – ausgeblendete Bausteine fehlen im Snapshot; `buildSitePreviewSnapshot(source, locale, options?: { includeHidden?: boolean })` behält sie mit `hidden: true`, wenn `includeHidden`.
  - Snapshot: `version: 2`, `sections: { header?, profileImageFocus?, blocks }`, kein `hidden_sections`.
  - Lenient (Vorschau): ein Baustein, der nicht parst, fällt weg (`z.array(z.unknown()).transform(…)` mit `safeParse` je Element); fehlender Hero → `defaultSiteBlock('hero', …)` an Index 0, Hero an falscher Stelle → nach vorne.
  - Bild-URLs `/download` → `/preview` und `localizeActionLink` je Eintrag wie heute.

- [ ] **Step 1: Failing tests**
  - Roundtrip `siteDraftFromSite(siteDraftToRowColumns(draft))` erhält Reihenfolge und IDs.
  - Leere `sections` → Standardseite.
  - `buildSiteSnapshot` mit `actions`-Baustein, Eintrag 2 `link: 'http://x'` → `ok: false`, Issue-Pfad `sections.blocks.<i>.items.<j>.link` wird von `buildSiteSnapshot` zu `blocks.<blockId>.items.<itemId>.link` umgeschrieben (Index → ID über die Kandidatenliste).
  - Ausgeblendeter `about` fehlt in `buildSiteSnapshot`, ist mit `includeHidden` in der Vorschau da.
  - Vorschau mit kaputtem Bild in einem Baustein zeigt die anderen Bausteine.
  - `snapshotDiffers` bleibt `false` für unverändertes Draft.
- [ ] **Step 2:** Run `../../node_modules/.bin/vitest run src/schemas/siteDraft.vitest.ts src/schemas/sites.vitest.ts` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit — `feat(contracts): drafts and snapshots carry the block list`

---

### Task 3: Y.Doc v2 und Operationen (die Naht für Teil 3)

**Files:**
- Modify: `packages/contracts/src/siteYdoc.ts` (Schlüssel)
- Modify: `packages/contracts/src/richtext/siteDoc.ts` (Seed, Decode, Operationen; alte Themen/Kachel-Funktionen entfernen)
- Modify: `packages/sites/src/draft/SiteDraftContext.tsx` (`SiteDraftActions`), `packages/sites/src/draft/testDoc.ts`
- Test: `packages/contracts/src/richtext/siteDoc.vitest.ts` (neu schreiben), `packages/sites/src/draft/SiteDraftContext.vitest.tsx`

**Interfaces:**
- Consumes: Task 1, 2.
- Produces (contracts, `@gruenerator/contracts/site-ydoc`):
  - `SITE_YDOC_KEYS = { meta: 'siteMeta', fields: 'siteFields', blocks: 'siteBlocks', blockOrder: 'siteBlockOrder' }`; in jeder Block-Map für Listen: `items` (Y.Map) und `itemOrder` (Y.Array).
  - `SITE_FIELD_KEYS` nur noch Seitenfelder: `site_title, tagline, profile_image, profileImageFocus, variant, header, contact_email, contact_phone, social_links`.
  - `siteBlockFragmentKey(blockId) = 'rt:block:<id>'`, `siteItemFragmentKey(itemId) = 'rt:item:<id>'`, `getBlockFragment(ydoc, blockId)`, `getItemFragment(ydoc, itemId)`.
  - `type SiteBlockPatch<T> = Partial<Omit<SiteBlockOf<T>, 'id' | 'type' | 'hidden' | 'items' | 'content'>>`; `type SiteItemPatch = Partial<Omit<SiteThemeItem, 'id' | 'content'>> | Partial<Omit<SiteActionItem, 'id'>>`.
  - `addSiteBlock(ydoc, type, index): string | null`, `removeSiteBlock(ydoc, id): boolean`, `moveSiteBlock(ydoc, id, toIndex): boolean`, `duplicateSiteBlock(ydoc, id): string | null`, `setSiteBlockHidden(ydoc, id, hidden): boolean`, `setSiteBlockField<T>(ydoc, id, type: T, patch: SiteBlockPatch<T>): boolean`, `addSiteItem(ydoc, blockId, index?): string | null`, `updateSiteItem(ydoc, blockId, itemId, patch): boolean`, `removeSiteItem(ydoc, blockId, itemId): boolean`, `moveSiteItem(ydoc, blockId, itemId, toIndex): boolean`.
  - Verweigerung (Rückgabe `false`/`null`): Hero-Regeln, Typ-`max`, `SITE_BLOCKS_MAX`, `itemMax`, unbekannte ID, Typ-Mismatch bei `setSiteBlockField`. `toIndex` wird auf `[1, length-1]` geklemmt (0 gehört dem Hero).
  - `decodeSiteDraft`: Order-Duplikate verwerfen, verwaiste Blöcke hinten anhängen, Hero nach vorne, fehlender Hero → Standard-Hero; Docs mit `schemaVersion !== 2` gelten als ungesät (`isSiteDocSeeded` → false).
  - `duplicateSiteBlock` kopiert Felder, Einträge (neue IDs) und Fragmente (`rt:block`, `rt:item`) in einer Transaktion, fügt direkt hinter dem Original ein.
  - Entfernen leert die Fragmente des Bausteins und seiner Einträge.
- Produces (packages/sites, `SiteDraftActions` – eingefroren für Teil 3):
  `setField`, `addBlock(type, index): string | null`, `removeBlock(id): boolean`, `moveBlock(id, toIndex): boolean`, `duplicateBlock(id): string | null`, `setBlockHidden(id, hidden): boolean`, `setBlockField<T>(id, type: T, patch): boolean`, `addItem(blockId, index?): string | null`, `updateItem(blockId, itemId, patch): boolean`, `removeItem(blockId, itemId): boolean`, `moveItem(blockId, itemId, toIndex): boolean`.

- [ ] **Step 1: Failing tests** (`siteDoc.vitest.ts`):
  - Seed → Decode gibt das Draft identisch zurück (inkl. Rich Text in about und Themen-Karte).
  - `addSiteBlock(ydoc, 'contact', 3)` bei vorhandenem Kontakt → `null`; `'themes'` → neue ID an Index 3.
  - `moveSiteBlock(hero, 2)` → `false`; `moveSiteBlock(about, 0)` landet auf Index 1.
  - Doppeln: neue Block-ID, neue Item-IDs, Fragment-Text gleich; `updateSiteItem` auf der Kopie ändert das Original nicht.
  - Nebenläufigkeit: zwei Docs aus demselben Seed, beide verschieben `themes` auf verschiedene Stellen, Updates austauschen → `decodeSiteDraft(a).blocks.filter(b => b.id === id).length === 1` und `a`/`b` dekodieren gleich.
  - Kaputter Zustand: Order `[about, hero]` → Hero an 0; Order ohne Hero-Eintrag und ohne Hero-Map → Standard-Hero an 0.
  - `removeSiteBlock(themes)` leert `rt:item:*` der Karten.
  - v1-Doc (`schemaVersion: 1`) → `isSiteDocSeeded` false.
- [ ] **Step 2:** Run `../../node_modules/.bin/vitest run src/richtext/siteDoc.vitest.ts` → FAIL.
- [ ] **Step 3:** Implementieren (Muster der heutigen `addItem/patchItem/removeItem/moveItem`-Helfer wiederverwenden, jetzt pro Block-Map). `SiteDraftContext` bindet die neuen Funktionen; alte `addTheme…moveAction` fallen weg.
- [ ] **Step 4:** Tests → PASS; `tsc --noEmit -p .` in contracts grün.
- [ ] **Step 5:** Commit — `feat(contracts): block list in the site draft doc`
- [ ] **Step 6:** Push `git push -u origin feat/sites-blocks` und der Seitenleisten-Sitzung (`gruenerator-5e`) per SendMessage melden: Commit-SHA, die `SiteDraftActions`-Liste oben, Abweichung zur Absprache: `addBlock`/`duplicateBlock`/`addItem` geben `string | null` (neue ID) statt `boolean`, und `editorStore.selection` wird `{ blockId: string; itemId: string | null; path: string | null } | null` (Task 5).

---

### Task 4: Rendern aus Bausteinen (`sites-design`)

**Files:**
- Modify: `packages/sites-design/src/model/visibility.ts` (`isBlockEmpty`, `visibleBlocks`, `blockAnchors`), `packages/sites-design/src/model/grounds.ts` (`blockGrounds`, `ALTERNATE`), `packages/sites-design/src/site/layout.tsx` (`SectionContext`, `Section`), `SiteBody.tsx`, `SiteHeader.tsx`, `server.ts`, alle sieben `site/sections/*Section.tsx`, `src/testing/fixtures.ts`
- Test: `packages/sites-design/src/site/siteBody.vitest.tsx`, `src/model/model.vitest.ts`, `src/document/renderSitePage.vitest.tsx` (anpassen)

**Interfaces:**
- Consumes: Task 1/2 (`SiteBlock`, Snapshot v2).
- Produces:
  - `visibleBlocks(snapshot, mode): SiteBlock[]` – Hero immer; `hidden` raus, außer `mode === 'preview'` mit Edit-Slots (dann bleiben sie, markiert); Social-Feed-Regel und Leer-Regel wie heute (`isBlockEmpty(block, snapshot)` = heutige `isSectionEmpty` je Typ, Kontakt liest weiter die Seitenfelder).
  - `blockAnchors(blocks): Map<string, string>` – Basis `SECTION_ANCHORS[type]`, ab der zweiten Instanz `-2`, `-3`.
  - `blockGrounds(blocks, variant, locale): Map<string, SiteGround>` – Basistabelle `GROUNDS`; nur über nicht-ausgeblendete Bausteine; gleicher Grund wie sichtbarer Vorgänger → `ALTERNATE[ground]`; ausgeblendete bekommen ihren Basisgrund. `ALTERNATE` je Grund ein Nachbar, Kontrast per `docs/CLAUDE-a11y.md` geprüft (Builder legt die Tabelle fest, Kommentar mit Messwerten). `sectionGround(variant, 'header'|'footer', locale)` bleibt für Kopf/Fuß/`swatches.ts`.
  - `SectionContext` verliert `visible: SiteSectionId[]`, bekommt `blocks: readonly SiteBlock[]` (sichtbar, für Kopfzeile).
  - Jede Section-Komponente: `({ ctx, block, anchor, ground }: { ctx: SectionContext; block: SiteBlockOf<'…'>; anchor: string; ground: SiteGround })`. Hero liest `block.layout ?? 'portrait'`.
  - `Section` rendert `data-block-id`, `data-block-type`, `data-editor-hidden` (nur wenn `block.hidden` und Edit-Modus), `id={anchor}`; innere IDs: die erste Instanz eines Typs behält exakt die heutigen IDs (`${anchor}-titel`, `thema-${n}-titel` …), damit der Golden-Test aus Task 0 gleich bleibt; weitere Instanzen bekommen ihren Anker als Präfix (`themen-2-titel`, `themen-2-thema-${n}-titel`).
  - `data-field`-Pfade aller Sections im Schema `blocks.<blockId>.<leaf>` bzw. `blocks.<blockId>.items.<itemId>.<leaf>`; Einträge tragen `data-item-id` statt `data-index`.
  - Kopfzeile: je Typ in `NAV_TARGETS` der erste sichtbare Baustein, Link auf seinen Anker.
  - `server.ts`: Consent-Skript, wenn ein sichtbarer `socialFeed` existiert.

- [ ] **Step 1: Failing tests**
  - Standardseite: Reihenfolge der `data-block-type` = Standardreihenfolge; Gründe je Baustein = heutige Tabelle (für alle drei Varianten und beide Locales).
  - `[hero, themes, themes]`: zweiter Themen-Baustein hat anderen `data-ground` als der erste, Anker `themen-2`; im HTML kommt kein `id="…"` doppelt vor (Regex über alle `id="`).
  - Ausgeblendeter Baustein fehlt im öffentlichen Render; im Edit-Render vorhanden mit `data-editor-hidden`, die Gründe der sichtbaren ändern sich dadurch nicht.
  - Navigation verlinkt `#themen`, nicht `#themen-2`.
  - Vollbild-Hero über `block.layout = 'vollbild'` (bestehende Tests von #5916 umstellen).
- [ ] **Step 2:** Run `cd packages/sites-design && ../../node_modules/.bin/vitest run` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `vitest run` → PASS; `tsc --noEmit -p .` grün; `pnpm --filter @gruenerator/sites-design run build` grün.
- [ ] **Step 5:** Commit — `feat(sites-design): render the page from its block list`

---

### Task 5: Editor-Adressen, Auswahl und Inline-Bearbeitung (`packages/sites`)

**Files:**
- Modify: `packages/sites/src/stores/editorStore.ts`, `src/inline/fieldBindings.ts`, `src/inline/editSlots.tsx`, `src/preview/fieldPaths.ts`, `src/preview/usePreviewInteractions.ts`, `src/editor/canvas/useAnchorRect.ts`, `src/editor/canvas/targets.ts`, `src/editor/SiteEditor.tsx` (nur `DraftPreview`: `includeHidden: true`)
- Create: `packages/sites/src/editor/blockUi.ts` (`SITE_BLOCK_UI`)
- Test: `src/inline/fieldBindings.vitest.ts` (neu), `src/preview/fieldPaths.vitest.ts`, bestehende Interaktions-Tests anpassen

**Interfaces:**
- Consumes: Task 3 (`SiteDraftActions`, Fragmente), Task 4 (DOM-Attribute).
- Produces:
  - `interface EditorSelection { blockId: string; itemId: string | null; path: string | null }`; `FocusedField = { blockId: string | 'settings' | 'legal'; path: string }`; `focusPath(target, path)`. `dialog`/`openDialog` bleiben unverändert (gehören Teil 3).
  - `SITE_BLOCK_UI: Record<SiteBlockType, { label: string; description: string; icon: IconType }>` – Labels wie heute `SECTION_LABELS` (`Profil`, `Über mich`, `Hero-Bild`, `Themen`, `Aktionen`, `Instagram`, `Kontakt`), `SECTION_LABELS`/`SECTION_ORDER` entfallen.
  - `parseFieldPath(path): { kind: 'site'; key } | { kind: 'block'; blockId; leaf } | { kind: 'item'; blockId; itemId; leaf } | null`.
  - `textBinding(path)` / `richTextBinding(path)` leiten aus `parseFieldPath` + Draft ab (Grenzwerte wie heute: Titel `SITE_SECTION_TITLE_MAX`, Banner-Titel 60, Untertitel 200, Kachel-Text `SITE_ACTION_TEXT_MAX`, about `SITE_ABOUT_MAX_LENGTH`, Karte `SITE_THEME_CONTENT_MAX_LENGTH`); keine Tabelle pro Pfad.
  - `selectionAt(target)` liest `data-block-id`, `data-item-id`, `data-field`; `blockIdForPath(path, draft)` ersetzt `panelForPath` (Seitenfelder `site_title|tagline|profile_image|social_links.*` → Hero-ID, `contact_email|contact_phone` → Kontakt-ID); `fieldLabel(path, draft)` → „Themen 2: Titel“ (Instanznummer, wenn der Typ mehrfach vorkommt).
  - `imageTarget(selection, draft): ImageTarget | null` – Hero → Porträt, heroImage/contact → Blockbild, Eintrag → Eintragsbild.

- [ ] **Step 1: Failing tests**
  - `parseFieldPath('blocks.b1.items.i2.title')` → `{ kind: 'item', blockId: 'b1', itemId: 'i2', leaf: 'title' }`; `'site_title'` → site; `'sections.about.title'` → `null`.
  - `textBinding` für Themen-Karten-Titel schreibt über `updateItem(blockId, itemId, { title })` und liest aus dem Draft.
  - Klick auf ein Element innerhalb `[data-item-id]` eines zweiten Themen-Bausteins → Auswahl mit dessen `blockId` und `itemId`.
  - `fieldLabel('blocks.<id2>.items.<i>.link', draft)` mit zwei Aktions-Bausteinen → „Aktionen 2: Link“.
- Editor-Stil: `[data-editor-hidden]` im Stylesheet, das der Editor in den Vorschau-Frame lädt, gedimmt mit sichtbarem Hinweis „Ausgeblendet“ (Pseudo-Element; Hinweistext selbst nicht gedimmt, Kontrast ≥ 4.5:1).

- [ ] **Step 2:** Run `cd packages/sites && ../../node_modules/.bin/vitest run src/inline src/preview` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit — `feat(sites): address the editor by block id`

---

### Task 6: Formulare, Toolbar und Veröffentlichen

**Files:**
- Create: `packages/sites/src/editor/canvas/BlockForm.tsx`
- Modify: `src/editor/canvas/ElementPanel.tsx` (dünne Hülle um `BlockForm`/Bildformular), `src/editor/canvas/CanvasToolbar.tsx`, alle `src/components/editor/sections/*SectionEditor.tsx` (Prop `blockId`, Pfade neu), `src/components/editor/settings/SettingsPanel.tsx` (nur `SectionVisibility`-Einbindung entfernen), `src/editor/publish/PublishControls.tsx` (Issue → `focusPath`)
- Delete: `src/components/editor/settings/SectionVisibility.tsx` + Test
- Test: `src/editor/canvas/CanvasToolbar.vitest.tsx`, `src/editor/canvas/BlockForm.vitest.tsx` (neu), `src/editor/publish/*.vitest.ts`, Section-Editor-Tests anpassen

**Interfaces:**
- Consumes: Task 3, 5.
- Produces:
  - `BlockForm({ blockId }: { blockId: string })` – rendert `FORMS[block.type]({ blockId })` ohne Rahmen; unbekannte ID → `null`. Für Teil 3.
  - `FORMS: Record<SiteBlockType, (props: { blockId: string }) => ReactNode>`.
  - Toolbar für Nicht-Hero-Bausteine: „nach oben“, „nach unten“ (`moveBlock`), „Doppeln“ (`duplicateBlock`, deaktiviert bei Typ-`max`/Seitengrenze, wählt die Kopie aus), „Ausblenden“/„Einblenden“ (`setBlockHidden`), „Löschen“ (`removeBlock`, wählt nichts aus). Listen-Werkzeuge wie heute, mit `blockId`/`itemId`. Labels mit `SITE_BLOCK_UI[type].label`.

- [ ] **Step 1: Failing tests**
  - Toolbar auf Hero: keine Verschieben/Doppeln/Ausblenden/Löschen-Knöpfe.
  - Toolbar auf `themes`: „Doppeln“ erzeugt zweiten Themen-Baustein direkt dahinter, Auswahl wechselt auf ihn; auf `contact` ist „Doppeln“ deaktiviert.
  - „Ausblenden“ auf `about` setzt `hidden`, Knopf zeigt danach „Einblenden“.
  - `BlockForm` mit der ID des zweiten Aktions-Bausteins zeigt dessen Kacheln, nicht die des ersten.
  - Publish-Issue `blocks.<id>.items.<itemId>.link` → `selection.blockId === id`, Formular offen, Feld fokussiert.
- [ ] **Step 2:** Run `../../node_modules/.bin/vitest run src/editor src/components` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `vitest run` (ganzes Paket) → PASS; `tsc --noEmit -p .` grün; `npx eslint` auf die geänderten Dateien.
- [ ] **Step 5:** Commit — `feat(sites): block tools and per-block forms`

---

### Task 7: Generierung und Anlegen

**Files:**
- Modify: `packages/sites/src/generation/transform.ts`, `src/create/CreateFlow.tsx`, `src/generation/transform.vitest.ts`, `src/generation/generatedPage.golden.vitest.ts` (nur Pipeline)

**Interfaces:**
- Consumes: Task 1 (`defaultSiteBlocks`, `defaultSiteBlock`).
- Produces: `GeneratedSiteData.sections: SiteSections` mit der Standardseite: Inhalte aus `WebsiteContent` wie heute in die sieben Bausteine (hero ohne Felder, about, heroImage, themes-Items, actions-Items, socialFeed Default, contact); `transformAiResponse(ai, newId = () => crypto.randomUUID())`.

- [ ] **Step 1:** `transform.vitest.ts` auf Blöcke umstellen (Typreihenfolge, Item-Anzahl, Inhalte); Golden-Pipeline auf `transformAiResponse(FIXTURE, sequentialIds())` → `siteDraftFromSite` → … umstellen, Golden-Dateien **nicht** anfassen.
- [ ] **Step 2:** Run `../../node_modules/.bin/vitest run src/generation` → FAIL.
- [ ] **Step 3:** Implementieren; `CreateFlow` schickt `sections: data.sections`.
- [ ] **Step 4:** Run → PASS, inklusive Golden ohne Diff. Ein Diff ist ein Fehler im Umbau, nie ein Grund, die Golden-Datei neu zu schreiben.
- [ ] **Step 5:** Commit — `feat(sites): generation builds the default block page`

---

### Task 8: API, Migration, E2E-Fixture

**Files:**
- Create: `apps/api/database/postgres/migrations/zz_20261121_user_sites_blocks_reset.sql`
- Modify: `apps/api/routes/sites/sitesContractRouter.ts` (nur falls Typfehler; Logik bleibt), `apps/api/services/sites/siteMapper.ts`, `apps/api/services/sites/siteDraftDoc.ts` (nur Typen), `apps/web/tests/e2e/fixtures/sitesFixtures.ts`
- Test: `apps/api/routes/sites/sitesContractRouter.vitest.ts`, `apps/api/services/sites/*.vitest.ts` (Fixtures auf Blöcke)

**Interfaces:**
- Consumes: Task 1–3.
- Migration (ohne BEGIN/COMMIT):

```sql
-- Block model (#…): no site is live yet, so rows and drafts are reset, not converted.
UPDATE user_sites SET sections = '{}'::jsonb, published_snapshot = NULL;
DELETE FROM yjs_document_updates WHERE document_id IN (SELECT id FROM user_sites);
DELETE FROM yjs_document_snapshots WHERE document_id IN (SELECT id FROM user_sites);
```

(Spaltentypen von `yjs_document_*.document_id` und `user_sites.id` vorher in `schema.sql` prüfen; bei Typunterschied casten. Falls `user_sites.is_published` gesetzt ist, ebenfalls auf `false`.)

- [ ] **Step 1:** API-Test-Fixtures auf `sections: { blocks: defaultSiteBlocks(seqIds) }` umstellen; Publish-Test erwartet Issue-Pfad `blocks.<id>.…`.
- [ ] **Step 2:** Run `cd apps/api && ../../node_modules/.bin/vitest run routes/sites services/sites` → FAIL.
- [ ] **Step 3:** Migration und Anpassungen; `trashReaders.vitest.ts` mitlaufen lassen, falls SQL an `user_sites` dazukommt (der DELETE liest `user_sites` ohne Trash-Filter – gewollt; Allowlist-Eintrag mit Marker, wenn der Wächter anschlägt).
- [ ] **Step 4:** Run → PASS; zusätzlich `../../node_modules/.bin/vitest run services/trash/trashReaders.vitest.ts`.
- [ ] **Step 5:** Commit — `feat(api): reset site rows for the block model`

---

### Task 9: Live-Prüfung und PR

- [ ] **Step 1:** `feat/sites-blocks` in den Demo-Stack `.worktrees/sites-live` mergen, `pnpm run build` in `packages/sites-design`, Stack auf 3011/3012 neu starten (Migration läuft beim Start).
- [ ] **Step 2:** Im Browser (Desktop und 390 px): neue Seite per KI anlegen → sieht aus wie vorher; Themen-Baustein doppeln, verschieben, ausblenden, einblenden, löschen; Karte im Duplikat bearbeiten; Veröffentlichen mit falschem Link in einem Duplikat → Sprung zum richtigen Baustein; öffentliche Seite prüfen (Anker, Navigation, Hintergründe).
- [ ] **Step 3:** Paketweise Checks nacheinander: contracts, sites-design, sites, api (`tsc --noEmit`, `vitest run`, `eslint` geänderte Dateien), dann `pnpm check:internal && pnpm check:overlays`, `pnpm format:check`.
- [ ] **Step 4:** `git fetch origin master`, Push, PR gegen `feat/sites-hero-fullscreen` (Englisch), Body nennt: Stapel-Basis #5916, keine Bestandsdaten (Reset-Migration), Schnittstelle für die Seitenleiste, Golden-Test. Worktree entfernen, sobald alles gepusht ist.
