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

Dazu kommt eine Kopie außerhalb von CSS: `CANVAS_MENUBAR_GRADIENT` in `apps/mobile/services/webview/hostChrome.ts` spiegelt `--editor-menubar-gradient` für die native Kopfzeile um die WebView. `hostChrome.vitest.ts` bewacht diese Kopie.

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
- Antippen wählt nur aus, es öffnet **kein** Sheet — die Fläche behält ihre Größe (Canva-Muster). Die Bereichs-Leiste weicht dann der Auswahl-Leiste (`MobileSelectionBar`, selber Slot, selbe Höhe) mit der Formatierung, „Mehr" und ✓; über dem Objekt steht die Pille (`MobileSelectionPill`) mit Duplizieren, Löschen und „…", die beim Ziehen und Transformieren verschwindet. Den Bereich der Auswahl (`mobileSelectionArea.ts`) öffnet erst „Mehr"/„…"; oben im Sheet steht dann der Auswahl-Block (`MobileSelectionControls`). Schließen des Sheets hebt die Auswahl nicht auf.
- Löschen läuft für Taste und Pille über `utils/removeElement.ts` — wer eine Elementart ergänzt, trägt sie dort ein.

## Prüfen

Aus dem Paketverzeichnis:

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

ESLint läuft über die Wurzel-Config (`WEB_FILES`, also mit jsx-a11y) und typbewusst. Aus dem **Repo-Root** und in Häppchen von höchstens ~20 Dateien, sonst droht OOM: `npx eslint packages/canvas-editor/src/<datei>`. `pnpm --filter @gruenerator/canvas-editor lint` fährt das ganze Paket (~345 Dateien) und gehört deshalb in die CI, nicht in die laufende Arbeit. Warnungen (vor allem `import-x/order` und `react-hooks/refs`) sind Bestand; Fehler brechen den Lauf.

Das Paket exportiert seine Oberfläche über `src/index.ts`, `apps/web` liest sie im Quelltext. Wer dort etwas entfernt oder umbenennt, prüft auch `pnpm --filter @gruenerator/web exec tsc --noEmit`.
