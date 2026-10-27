# ggraphic demo

Eine neutrale Seite, die den Editor so einbindet, wie es ein fremder Host täte, und ein Messinstrument dafür, wie viel Grünerator dabei noch mitkommt.

**Was die Seite zeigt:** einen `StandaloneCanvas` mit einer eigenen, kleinen Vorlage (`src/demoTemplate.ts`): eine Fläche in `brandDefault.defaultBackground`, eine Überschrift in `brandDefault.colors.textOnDark` und `brandDefault.fonts.headline` (Raleway, mit Arial als Rückfall, weil der Pack noch keine Schriftdateien mitbringt). Die Vorlage geht als Config-Objekt hinein, nicht als registrierte Id. Es gibt keinen `CanvasEditorProvider`, die Seite läuft also auf den eingebauten Rückfällen der Host-Dienste.

**Das Ausstiegskriterium von Phase 1** lautet: diese Seite rendert eine Vorlage mit `brand-default`, ohne dass ein Grünerator-Paket in ihrem Importgraphen steht. Heute importiert sie noch `@gruenerator/canvas-editor`, und das ist Absicht: der Bericht unten zeigt, was davon im Bundle landet. Diese Zahl soll der Umzug des Kerns auf null bringen.

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

## Stand: 27.10.2026, Basis #5026

1307 Module im Bundle, 553 davon eager. **535 Module stammen aus fünf `@gruenerator/*`-Paketen:**

| Paket                        | Module | davon eager |    Code | Editor-Dateien, die es importieren | erster Pfad über                        |
| ---------------------------- | -----: | ----------: | ------: | ---------------------------------: | --------------------------------------- |
| `@gruenerator/canvas-editor` |    296 |         153 | 1784 KB |                                  – | `index.ts` → `CanvasEditorProvider.tsx` |
| `@gruenerator/contracts`     |    230 |         228 |  503 KB |                                 26 | `components/CanvasTextOverlay.tsx`      |
| `@gruenerator/ui`            |      6 |           0 |    6 KB |                                  8 | `components/CanvasEditor/index.tsx`     |
| `@gruenerator/collab`        |      2 |           2 |    2 KB |                                  1 | `collab/useSelectionAwareness.ts`       |
| `@gruenerator/core`          |      1 |           1 |    1 KB |           0 (nur über `contracts`) | `contracts/src/schemas/userProfile.ts`  |

`@gruenerator/shared` steht nicht im Bundle. Dazu kommen `@ggraphic/schema` (5 Module) und `@ggraphic/core` (1).

**`@gruenerator/contracts` ist der größte Brocken, und er hängt fast vollständig am Barrel.** Alle 26 Editor-Dateien importieren aus `@gruenerator/contracts`, also aus `src/index.ts`. Was dabei mitkommt, sind 128 Module aus `src/schemas/` und 96 aus `src/contracts/` (ts-rest-Verträge), fast alle eager, obwohl der Editor davon Text-Helfer (`stripInlineMarks`, `splitListItems`, `hasInlineMarks`), `DEFAULT_CANVAS_SIZE` und einige Medientypen braucht. Das Paket erklärt keine `sideEffects`, und Rolldown behält deshalb jede Modul-Top-Level-Anweisung (`z.object(…)`, `initContract().router(…)`). Gegenprobe: mit `"sideEffects": false` in `packages/contracts/package.json` fällt `contracts` auf 21 Module (8 eager), `core` verschwindet ganz, und das Bundle schrumpft von 1307 auf 1094 Module. Die Gegenprobe ist nicht eingecheckt. Ob das Flag für die anderen Verbraucher sicher ist, ist ungeprüft (#5027).

Die Editor-Dateien, die `contracts` importieren:
`blocks/liftedBlock.ts`, `components/CanvasEditor/blockInsert.tsx`, `components/CanvasTextOverlay.tsx`, `components/RichTextField.tsx`, `composer/cardFollowsText.ts`, `composer/chromeParts.ts`, `configs/dreizeilen_full.config.tsx`, `configs/freeform_full.config.tsx`, `configs/profilbild_full.config.tsx`, `configs/shareSection.ts`, `configs/sticker_full.config.tsx`, `primitives/CanvasRichText.tsx`, `primitives/CanvasText.tsx`, `sidebar/sections/assets/BackgroundCatalog.tsx`, `sidebar/sections/assets/ElementThumb.tsx`, `sidebar/sections/assets/StickerCatalog.tsx`, `sidebar/sections/assets/useElementCatalog.tsx`, `sidebar/sections/assets/useRecentElements.ts`, `sidebar/sections/assets/useStockPhotos.ts`, `sidebar/sections/StudioGallery.tsx`, `sidebar/sections/tools/AltTextTool.tsx`, `stores/createCanvasEditorStore.ts`, `utils/canvasAssets.ts`, `utils/canvasImageSource.ts`, `utils/mediaPlacement.ts`, `utils/textUtils.ts`.

`@gruenerator/ui` liegt nur in faulen Chunks (Sidebar-Abschnitte, `Lightbox`, `ToolbarStateBridge`), `@gruenerator/collab` kommt eager über `GenericCanvas` → `collab/useSelectionAwareness.ts` (`useAwarenessState`).

Dass der Editor selbst mit 296 Modulen dasteht, obwohl die Seite nur einen `StandaloneCanvas` zeigt, liegt am Einstieg: `src/index.ts` reicht `sidebar`, `composer`, `layouts` und die eingebauten Vorlagen durch, und deren Configs (Dreizeilen, Slider, Veranstaltung …) liegen als faule Chunks im Bundle, weil die Vorlagen-Registry sie dynamisch importiert.

## Eine Falle beim Bauen einer eigenen Vorlage

Die Bühne nimmt die Größe ihres Formats an (ohne `formatId` das Standardformat 1080 × 1350) und skaliert den Bezugsraum der Vorlage (`config.canvas`) **je Achse** darauf (`CanvasStage`, `scaleX`/`scaleY`). Eine Vorlage mit 1080 × 1080 auf dem Standardformat wird also senkrecht gestreckt, ohne Warnung. Die Demo-Vorlage nimmt deshalb 1080 × 1350.
