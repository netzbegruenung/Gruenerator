# CLAUDE-chat.md — Composer-Steuerelemente in `packages/chat`

Was im Chat-Composer auswählbar ist (Modi, Werkzeuge, Recherchetiefe, Modelle), steht **einmal** als Registry in `packages/chat`. Web und Mobile rendern ihre eigene Oberfläche, aber **aus diesen Listen**: Menge, Beschriftung und Icon-Bedeutung kommen aus der Registry, nicht aus der App. Wer eine Option hinzufügt, umbenennt oder entfernt, tut das in der Registry — beide Plattformen folgen.

## Die Registries

| Registry | Datei | Inhalt |
|---|---|---|
| `COMPOSER_MODES` + `COMPOSER_MODES_TITLE` | `packages/chat/src/lib/composerControls.ts` | Thread-Modi (`chat` = „Ohne Rolle“, `eigener` = „Eigener Chat“) und die Überschrift „Rollen“. `notebook` ist als Auswahl auskommentiert, der Transportweg bleibt (Kommentar dort). |
| `COMPOSER_TOOLS` | dieselbe Datei | Schaltergruppe im Plusmenü. Union aus `toggle` (bleibt über Turns gesetzt, mit Haken) und `once` (fügt eine @mention ein, gilt nur für diese Nachricht). |
| `SEARCH_DEPTHS` + `showsSearchDepth()` | dieselbe Datei | Recherchetiefe. Die Regel, *ob* sie erscheint (`routeTo === 'search'` des Agenten), steht ebenfalls hier, damit Web und Mobile sie nicht verschieden beantworten. |
| `NOTEBOOK_DEPTHS` | `packages/chat/src/lib/notebookDepth.ts` | Notebook-Tiefe (Klein/Mittel/Ultra). Eigenes Blattmodul, weil `chatStore` den Startwert liest. |
| `NOTEBOOK_COMPOSER_MODES` | `packages/chat/src/lib/notebookAnswerMode.ts` | Antwortmodi der Notebook-Fläche plus der reine Client-Modus `manuell`. |
| `MODEL_OPTIONS` + `visibleComposerModels()` | `packages/chat/src/stores/chatStore.ts` → `TEXT_MODELS` aus `packages/core/src/models/catalog.ts`; die Regel in `composerControls.ts` | Modellauswahl. `visibleComposerModels(enabledModelIds)` nimmt die gespeicherte Auswahl der Person (`modelPreferences`-Contract) und fällt, solange sie fehlt, auf `isModelEnabledByDefault` zurück. `enabledModelIdsFromPreferences` macht aus der Antwort das Set. |

## Icons: semantische Schlüssel, Abbildung pro Plattform

Die Registries importieren keine Icon-Bibliothek. Sie tragen Schlüssel (`ComposerIconKey`, `ComposerToolIconKey`, `SearchDepthIconKey`, `NotebookDepthIconKey`), und jede Plattform bildet sie ab:

- **Web:** `MODE_ICONS` / `TOOL_ICONS` in `packages/chat/src/components/thread/PlusMenu.tsx` (lucide), `DEPTH_ICONS` in `components/SearchDepthToggle.tsx` und `components/notebook/NotebookSettingsPopover.tsx`.
- **Mobile:** `MODE_ICONS` / `TOOL_ICONS` / `DEPTH_ICONS` in `apps/mobile/components/chat/ComposerActionSheet.tsx` (Ionicons).

Die Abbildungen sind als `Record<…IconKey, …>` typisiert. Ein neuer Schlüssel bricht deshalb den Typecheck beider Plattformen, bis beide ihn abbilden — so ist es gewollt.

## Wer was rendert

| Registry | Web | Mobile |
|---|---|---|
| `COMPOSER_MODES` | `PlusMenu.tsx` (listet unter `eigener` zusätzlich die einzelnen Rollen) | `ComposerActionSheet.tsx` |
| `COMPOSER_TOOLS` | `PlusMenu.tsx` | `ComposerActionSheet.tsx` |
| `SEARCH_DEPTHS` / `showsSearchDepth` | `SearchDepthToggle.tsx` über `GrueneratorComposer.tsx` | `ComposerActionSheet.tsx` |
| `NOTEBOOK_DEPTHS` | `components/notebook/NotebookSettingsPopover.tsx` | `apps/mobile/components/notebook/NotebookResearchPanel.tsx` |
| `NOTEBOOK_COMPOSER_MODES` | `components/notebook/NotebookComposer.tsx` | — |
| `MODEL_OPTIONS` | `components/thread/ModelPicker.tsx` (Präferenzen über `ModelPreferencesContext`) | `ComposerActionSheet.tsx` (Präferenzen über `apps/mobile/hooks/useEnabledModelIds.ts`, nur lesend) |

## Regeln

- **Nie eine Modus-, Werkzeug-, Tiefen- oder Modellliste in einer App hart codieren.** Die App wählt höchstens eine Teilmenge (Mobile blendet `eigener` ohne eigenen Prompt aus) und bildet die Icons ab.
- **`ComposerToolDef` nicht am Aufrufort destrukturieren** — sonst verengt `kind` die Zweige nicht mehr (Typregel 2 in der Wurzel-`CLAUDE.md`).
- **Zwei Barrels:** `packages/chat/src/index.ts` und `index.native.ts` (Bedingung `react-native`). Ein neuer Export gehört in beide; `src/barrelParity.vitest.ts` bewacht das.
- Tests der Registries: `src/lib/composerControls.vitest.ts`, `src/lib/notebookDepth.vitest.ts`. Sie prüfen, dass jede Zeile etwas ist, worauf ein Renderer handeln kann (z. B. dass jede `once`-Mention auflösbar ist).
- **Diese Datei liegt unter `/docs/` und heißt `CLAUDE-*.md` — beides ist gitignored.** Änderungen brauchen `git add -f`.
