# ggraphic demo

Eine neutrale Seite, die den Editor so einbindet, wie es ein fremder Host täte, und ein Messinstrument dafür, wie viel Grünerator dabei noch mitkommt.

**Was die Seite zeigt:** einen `ConfigCanvas` mit einer eigenen, kleinen Vorlage (`src/demoTemplate.ts`): eine Fläche in `brandDefault.defaultBackground`, eine Überschrift in `brandDefault.colors.textOnDark` und `brandDefault.fonts.headline` (Raleway, mit Arial als Rückfall, weil der Pack noch keine Schriftdateien mitbringt). Die Vorlage geht als Config-Objekt hinein, nicht als registrierte Id; `ConfigCanvas` fasst die Vorlagen-Registry nicht an, deshalb kommen die eingebauten Vorlagen nicht mit. Es gibt keinen `CanvasEditorProvider`, die Seite läuft also auf den eingebauten Rückfällen der Host-Dienste.

**Das Ausstiegskriterium von Phase 1** lautet: diese Seite rendert eine Vorlage mit `brand-default`, ohne dass ein Grünerator-Paket in ihrem Importgraphen steht. Seit der vierten Umzugsrunde ist das erreicht: der Bericht unten zählt 0 Module aus `@gruenerator/*`.

Die App liegt bewusst nicht unter `packages/ggraphic-*`, weil `scripts/check-ggraphic-core-boundary.mjs` den Import von `@gruenerator/*` dort zu Recht ablehnt.

## Befehle

```bash
pnpm --filter @gruenerator/ggraphic-demo dev      # Vite-Dev-Server
pnpm --filter @gruenerator/ggraphic-demo build    # Bundle nach dist/, schreibt dist/import-report.json
pnpm --filter @gruenerator/ggraphic-demo report   # dasselbe, aber leise bis auf den Bericht
```

Installieren reicht ohne Voll-Install: `pnpm install --filter "@gruenerator/ggraphic-demo..."`.

## Der Bericht

`importReport.ts` ist ein Vite-Plugin, das nach dem Build `dist/import-report.json` schreibt und eine Zusammenfassung ausgibt. Gezählt wird jedes Modul, von dem nach dem Tree-Shaking noch Code im Bundle steht (Barrels und reine Typdateien mit 0 Byte zählen nicht), und zwar in allen Chunks, die faulen eingeschlossen. „Eager“ sind die Module in den Chunks, die die Seite vor dem ersten Rendern lädt. Zugeordnet wird jedes Modul seinem Workspace-Paket (über den Verzeichnispfad) oder seinem npm-Paket (über das letzte `node_modules/`-Segment).

Je `@gruenerator/*`-Paket steht im JSON:

- `editorImporters`: die Editor-Dateien im Bundle, die ein Modul dieses Pakets importieren, das selbst oder über seine Barrels Code ins Bundle bringt;
- `firstChain`: der kürzeste Importpfad vom Einstieg zum ersten Modul des Pakets, das im Bundle steht. Der Pfad läuft über den ganzen Modulgraphen, kann also durch Barrels führen, die selbst nichts ausliefern.

## Stand: 27.10.2026, Basis #5065 plus vierte Umzugsrunde

835 Module im Bundle, 310 davon eager. **Kein Modul stammt mehr aus einem `@gruenerator/*`-Paket.** Damit ist das dritte Ausstiegskriterium von Phase 1 erfüllt. `@ggraphic/editor` liefert 159 Module (152 eager), `@ggraphic/schema` 7 und `@ggraphic/core` 1. Die Seite importiert `ConfigCanvas` aus `@ggraphic/editor/components/ConfigCanvas` und `AnyCanvasConfig` aus `@ggraphic/editor/configs/types`. `package.json` nennt kein Grünerator-Paket mehr, und Vite-Aliase bzw. tsconfig-Pfade auf `@gruenerator/*` gibt es keine mehr.

**Wie es dazu kam:** Nach der dritten Runde standen noch 75 Dateien aus `@gruenerator/canvas-editor` im statischen Abschluss von `ConfigCanvas`. Nur drei davon trugen Markeninhalte (`templates/registry.ts`, `brand/theme.ts`, `brand/grueneAssets.ts`), und alle drei hingen an der Vorlagen-Registry. #5065 teilte sie: die Mechanik (`defineTemplate`, `registerTemplates`, `getTemplate`) steht in `@ggraphic/editor/templates/registry`, der Grünerator-Katalog registriert sich beim Laden selbst. Danach war der ganze Abschluss markenfrei. Weil er Zyklen enthält (`GenericCanvas` ↔ `hooks/index.ts`, `CanvasStage` ↔ `captureStage`, `CanvasText` ↔ `CanvasRichText`), zogen die 72 Dateien in einem Zug um, nicht Schicht für Schicht.

**Verlauf `@gruenerator`-Module im Bundle:** 1307 (Basis #5026, mit `StandaloneCanvas`) → 396 (#5031) → 168 (#5033) → 120 (#5035) → 89 (#5039) → 77 (#5047, dritte Runde) → 0.

**Was ohne Host fehlt, und zwar mit Absicht:** Ohne Host kennt der Editor keine Katalog-Grafik, keine Emoji-Dateien und keine Illustrationen (`registerAssetCatalog`), keine Grünerator-Elementarten wie die Balken (`registerKindRenderers`) und keine eingebauten Vorlagen (`registerTemplates`). Es gilt `brandDefault`. Die Host-Dienste laufen auf ihren eingebauten Rückfällen.

## Format und Größe einer eigenen Vorlage

Die Bühne nimmt die Größe ihres Formats an und skaliert den Bezugsraum der Vorlage (`config.canvas`) **je Achse** darauf (`CanvasStage`, `scaleX`/`scaleY`). Ohne `formatId` wählt `ConfigCanvas` deshalb das digitale Format, das genau so groß ist wie die Vorlage (`formatIdForSize`); eine Vorlage mit 1080 × 1080 landet so auf dem quadratischen Format statt gestreckt auf 4:5. Gibt es kein Format dieser Größe, bleibt es beim Standardformat 1080 × 1350, und die Vorlage wird gestreckt. Eine übergebene `formatId` gewinnt immer.
