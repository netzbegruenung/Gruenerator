# Sites: die Seite als Bausteinliste (1b)

Stand 21.11.2026. Teil 2 von 4 im Vorhaben „Elementor-artige Kandidat*innen-Seiten“:

1. `@ggraphic/ui` aus ggraphic herauslösen ([Movm/ggraphic#228](https://github.com/Movm/ggraphic/issues/228))
2. **dieses Dokument:** Bausteinmodell
3. Seitenleiste im Sites-Editor (macht ein anderer Agent parallel)
4. neue Baustein-Typen, jeder einzeln, DE und AT

## Absicht

Leute sollen ihre Seite aus Bausteinen zusammensetzen: hinzufügen, verschieben, doppeln, ausblenden, löschen. Jeder Baustein ist ein ganzer Abschnitt mit von uns gestaltetem, responsivem Layout im grünen Design (Variante A aus dem Gespräch, keine freien Spalten oder Widgets). Heute besteht die Seite aus sieben fest benannten Abschnitten in fester Reihenfolge, die man nur aus- oder einblenden kann. Dieses Dokument ersetzt das feste Objekt durch eine geordnete Liste, auf der die Seitenleiste (Teil 3) und neue Typen (Teil 4) aufbauen.

## Ziele

- Die Seite ist eine geordnete Liste von Bausteinen `{ id, type, hidden, …Felder }`.
- Die sieben heutigen Abschnitte werden die ersten sieben Typen: `hero`, `about`, `heroImage`, `themes`, `actions`, `socialFeed`, `contact`.
- Operationen im Live-Entwurf: hinzufügen (an Position), entfernen, verschieben, doppeln (tief, mit neuen IDs), ausblenden, Feld setzen, Listeneinträge (Themen-Karten, Mitmachen-Kacheln) je Baustein.
- Ein neuer Typ (Teil 4) braucht genau: einen Zod-Eintrag, einen Registry-Eintrag, eine Render-Komponente in `sites-design`, ein Formular im Editor. Nichts davon darf eine Liste aller Typen an einer weiteren Stelle verlangen.
- Eine frisch angelegte Seite sieht exakt aus wie heute (gleiche Reihenfolge, gleiche Hintergründe).

## Nicht-Ziele

- Neue Baustein-Typen (Teil 4).
- Die Seitenleiste und ihre Panels (Teil 3). Dieses Dokument liefert ihr nur Registry und Operationen.
- Freie Spalten, Widgets, Stil-Einstellungen pro Baustein (Abstände, Farben).
- Mehrere Unterseiten pro Website.
- Ein Konverter für alte Daten: es gibt noch keine Seiten, siehe Migration.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Ein Baustein, der auf dem Handy bricht.
- Ein Hero, der nicht oben steht, oder eine Seite ohne Hero.
- Zwei Personen bearbeiten gleichzeitig und ein Baustein verschwindet oder taucht doppelt auf.
- Zwei benachbarte Bausteine mit demselben Hintergrund, sodass sie optisch verschmelzen.

## Rahmen

- **Keine Bestandsdaten.** Es gibt weder auf Prod noch auf Beta Seiten, die erhalten bleiben müssen (Aussage Moritz, 21.11.). Wir refactorn voll, ohne Konverter und ohne Doppel-Lesen.
- **Basis:** Branch `feat/sites-blocks` auf `feat/sites-hero-fullscreen` (#5916, offen, gestapelt auf #5914 → #5913). Die darunter (#5904, #5908, #5909, #5911) und #5910 (mehrere Seiten pro Konto, ändert das Format nicht) sind in `master`.
- **F0:** Der Spaltenname `user_sites.sections` (jsonb) und `published_snapshot` bleiben. Nur der Inhalt ändert die Form. Contract-Feldnamen im Request-Body (`sections` in create/update) bleiben ebenso.
- **Parallelarbeit:** Die Seitenleiste entsteht gleichzeitig in einer anderen Sitzung. Aufteilung *(Vorschlag Claude, mit der anderen Sitzung abzustimmen)*: **Dieser Teil** besitzt contracts (Schema, Registry, Codec, Operationen), `sites-design`, `SiteDraftContext`, `editorStore` (Auswahl per `blockId`), `ElementPanel`, `CanvasToolbar`, Generierung, API und Migration. **Teil 3** besitzt die neue Leisten-Hülle und ihre Panels und greift nur lesend auf `SITE_BLOCK_TYPES`, `SITE_BLOCK_UI` und die `SiteDraftContext`-Operationen zu. Diese Schnittstelle (Namen und Signaturen aus „Operationen“ unten, Rückgabe `boolean`) ist mit dem ersten Commit eingefroren und wird früh gepusht; Änderungen daran nur in Absprache.
- Hocuspocus speichert Site-Räume (`site-<id>`) als undurchsichtige Y-Updates und liest kein Format; dort ist nichts zu ändern.

## Approaches (im Gespräch entschieden)

- **1a Mischform:** sieben Abschnitte bleiben feste Felder, nur neue Bausteine kommen als Liste dazu. Wenig Risiko, aber zwei Modelle nebeneinander auf Dauer.
- **1b Alles wird Baustein** ← gewählt. Ein Modell, ein Adressschema, eine Render-Schleife. Teurer, aber ohne Bestandsdaten ist der Umbau ohne Konverter machbar.
- (Verworfen vorher: Variante B „volles Elementor mit Spalten/Widgets“ – Design und Mobil-Tauglichkeit nicht garantierbar.)

## Das Modell

### Seitenebene (bleibt außerhalb der Bausteine)

`site_title`, `tagline`, `profile_image`, `profileImageFocus`, `contact_email`, `contact_phone`, `social_links`, `variant` (Spalte `theme`), `header` (weiß/farbig). Das sind Angaben über die Person bzw. die ganze Seite; mehrere Bausteine lesen sie (Hero zeigt Name und Porträt, Kontakt zeigt E-Mail).

### `sections`-jsonb, neue Form

```ts
{
  header?: 'weiss' | 'farbig',          // wie heute, Default weggelassen
  profileImageFocus?: SiteImageFocus,    // wie heute
  blocks: SiteBlock[]                    // neu
}
```

`hidden` und `heroLayout` fallen als Seitenfelder weg: `hidden` wird pro Baustein, `heroLayout` wird Feld `layout` des Hero-Bausteins.

### Baustein

`z.discriminatedUnion('type', …)`, jede Variante hat gemeinsam `id`, `type`, `hidden?: boolean` (Default `false`, weggelassen wenn false) und flach ihre Felder:

| type | Felder (wie heute im jeweiligen `sections.<id>`) |
|---|---|
| `hero` | `layout?: 'portrait' \| 'vollbild'` |
| `about` | `title`, `content` (RichTextDoc) |
| `heroImage` | `imageUrl`, `imageFocus?`, `title`, `subtitle` |
| `themes` | `items: { id, title, imageUrl, imageFocus?, content }[]` (max 6) |
| `actions` | `items: { id, text, link, imageUrl, imageFocus? }[]` (max 6) |
| `socialFeed` | `title`, `instagramUsername?`, `showFeed` |
| `contact` | `title`, `backgroundImageUrl`, `backgroundFocus?` |

- **IDs werden gespeichert** (Bausteine und Listeneinträge). Heute vergibt `siteDraftFromSite` bei jedem Laden neue IDs; das reicht für Doppeln und kollaboratives Verschieben nicht. Format: `z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)`, erzeugt mit `crypto.randomUUID()`. Eindeutigkeit innerhalb der Seite (Bausteine und alle Einträge zusammen) prüft ein `superRefine`.
- **Grenzen:** `SITE_BLOCKS_MAX = 20` pro Seite. Pro Typ `max` aus der Registry: `hero` 1, `socialFeed` 1 (Instagram-Einwilligung und Consent-Skript gelten seitenweit), `contact` 1 (Anker `#kontakt` und Kontaktdaten sind seitenweit). Alle anderen unbegrenzt bis zur Seitengrenze.
- **Hero:** genau einer, immer an Index 0, nicht ausblendbar, nicht verschiebbar, nicht löschbar, nicht doppelbar. Das Schema erzwingt Index 0 und Anzahl 1; die Operationen verweigern alles andere.

### Registry

`SITE_BLOCK_TYPES` als `as const`-Registry in `@gruenerator/contracts` (Wire-querende Menge → benanntes `z.enum` `siteBlockTypeSchema` daraus abgeleitet):

```ts
{ type: 'themes', max: null, itemMax: 6, pinned: false, defaults: () => ({ items: [] }) }
```

Anzeigename und Icon gehören nicht in contracts, sondern in eine Registry in `packages/sites` (`SITE_BLOCK_UI`, `Record<SiteBlockType, { label, icon, description }>`) – die liest die Seitenleiste. Render-Komponenten liegen als `Record<SiteBlockType, Component>` in `sites-design`, Editor-Formulare als `Record<SiteBlockType, Form>` in `packages/sites`. Der `Record<SiteBlockType, …>`-Typ erzwingt beim Hinzufügen eines Typs, dass alle drei Stellen ihn kennen.

### Standardseite

Eine neue Seite bekommt die sieben Bausteine in heutiger Reihenfolge `hero, about, heroImage, themes, actions, socialFeed, contact` mit leeren Inhalten. `siteDraftFromSite` liefert diese Liste, wenn `sections.blocks` fehlt oder leer ist (frisch angelegte Zeile, zurückgesetzte Zeile).

## Live-Entwurf (Y.Doc, Schemaversion 2)

- `siteFields` (Y.Map): nur noch die Seitenfelder oben.
- `siteBlocks` (Y.Map<blockId, Y.Map>): je Baustein `type`, `hidden` und seine Skalarfelder als Einzelschlüssel (last writer wins pro Feld, wie heute bei `siteFields`).
- `siteBlockOrder` (Y.Array<string>): Reihenfolge.
- Listen-Bausteine (`themes`, `actions`) tragen in ihrer Block-Map `items` (Y.Map<itemId, Y.Map>) und `itemOrder` (Y.Array<string>) – dasselbe Muster wie heute `siteThemes`/`siteThemeOrder`, nur eine Ebene tiefer.
- Rich Text als Top-Level-XmlFragments: `rt:block:<blockId>` (about) und `rt:item:<itemId>` (Themen-Karte). Beim Entfernen wird das Fragment geleert (Top-Level-Typen lassen sich nicht löschen); beim Doppeln wird der Inhalt in das Fragment der neuen ID kopiert.
- `decodeSiteDraft` behält die heutige Robustheit: Reihenfolge-Einträge ohne Block und doppelte IDs (nebenläufiges Verschieben = delete+insert) werden beim Lesen verworfen; ein Hero, der nicht vorne steht, wird beim Lesen nach vorne gestellt; Bausteine ohne Ordnungseintrag werden hinten angehängt statt verloren.
- `SITE_YDOC_SCHEMA_VERSION = 2`. Die Migration löscht alle gespeicherten Site-Räume. **Korrektur nach dem Live-Test (21.11.):** Das gemeinsame Collab-Paket hält jeden Raum zusätzlich im IndexedDB des Browsers, und ein Editor-Tab, der über das Deploy offen bleibt, schreibt seinen v1-Stand in den frisch gesäten Raum zurück. Yjs löst die gleichzeitigen `siteMeta`-Einträge über die Client-ID auf, das alte `schemaVersion: 1` kann also gewinnen. Deshalb gilt als Seed-Merkmal **nicht** das Meta-Feld, sondern eine nicht leere `siteBlockOrder` (nur ein v2-Seed schreibt sie, der Hero hält sie dauerhaft nicht leer) – in `isSiteDocSeeded` und in Hocuspocus `applySiteSeed`. Ein Raum mit Daten, aber ohne Block-Reihenfolge, wird gesät statt abgewiesen; die Seed-Werte von Meta und Seitenfeldern werden danach lokal noch einmal geschrieben, damit sie gegen den alten Stand gewinnen. Die alten v1-Schlüssel bleiben ungelesen liegen.
- `SITE_YDOC_KEYS`/`SITE_FIELD_KEYS` werden entsprechend umgebaut; die alten Schlüssel `siteThemes`, `siteThemeOrder`, `siteActions`, `siteActionOrder`, `rt:about`, `rt:theme:*` und die Feldschlüssel `about.*`, `heroImage.*`, `contact.*`, `socialFeed.*`, `hidden`, `heroLayout` verschwinden.

### Operationen (contracts `richtext/siteDoc.ts`, gewrappt in `SiteDraftContext`)

`addBlock(type, index)`, `removeBlock(id)`, `moveBlock(id, toIndex)`, `duplicateBlock(id)` (fügt direkt dahinter ein), `setBlockHidden(id, hidden)`, `setBlockField(id, key, value)` (typisiert pro Blocktyp), `addItem(blockId, index?)`, `updateItem(blockId, itemId, patch)`, `removeItem(blockId, itemId)`, `moveItem(blockId, itemId, toIndex)`. Jede Operation läuft in einer Y-Transaktion und verweigert still, was Registry-Grenzen oder die Hero-Regeln verletzt (Rückgabe `false`, damit die UI reagieren kann).

## Adressen auf der Seite

- Felder: `blocks.<blockId>.<leaf>`, z. B. `blocks.k3f…title`.
- Listeneinträge per ID, nicht per Index: `blocks.<blockId>.items.<itemId>.<leaf>`. Per Index verrutscht die Adresse, wenn jemand anderes gleichzeitig verschiebt.
- Seitenfelder bleiben nackt: `site_title`, `tagline`, `profile_image`, `contact_email`, `contact_phone`.
- Die Zuordnung Adresse → Y-Feld wird abgeleitet (ein Parser), die handgeschriebene Tabelle in `inline/fieldBindings.ts` fällt weg.
- Jeder gerenderte Baustein trägt `data-block-id` und `data-block-type` am äußeren Element; Auswahl, Hervorhebung und Toolbar-Anker gehen darüber. `fieldPaths.panelForPath` wird zu „welcher Baustein“ statt „welche Section-ID“.

## Rendern (`sites-design`)

- `SiteBody` rendert `visibleBlocks(snapshot).map(block => RENDERERS[block.type])`. `SITE_SECTION_IDS` als Reihenfolgequelle entfällt.
- Jede Section-Komponente bekommt ihren Block als Prop statt `ctx.snapshot.sections.<id>` zu lesen; Seitenfelder liest sie weiter aus dem Snapshot.
- `isSectionEmpty` wird `isBlockEmpty(block, snapshot)`, `visibleSections` wird `visibleBlocks` (ausgeblendet, leer, Social-Feed-Regel wie heute). `server.ts` entscheidet das Consent-Skript weiter über „gibt es einen sichtbaren socialFeed-Baustein“.
- **Anker:** erster sichtbarer Baustein eines Typs bekommt den heutigen Anker (`ueber-mich`, `themen`, …), weitere `themen-2`, `themen-3`. Die Navigation in der Kopfzeile listet wie heute je Typ den ersten sichtbaren Baustein.
- **Hintergründe:** Grundlage bleibt die Tabelle pro Typ und Variante in `grounds.ts`. Neu ist eine Regel: hat ein Baustein denselben Grund wie sein sichtbarer Vorgänger, nimmt er einen Ausweichgrund (Tabelle `ALTERNATE`, je Grund ein Nachbar mit ausreichendem Kontrast). Für die Standardseite greift die Regel nie, sie sieht also aus wie heute. `sectionGround` bekommt dafür die Liste der sichtbaren Bausteine bzw. den Vorgängergrund; Header, Footer und `swatches.ts` behalten ihre Teile. Die Ausweichtabelle legt der Builder fest, mit Kontrastprüfung nach `docs/CLAUDE-a11y.md`.
- DE/AT: Texte und AT-Sonderfälle (z. B. Hellgrün-Tint für `about` in AT/hell) hängen am Typ, nicht an der Position.

## Snapshot und Veröffentlichen

- **Ausgeblendete Bausteine im Editor** *(Entscheidung Claude)*: Die Editor-Vorschau zeichnet sie gedimmt mit dem Hinweis „Ausgeblendet“, damit man sie anklicken und wieder einblenden kann, solange die Seitenleiste fehlt. Dafür baut der Editor seinen Vorschau-Snapshot mit `includeHidden: true`; die Vorschau-Ansicht „Vorschau“ und der veröffentlichte Snapshot lassen sie weg. Die Hintergrund-Regel rechnet **immer nur über sichtbare** Bausteine; ein ausgeblendeter Baustein im Editor bekommt den Grund, den er hätte, wenn er sichtbar wäre, und verschiebt die Gründe der anderen nicht. So zeigt der Editor dieselben Gründe wie die veröffentlichte Seite.
- **Leere Bausteine** *(Entscheidung Claude, wie heute)*: Leer ist kein Fehler. Ein leerer Baustein wird nicht gerendert (`isBlockEmpty`) und blockiert das Veröffentlichen nicht. Fehler beim Veröffentlichen sind wie heute nur Formatfehler, die das strikte Schema meldet (Link ohne https, Bild nicht aus der Mediathek, zu lang, Rich Text mit unerlaubter Formatierung) plus fehlendes Impressum.
- **Hero fehlt oder steht falsch** *(Entscheidung Claude)*: Der Hero hat nur das optionale Feld `layout`, er kann kaum kaputt sein. Trotzdem: Der lenient-Snapshot und `decodeSiteDraft` stellen einen vorhandenen Hero nach vorne und setzen einen Standard-Hero ein, wenn keiner da ist. Das strikte Schema lehnt beides ab, kann es aber nie sehen, weil `buildSiteSnapshot` vom dekodierten Entwurf ausgeht.

- `PublishedSiteSnapshot.sections` wird `{ header?, profileImageFocus?, blocks }`; **ausgeblendete Bausteine kommen nicht in den Snapshot**. `hidden_sections` entfällt. Die Vorschau baut ihren Snapshot genauso (ausgeblendete Bausteine erscheinen nicht – wie heute).
- `buildSiteSnapshot` validiert pro Baustein; Issue-Pfade lauten `blocks.<blockId>.<leaf>`, damit `PublishControls` aus der 422-Liste zum Baustein springen kann (Auswahl setzen).
- `snapshotDiffers` vergleicht weiter die gebauten Snapshots.
- `publishedSiteSnapshotSchema` (strikt) und `previewSiteSnapshotSchema` (lenient) werden für die neue Form neu geschrieben; der lenient-Modus verwirft einen kaputten Baustein, nicht die ganze Seite.

## Editor (`packages/sites`)

- Auswahl im `editorStore` hält `blockId` (plus optional `itemId`), nicht mehr `SectionType`.
- `BlockForm({ blockId })` (neu, `editor/canvas/`) wählt das Formular über `FORMS[block.type]` und rendert nur den Inhalt, ohne Rahmen; die Seitenleiste (Teil 3) setzt es in ihr Panel. `ElementPanel` bleibt bis dahin eine dünne Hülle darum. Die Formulare bekommen `blockId`.
- `editorStore.selection` hat die Form `{ blockId, itemId? } | null`. `dialog`/`openDialog` bleiben in diesem Teil stehen; Teil 3 entfernt sie mit EditorDialogs (abgestimmt mit der Seitenleisten-Sitzung, 21.11.).
- `CanvasToolbar`: für den ausgewählten Baustein nach oben/unten, doppeln, ausblenden, löschen (Hero: nichts davon). Listen-Operationen wie heute, aber mit `blockId`.
- `SectionVisibility` in den Einstellungen entfällt; Ein-/Ausblenden und Reihenfolge wandern in die Seitenleiste (Teil 3). Bis Teil 3 steht, reicht die Toolbar.
- „Baustein hinzufügen“ gibt es in diesem Teil nur als Draft-Operation, ohne eigenes UI – das UI dafür ist Teil 3.

## Generierung und Anlegen

- **Der KI-Builder baut zunächst genau die Seite wie heute** (Vorgabe Moritz, 21.11.): dieselben sieben Bausteine in derselben Reihenfolge, mit denselben Inhalten und Bildern an denselben Stellen. Neue Baustein-Typen setzt die Generierung erst ein, wenn das eigens entschieden ist. Beweis: ein Golden-Test fährt dieselbe `WebsiteContent`-Eingabe durch alten und neuen Weg und vergleicht das gerenderte HTML der veröffentlichten Seite (bis auf `data-block-id`/Anker-Attribute) – vor dem Umbau aufgenommen, danach gleich.
- Die KI liefert weiter `WebsiteContent` (`schemas/texte.ts`, `prompt.ts` unverändert).
- `packages/sites/src/generation/transform.ts` baut daraus die Standardseite als `blocks` mit frischen IDs; `CreateFlow` schickt `sections: { blocks }`.
- `content.ts` (Bildzuordnung, Link-Prüfung) bleibt, es arbeitet auf `WebsiteContent`.

## Migration

- SQL-Migration (ohne BEGIN/COMMIT): `UPDATE user_sites SET sections = '{}'::jsonb, published_snapshot = NULL` und Löschen der gespeicherten Y-Zustände der Site-Räume (`site-<id>`, Tabelle(n) wie in `services/hocuspocus/src/persistence.ts`). Vorbild: `sites_drop_bio_and_reset_sections.sql`.
- Kein Doppel-Lesen, kein Konverter, keine Deprecation-Frist.
- E2E-Fixture `apps/web/tests/e2e/fixtures/sitesFixtures.ts` auf die neue Form.

## Tests (Mindestumfang)

- contracts: Schema (Hero an 0, Typ-Grenzen, ID-Eindeutigkeit, lenient verwirft einzelnen Baustein); Codec-Roundtrip; jede Operation inkl. Verweigerungen; Doppeln kopiert Rich Text und vergibt neue IDs für Baustein und Einträge; Decode-Robustheit (doppelte Order-Einträge, verwaiste Blöcke, Hero nicht vorne); zwei Clients verschieben denselben Baustein nebenläufig → genau einmal vorhanden.
- sites-design: Standardseite rendert dieselbe Reihenfolge und dieselben Gründe wie vorher; zwei gleiche Bausteine hintereinander → verschiedene Gründe, Anker `-2`; ausgeblendeter Baustein fehlt.
- sites: Feldadressen-Parser; Toolbar-Operationen; Publish-Issue springt zum Baustein; Generierung erzeugt Standardseite.
- api: create/update/publish mit neuer Form; Migration läuft im `migrations.db.vitest.ts` auf leerer DB.

## Dem Builder überlassen

- Basis: auf `feat/sites-hero-fullscreen` bauen; bewegt sich #5916 im Review, wird es hineingemergt (nicht rebased). Wird #5916 gemergt, `origin/master` hineinmergen.
- Hocuspocus und Web werden ohnehin zusammen deployt; der Dienst liest das Site-Format nicht (geprüft: `services/hocuspocus/src/persistence.ts` speichert Site-Räume als undurchsichtige Updates).

- Dateiaufteilung in contracts (eigene `siteBlocks.ts` o. ä.), Namen der Helfer.
- Die Ausweich-Tabelle für Hintergründe (mit Kontrastmessung).
- Commit-Schnitt; Vorgabe nur: Registry + Schema + Codec + Operationen zuerst als eigener, früh gepushter Commit, weil Teil 3 darauf baut.
- Ob `setBlockField` per Overload oder per generischem Schlüssel typisiert wird.
