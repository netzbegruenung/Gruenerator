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

## Stand: 27.10.2026, Basis #5031 plus Asset-Katalog als Host-Daten

855 Module im Bundle, 322 davon eager. **170 Module stammen aus zwei `@gruenerator/*`-Paketen:**

| Paket                        | Module | davon eager |   Code | Editor-Dateien, die es importieren | erster Pfad über                        |
| ---------------------------- | -----: | ----------: | -----: | ---------------------------------: | --------------------------------------- |
| `@gruenerator/canvas-editor` |    168 |         153 | 923 KB |                                  – | `index.ts` → `CanvasEditorProvider.tsx` |
| `@gruenerator/collab`        |      2 |           2 |   2 KB |                                  1 | `collab/useSelectionAwareness.ts`       |

Dazu kommen `@ggraphic/schema` (5 Module) und `@ggraphic/core` (1). Vorher (Basis #5031) waren es 1083 Module, davon 396 aus vier Paketen: `@gruenerator/contracts` stand mit 225 da, alle eager, und `@gruenerator/core` (1) kam nur über `contracts`. Noch davor (mit `StandaloneCanvas`, Basis #5026) waren es 1307 Module aus fünf Paketen.

**`@gruenerator/contracts` ist weg.** Die letzte Editor-Datei, die zur Laufzeit aus dem Barrel importierte, war `utils/canvasAssets.ts`. Kuratierte Emoji, die Sticker (`SYSTEM_STICKERS`) und die Regel, welche `src` eine Instanz selbst tragen darf (`isShareSrc`), stehen jetzt in `brand/grueneAssetCatalog.ts`, und der Kern fragt nur noch das Register, das der Host füllt (`registerAssetCatalog`, eingetragen in `apps/web/src/index.tsx`). Ein Register auf Modulebene statt eines Felds in `CanvasEditorServices`, weil die Abfragen auch in Befehlen, Aktions-Fabriken und Offscreen-Wurzeln laufen, die keinen React-Kontext haben. Ohne Host, wie hier, kennt der Editor keine Katalog-Grafik, zeichnet ein Emoji allein aus seiner Id und ignoriert jede `src` einer Instanz. Die Text-Helfer und `parseDataUrl` kommen aus `@ggraphic/schema`, die Share-Adressen über `CanvasEditorServices.imageUrls`. Das Paket erklärt weiterhin keine `sideEffects`; ein einziger Laufzeit-Import aus dem Barrel brächte die 225 Module zurück (#5027).

**Was vom Grünerator im Editor-Teil noch mitkommt:** `brand/grueneAssets.ts` (Logos, Sonnenblumen, Info-Hintergründe), weil `SYSTEM_ASSETS` in `utils/canvasAssets.ts` darauf zeigt und `brand/theme.ts` sowie die Layouts es lesen.

`@gruenerator/collab` kommt eager über `GenericCanvas` → `collab/useSelectionAwareness.ts` (`useAwarenessState`).

## Format und Größe einer eigenen Vorlage

Die Bühne nimmt die Größe ihres Formats an und skaliert den Bezugsraum der Vorlage (`config.canvas`) **je Achse** darauf (`CanvasStage`, `scaleX`/`scaleY`). Ohne `formatId` wählt `ConfigCanvas` deshalb das digitale Format, das genau so groß ist wie die Vorlage (`formatIdForSize`); eine Vorlage mit 1080 × 1080 landet so auf dem quadratischen Format statt gestreckt auf 4:5. Gibt es kein Format dieser Größe, bleibt es beim Standardformat 1080 × 1350, und die Vorlage wird gestreckt. Eine übergebene `formatId` gewinnt immer.
