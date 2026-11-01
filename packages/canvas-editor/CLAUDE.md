# CLAUDE.md — packages/canvas-editor

Config-getriebener react-konva-Editor (Sharepics, Slider, Decks). Jede Instanz hat ihre eigenen Zustand-Stores über `CanvasStoreProvider`. Eingebunden wird er von `apps/web` (Image Studio, `/studio/canvas/:id`, `/mobile-editor`). Die native App lädt genau diese Web-Seiten in einer WebView und spricht mit dem Editor über keine eigene Brücke.

## Design: „Canva-Layout in Grünerator-Grün"

Die Editor-Oberfläche färbt sich **ausschließlich über die `--editor-*`-Token** (`--editor-bg`, `--editor-surface`, `--editor-tile`, `--editor-text-secondary`, `--editor-active-bg` …). In Tailwind heißen sie `bg-[var(--editor-tile)]` oder, über das `@theme`-Mapping, `bg-editor-tile`.

### Keine `dark:`-Utilities

Ein Token schaltet selbst zwischen Hell und Dunkel um. `dark:` tut das nicht zuverlässig, und zwar in den beiden Builds verschieden:

- **`apps/web`** definiert `@custom-variant dark` auf `[data-theme="dark"]`. Wer das Theme auf „System" lässt, bekommt im Dunkelmodus des Betriebssystems also die **hellen** `dark:`-Werte. Die Token haben dafür einen eigenen `@media (prefers-color-scheme: dark)`-Block.
- **Das Paket-Bundle** (`build:css`) definiert keine eigene Variante. Dort greift Tailwinds Standard, `prefers-color-scheme`, und ein ausdrücklich gewähltes helles Theme wird ignoriert.

Fehlt eine Farbe, gehört ein neues Token her, keine `dark:`-Klasse.

**Die Regel wird maschinell geprüft**, aber nicht von ESLint (kein Regelwerk dort liest Tailwind-Klassen), sondern von `src/__tests__/editorTokenRules.vitest.ts`: der Test findet jede `dark:`-Klasse in `src/`, auch gestapelte wie `active:enabled:dark:`.

### Wo die Token stehen — vier Dateien plus eine Kopie

Ein neues Token muss an **allen** Stellen nachgezogen werden:

| # | Datei | Inhalt |
|---|---|---|
| 1 | `apps/web/src/assets/styles/common/variables.css` | Werte: `:root` (hell), `[data-theme="dark"]` und `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` |
| 2 | `packages/canvas-editor/src/styles/variables.css` | dieselben Werte, von Hand gespiegelt; nur `:root` und `[data-theme="dark"]` |
| 3 | `apps/web/src/assets/styles/index.css` (`@theme`) | `--color-editor-*` → `var(--editor-*)` |
| 4 | `packages/canvas-editor/src/styles/tailwind-input.css` (`@theme`) | dasselbe Mapping fürs Paket-Bundle |

In der App zeichnet der Host die Kopfzeile nativ in Systemfarben (`HOST_CAPABILITY_EDITOR_CHROME`, `hostDrawsEditorBar` in `apps/mobile/services/webview/hostChrome.ts`); eine Kopie von `--editor-menubar-gradient` außerhalb von CSS gibt es nicht mehr.

Ob Datei 1 und 2 auseinandergelaufen sind, zeigt ein Vergleich der Tokennamen:

```bash
diff <(grep -oE -- '--editor-[a-z0-9-]+:' packages/canvas-editor/src/styles/variables.css | sort -u) \
     <(grep -oE -- '--editor-[a-z0-9-]+:' apps/web/src/assets/styles/common/variables.css | sort -u)
```

Der Vergleich prüft nur die Namen, nicht die Werte. Wer einen Wert ändert, ändert ihn in beiden Dateien. Derselbe Namensvergleich — plus das `@theme`-Mapping in Datei 3 und 4 — läuft in `editorTokenRules.vitest.ts`.

## Mobil (< 900 px)

- Breakpoint `--breakpoint-canvas-mobile: 900px`, in beiden `@theme`-Blöcken. Die Varianten sind `max-canvas-mobile:` (darunter) und `canvas-mobile:` (ab 900 px). Aus JS reaktiv: `useIsCanvasMobile()` (`hooks/useIsCanvasMobile.ts`). Neue Abfragen nutzen diesen Hook. Nicht reaktiv sind `utils/viewport.ts` und die `isDesktop`-Werte in den `*_full`-Configs und `configs/factory/`: sie lesen `window.innerWidth` einmal.
- Aufbau: Kopfzeile → Fläche → ein Sheet → feste Leiste mit sechs Bereichen. Sheet und Leiste liegen im Fluss, nicht `fixed`. Die Fläche schrumpft deshalb, statt verdeckt zu werden (`useMobileSheetFit`).
- Unterbereiche eines Bereichs erscheinen als Filter-Chips im Sheet (`SubsectionTabBar`), nicht als zweite Tab-Reihe.
- Antippen wählt nur aus, es öffnet **kein** Sheet — die Fläche behält ihre Größe (Canva-Muster). Die Bereichs-Leiste weicht dann der Auswahl-Leiste (`MobileSelectionBar`, selber Slot, selbe Höhe) mit der Formatierung, „Mehr" und ✓; über dem Objekt steht die Pille (`MobileSelectionPill`) mit Duplizieren, Löschen und „…", die beim Ziehen und Transformieren verschwindet. Den Bereich der Auswahl (`mobileSelectionArea.ts`) öffnet erst „Mehr"/„…" — zuerst das Ziel von `getAutoSwitchTab` (wie Desktop, auch versteckte Tabs), sonst nur ein Tab, der das Objekt selbst zeigt (Illustration/Rahmen → Detailansicht im Katalog). Text, Formen, Icons, Grafiken, Uploads und Vorlagen-Deko (`image` ohne `currentImageSrc`) haben kein „Mehr": ihre Tabs sind Kataloge zum Hinzufügen. Hintergrund und Foto auch nicht — es gibt keinen Hintergrund-Tab mehr; Farbe, Bild, Zoom und Fixieren stehen vollständig in der Auswahl-Leiste (`config.background` → `ContextControls`). Oben im Sheet steht dann der Auswahl-Block (`MobileSelectionControls`). Schließen des Sheets hebt die Auswahl nicht auf.
- Löschen läuft für Taste und Pille über `utils/removeElement.ts`. Wer eine Elementart ergänzt, trägt sie in `utils/elementKinds.ts` ein (State-Key, Lösch-Aktion, Stapelplatz); Löschen und Stapelreihenfolge folgen von dort. Das gilt für die Arten des Kerns. Eine Art, die nur der Grünerator kennt (heute die Balken), steht **nicht** im Kern: sie hat genau eine Registrierung, `registerElementKind` in `brand/balkenKind.ts` (State-Key, Aktionen, Kopieren, Drehen, Pfeiltasten, Leiste, Ebenen-Name, KI-Zeile und -Änderung, PPTX, Seiten-Schlüssel), eingetragen von `registerGrueneHostSeams` — in apps/web beim Start, in beiden Testlanes über `vitest.setup.assets.ts`. Ihre Typen hängt sie per `declare module` an `HostElementKinds` (`utils/balkenUtils.ts`), ihre Aktionen an `HostCanvasActions`, ihre Texte an `HostMessages` (`registerHostMessages`, die Schlüssel bleiben `layers.bar`, `sidebar.bars.*`, `sidebar.badges.*Bar*`). Ihr Renderer steht in `brand/grueneKinds.tsx` und wird im Paket-Einstieg `src/index.ts` eingetragen (`registerKindRenderers`, getrennt, weil er Konva zieht), in der dom-Testlane über `vitest.setup.kinds.ts`. Der Wächter `scripts/check-ggraphic-core-boundary.mjs` lehnt Balken-Bezeichner im Kern ab.
- Ist ein Element gesperrt, zeigt die Pille statt Löschen „Entsperren". Mobil gibt es kein Kontextmenü.

## Befehle, Kontextmenü, Sperren

- **Eine Tür je Befehl.** Kopieren, Ausschneiden, Einfügen, Duplizieren, Löschen, Ebenen, Sperren und Alles auswählen stehen in `utils/canvasCommands.ts`, pro Seite, erreichbar über `GenericCanvasRef.runCommand`. Tastatur, Kontextleiste, Pille und Kontextmenü rufen diese Türen. Nichts daneben verdrahten.
- **Namen und Kürzel** stehen nur in `utils/canvasCommandRegistry.ts`. Das Kürzel im Menü ist dasselbe, auf das die Tastatur hört; `canvasShortcuts.vitest.tsx` prüft das. Was mit einer Auswahl geht, beantwortet für Leiste und Menü dieselbe Funktion: `utils/selectionCapabilities.ts`.
- **Das Kontextmenü gibt es einmal pro Editor** (`components/CanvasContextMenu/`), und nur auf dem Desktop. Der Grund: jede gemountete Radix-Menü-Wurzel hängt einen Keydown-Listener an `document`. Was ein Rechts-Druck auswählt, entscheidet `hooks/useContextPress.ts`, bevor Konva den Druck bekommt.
- **Sperren:** Die gesperrten Ids stehen in `lockedLayerIds` auf der Seite (`utils/layerLock.ts`); die Primitive lesen sie über `useIsItemLocked()`. Ein neues Primitiv nimmt die Sperre in `draggable` auf und legt `LOCKED_TRANSFORMER` an seinen Transformer.

## Marke eines Dokuments (DE/AT)

**Was ein NEUES Element an Schrift, Farbe und Diagrammreihe mitbekommt, steht in der Marke des Dokuments, nicht in der Registry.** `activeBrand()` ist immer die erste registrierte Marke (`GRUENE_DE`); die Reihenfolge der Registry ändert sich nie mit dem offenen Dokument, weil jeder Editor des Wirts sie liest. Ein `*_at_full`-Sujet trägt deshalb `brand: getBrandPack('de-AT')` an der Config (`FullCanvasConfig.brand`, bei den Fabriken die Option `brand`). Von dort geht es zwei Wege: in die Aktionsfabriken (`createBaseActions(…, brand, …)` → `createElementActions` → Text, Pillen, Kreise, Rahmen, Formen, Illustrationen, Diagramme) und über `DocumentBrandContext` der Shell (`useDocumentBrand()`) in die Panels, die Vorgaben anbieten (Farbfelder, Kontur- und Schattenfarben, Text-Kacheln, Werkzeuge). Wer ein neues `*_at`-Sujet baut, trägt die Marke ein — sonst startet es in deutschen Schriften; `configs/__tests__/brand-defaults.vitest.ts` läuft über jedes Sujet mit `audience: 'de-AT'` in der Registry und wird dann rot. **Der Textmarker folgt derselben Marke wie die Werkzeugleiste:** `defaultTextMarker(brand)` und `markerInkOn(fill, brand)` nehmen sie als Parameter. `GenericCanvas` legt `config.brand` in `DocumentBrandContext`, damit jede Einbindung einer Seite sie hat — Editor, eingebettete Leinwand, Offscreen-Wurzeln für Vorschau und Export, in denen keine Shell eine liefert. Darunter lesen `CanvasRichText`, `CanvasTextOverlay` und die Marker-Mark in `RichTextField` per `useDocumentBrand()`; der PPTX-Export bekommt sie als `brand` (`buildPptxModel`, `exportPptxDeck`), weil er aus dem Seitenzustand baut und keinen React-Kontext sieht. Wer einen weiteren Leser des Markerstandards baut, liest dieselbe Marke — sonst zeigt die Werkzeugleiste eine Farbe und die Seite zeichnet eine andere (`markerBrand.vitest.tsx`, `documentBrandMarker.vitest.tsx`). **Bleibt auf `activeBrand()`:** Zeichenflächen-Chrome (Auswahlrahmen, Anker, Bühnenfläche), `defaultTint` (Bildtönung) und alles, was Paletten-Ids kennt (die Form-Kacheln in `FormenSection` — `getShapeVariant` ist ein Modul-Cache ohne Dokument, die Textmarker-Form steht dort mit —, das Verlaufstext-Symbol).

## Barrierefreiheit

WCAG 2.2 AA; Prüfmittel und Messfallen in `docs/CLAUDE-a11y.md`, Browser-Tests über den Barrierefreiheitsbaum in `docs/CLAUDE-canvas-browser-tests.md`.

- **Tastaturbesitz (R1), eine Quelle: `utils/keyboardOwnership.ts`.** Tasten, die ein fokussiertes Widget selbst verbraucht (Pfeile in Listen, Slider, Textfelder), gehören dem Widget. Globale Kürzel (Entf/Rücktaste, Mod+C/X/V/D/A, Mod+Z) gelten aus jedem Fokus außerhalb von Textfeldern, wie bei Figma/Canva. Alt+Pfeil schiebt überall das Element. Wer ein Widget mit eigenen Tasten baut, trägt es dort ein, statt in der Seite zu filtern.
- **Die eine Live-Region** (`components/CanvasAnnouncer.tsx`, `hooks/useAnnounce.ts`): Aktionen ohne sichtbare Antwort (Löschen, Einfügen, Rückgängig, KI-Änderungen, Vorlage angewendet) rufen `useAnnounce()` dort, wo die Aktion einmal geschieht (Befehle, Verlauf), nicht an jedem Knopf. Die Auswahl sagt `useSelectionAnnouncement` verzögert an und weicht einer neueren Ansage und der Ebenen-Liste.
- **Die Ebenen-Liste ist der Zwilling der Leinwand** (`sidebar/sections/LayersSection.tsx`, Sprunglink „Zu den Ebenen"): alles, was man auf der Fläche sieht und anfasst, muss dort mit Namen stehen, auswählbar und mit Enter/F2 bearbeitbar. Ein neues Element ohne Eintrag dort ist für Tastatur und Screenreader unsichtbar. Die Seite ist `role="group"` „Seite N" mit dem Knopf „Seite N bearbeiten" (`data-page-focus-target`, nur für Tastaturnutzer sichtbar) und einer Bühne `role="img"` mit Kurzbeschreibung.
- **„Text bearbeiten" (F2, Enter in der Liste, Kontextmenü) öffnet über `utils/textEditorOpeners.ts`**, wenn ein Element auf Doppelklick an einem inneren Knoten hört (Balken- und Störer-Zeilen, Pille): das Primitiv meldet mit `useTextEditorOpener(id, …)` seinen Öffner, `canEditText` in `selectionCapabilities` nennt die Art (eine Host-Art über `editableText` ihrer Registrierung). Nur `CanvasText` hört am Knoten `#id` selbst. Was zur Vorlage gehört und nicht gelöscht werden darf, meldet die Config über die Aktion `isTemplateBound`; Entf sagt das dann an.
- **Namen für Ebenen und Bühnenbeschreibung kommen nur aus `utils/layerLabels.ts`.** Ebenen-Liste, Auswahl-Ansage, „Gelöscht: …" und `stageSummary` lesen dieselbe Funktion; wer eine Elementart ergänzt, trägt ihren Namen dort ein.
- **Fokus kehrt zurück** (`utils/editorFocus.ts`): nach Textbearbeitung und Löschen zum Ebenen-Eintrag, sonst auf den Seitenknopf — nie auf `body`; ein geschlossener Bereich gibt den Fokus an seinen Tab zurück.
- **Neue Bedienelemente:** Fokusring über die `kbd:`-Variante, Ziel mindestens 24×24 px, Name beginnt mit dem sichtbaren Text, Tests mit `axe` (`a11yGuards.vitest.tsx` führt Kontextleiste, Mobil-Leisten, Pille und Texteditor).
- **Der Wirt setzt `html[data-focus-modality]`** (`keyboard`/`pointer`; apps/web tut das in `src/index.tsx`). Die `kbd:`-Variante, der sichtbare Seitenknopf und die tastaturabhängigen Fokuswechsel (`isKeyboardModality()` in `utils/editorFocus.ts`, z. B. „Zuschneiden“ per Tastatur) hängen daran; ohne das Attribut bleiben Fokusringe aus und der Fokus wandert nicht.

## Prüfen

Aus dem Paketverzeichnis:

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

ESLint läuft über die Wurzel-Config (`WEB_FILES`, also mit jsx-a11y) und typbewusst. Aus dem **Repo-Root** und in Häppchen von höchstens ~20 Dateien, sonst droht OOM: `npx eslint packages/canvas-editor/src/<datei>`. `pnpm --filter @gruenerator/canvas-editor lint` fährt das ganze Paket (~345 Dateien) und gehört deshalb in die CI, nicht in die laufende Arbeit. Warnungen (vor allem `import-x/order` und `react-hooks/refs`) sind Bestand; Fehler brechen den Lauf.

**Browser-Tests und Agenten, die den Editor bedienen:** `docs/CLAUDE-canvas-browser-tests.md` (Barrierefreiheitsbaum statt Konva-Interna).

**Performance, Touch und WebView messen:** Vorgehen, was funktioniert hat und was nicht, steht in `docs/CLAUDE-canvas-eval.md`; die Skripte liegen in `scripts/perf-eval/`. Kurz: Prod-Build über `http://[::1]:<port>` (ohne react-scan), CPU-Drossel, Long Tasks statt FPS, jeden Audit-Befund live reproduzieren, nie die Desktop-Maus für Simulatoren.

Das Paket exportiert seine Oberfläche über `src/index.ts`, `apps/web` liest sie im Quelltext. Wer dort etwas entfernt oder umbenennt, prüft auch `pnpm --filter @gruenerator/web exec tsc --noEmit`.
