# ggraphic demo

Eine neutrale Seite, die den Editor so einbindet, wie es ein fremder Host täte, und ein Messinstrument dafür, wie viel Grünerator dabei noch mitkommt.

**Was die Seite zeigt:** einen `ConfigCanvas` mit einer eigenen, kleinen Vorlage (`src/demoTemplate.ts`): eine Fläche in `brandDefault.defaultBackground`, eine Überschrift in `brandDefault.colors.textOnDark` und `brandDefault.fonts.headline` (Raleway, mit Arial als Rückfall, weil der Pack noch keine Schriftdateien mitbringt). Die Vorlage geht als Config-Objekt hinein, nicht als registrierte Id; `ConfigCanvas` fasst die Vorlagen-Registry nicht an, deshalb kommen die eingebauten Vorlagen nicht mit. Es gibt keinen `CanvasEditorProvider`, die Seite läuft also auf den eingebauten Rückfällen der Host-Dienste.

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

## Stand: 27.10.2026, Basis #5029 plus Schema-Importe

1084 Module im Bundle, 551 davon eager. **397 Module stammen aus vier `@gruenerator/*`-Paketen:**

| Paket                        | Module | davon eager |   Code | Editor-Dateien, die es importieren | erster Pfad über                        |
| ---------------------------- | -----: | ----------: | -----: | ---------------------------------: | --------------------------------------- |
| `@gruenerator/contracts`     |    227 |         227 | 499 KB |                                  3 | `utils/canvasAssets.ts`                 |
| `@gruenerator/canvas-editor` |    167 |         152 | 926 KB |                                  – | `index.ts` → `CanvasEditorProvider.tsx` |
| `@gruenerator/collab`        |      2 |           2 |   2 KB |                                  1 | `collab/useSelectionAwareness.ts`       |
| `@gruenerator/core`          |      1 |           1 |   1 KB |           0 (nur über `contracts`) | `contracts/src/schemas/userProfile.ts`  |

Dazu kommen `@ggraphic/schema` (5 Module) und `@ggraphic/core` (1). Vorher (mit `StandaloneCanvas`, Basis #5026) waren es 1307 Module, davon 535 aus fünf Paketen: der Editor stand mit 296 da, weil `StandaloneCanvas` die Vorlagen-Registry importiert und deren Configs als faule Chunks mitkamen, und `@gruenerator/ui` (6) kam nur über diese Chunks.

**`@gruenerator/contracts` ist der größte Brocken, und er hängt fast vollständig am Barrel.** Drei Editor-Dateien importieren noch aus `@gruenerator/contracts`, also aus `src/index.ts`, und mit ihm kommen die Schemas und die ts-rest-Verträge, fast alle eager. Was sie brauchen, sind vier Helfer für Share-Adressen und drei für den Sticker- und Emoji-Katalog; die Text-Helfer und `parseDataUrl` kommen inzwischen aus `@ggraphic/schema`, die Standardgröße der Bühne aus dem Standardformat. Solange eine einzige dieser Dateien bleibt, kommt das ganze Barrel mit; die Zahl fällt erst, wenn alle drei weg sind. Das Paket erklärt keine `sideEffects`, und Rolldown behält deshalb jede Modul-Top-Level-Anweisung (`z.object(…)`, `initContract().router(…)`). Ob `"sideEffects": false` für die anderen Verbraucher sicher ist, ist ungeprüft (#5027).

Die Editor-Dateien, die `contracts` importieren: `utils/canvasAssets.ts`, `utils/canvasImageSource.ts`, `utils/mediaPlacement.ts`.

`@gruenerator/collab` kommt eager über `GenericCanvas` → `collab/useSelectionAwareness.ts` (`useAwarenessState`).

## Format und Größe einer eigenen Vorlage

Die Bühne nimmt die Größe ihres Formats an und skaliert den Bezugsraum der Vorlage (`config.canvas`) **je Achse** darauf (`CanvasStage`, `scaleX`/`scaleY`). Ohne `formatId` wählt `ConfigCanvas` deshalb das digitale Format, das genau so groß ist wie die Vorlage (`formatIdForSize`); eine Vorlage mit 1080 × 1080 landet so auf dem quadratischen Format statt gestreckt auf 4:5. Gibt es kein Format dieser Größe, bleibt es beim Standardformat 1080 × 1350, und die Vorlage wird gestreckt. Eine übergebene `formatId` gewinnt immer.
