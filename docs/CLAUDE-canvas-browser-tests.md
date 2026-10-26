# Canvas-Editor im Browser testen: über den Barrierefreiheitsbaum

Für Playwright-Tests und Browser-Agenten. Grundsatz: **den Editor so bedienen wie ein Mensch mit Tastatur und Screenreader — über Rollen, Namen und die Live-Region, nicht über Konva-Interna oder Pixel.** Seit der Barrierefreiheits-Arbeit vom 26.10.2026 hat jedes Element der Fläche einen Zwilling im Bedienbaum; das ist stabiler als jede Koordinate. Das Beispiel zum Abschreiben steht in `apps/web/tests/e2e/a11y.spec.ts` (`Barrierefreiheit: Canvas-Editor`). Messfallen allgemein: `docs/CLAUDE-a11y.md`.

Alle Selektoren unten sind am 26.10.2026 gegen den laufenden Editor ausgeführt worden (Playwright-Skript und die Spec).

## Editor ohne Backend starten

`/mobile-editor` baut den Editor aus einer `postMessage`, braucht also weder API noch Login-Server.

```bash
cd apps/web
VITE_E2E_AUTH_BYPASS=true VITE_DEV_PORT=3072 npx vite --port 3072 --strictPort
```

Ein eigener Port, weil 3000 oft belegt ist; `VITE_DEV_PORT` muss zum Port passen, sonst antwortet die Entwicklungs-API mit CORS 403. Beenden nur über die PID (`kill <pid>`), nie mit breitem `pkill` — es trifft fremde Dev-Server.

Dann im Test:

1. **`/api/*` per Prädikat beantworten**, nie per Glob: `page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }))`. Der Glob `**/api/**` trifft auch Vite-Module unter `/src/api/…` und tötet den Bundle.
2. **Einwilligungen vorsetzen** per Init-Skript: `localStorage.termsAccepted = 'true'`, `localStorage.analyticsConsent = 'false'`. Sonst liegt ein Dialog über dem Editor.
3. `page.goto('/mobile-editor', { waitUntil: 'networkidle' })`.
4. **`INIT_DATA` wiederholt senden**, bis die Seite steht. Die Nachricht kann vor dem Zuhörer eintreffen:
   ```js
   window.postMessage(JSON.stringify({ type: 'INIT_DATA', payload: { type: 'dreizeilen',
     formData: { line1: 'Klimaschutz', line2: 'jetzt', line3: 'handeln' }, modifications: null } }), '*');
   ```
   Alle 1,5 s wiederholen.
5. **Auf die Seiten-Gruppe warten, nicht auf ein `<canvas>`:** `page.getByRole('group', { name: 'Seite 1' })`. Ein Lade-Canvas steht schon da, solange „Lade Editor…" noch läuft; wer darauf wartet, bedient oder misst den Platzhalter. Zusätzlich: `getByText('Lade Editor')` hat Anzahl 0.

Die Breite entscheidet vor dem Laden über das Layout: unter 900 px gilt die mobile Variante (`useIsCanvasMobile`), `page.setViewportSize` also vor `goto`.

## Selektoren

| Was | Selektor | Anmerkung |
| --- | --- | --- |
| Sprunglink | `getByRole('button', { name: 'Zu den Ebenen' })` | Ein `button`, kein `link`; erst bei Fokus sichtbar. Per Tab erreichbar (nach Chatliste und „Feedback"). Enter öffnet den Ebenen-Bereich und fokussiert den ersten Eintrag. |
| Bereichsleiste | `getByRole('navigation', { name: 'Editor-Bereiche' })` | Knöpfe: „Text hinzufügen", „Elemente hinzufügen", „Ebenen: alle Elemente der Seite" u. a. |
| Ebenen-Liste | `getByRole('listbox', { name: 'Ebenen' })` | Erscheint erst, wenn der Bereich offen ist (Sprunglink oder Tab-Knopf). |
| Ebene | `getByRole('option', { name: /^Text: Neue Überschrift/ })` | Namen: `Text: <Inhalt>`, `Balken: <Zeile 1> / <Zeile 2> / <Zeile 3>`, `Sonnenblume`, `Hintergrund`. Oben steht das vorderste Element. `aria-selected` zeigt die Auswahl. |
| Seite | `getByRole('group', { name: 'Seite 1' })` | |
| Seiten-Knopf | `[data-page-focus-target]`, Name „Seite 1 bearbeiten" | Nur für Tastaturnutzer sichtbar (Fokus lässt ihn erscheinen); mit `.focus()` ansteuern, nicht klicken. Hierhin kehrt der Fokus zurück, wenn kein Ebenen-Eintrag da ist. |
| Bühne als Inhaltsprüfung | `getByRole('img', { name: /^Seite 1:/ })` | `aria-label` ist die Kurzfassung der Seite: `Seite 1: Text: Neue Überschrift, Balken: …, Sonnenblume, Hintergrund`. Prüfe damit, **dass** ein Element da ist oder fehlt. |
| Text-Editor | `getByRole('textbox', { name: 'Text bearbeiten' })` | Ist beim Öffnen fokussiert. Auch Störer und Badge. |
| Balken-Zeile | `getByRole('textbox', { name: 'Zeile 1 bearbeiten' })` | Je Zeile ein Feld; immer nur eins offen. Ist beim Öffnen fokussiert. |
| Ansagen | `locator('[role="status"][aria-live="polite"]')` | Eine Live-Region für Aktionen. Gesehen: `Gelöscht: Text: …`, `Rückgängig gemacht`, `Auswahl aufgehoben`. Der Text erscheint rund 50 ms nach der Aktion; mit `expect(...).toHaveCount` / `toHaveText` warten, nicht mit fester Pause. |

Die Vorlage „dreizeilen" hat **keinen** Text-Eintrag, nur einen Balken. Enter/F2 öffnet dessen Zeilen (siehe Tasten); Entf löscht ihn nicht, sondern sagt `Gehört zur Vorlage und lässt sich nicht löschen: Balken: …` an. Für einen Text-Eintrag: `getByRole('button', { name: 'Text hinzufügen' })` und dann `getByRole('button', { name: 'Titel', exact: true })` – das legt „Text: Neue Überschrift" an. Dieser Aufbau darf mit der Maus geschehen; das Szenario danach läuft nur mit Tastatur.

## Tasten

| Aktion | Taste | Beobachtung |
| --- | --- | --- |
| Ebene wählen | Pfeil rauf/runter in der Liste | Pfeil wählt, Fokus wandert mit. Runter und wieder hoch zurück wählt den Ausgangseintrag. |
| Text bearbeiten | Enter oder F2 auf dem Eintrag | Fokus liegt danach im `textbox` „Text bearbeiten" (Balken: „Zeile 1 bearbeiten"). |
| Balken-Zeile wechseln | Tab / Umschalt+Tab im Zeilenfeld | Übernimmt die Zeile und öffnet die nächste bzw. vorige („Zeile 2 bearbeiten"); der Fokus geht direkt hinüber. Tab hinter der letzten (Umschalt+Tab vor der ersten) übernimmt und gibt den Fokus an den Eintrag zurück. |
| Text ersetzen | `ControlOrMeta+a`, dann tippen | `Control+a` allein wirkt auf macOS nicht. |
| Bearbeiten beenden | Escape | Übernimmt, Fokus geht an den Ebenen-Eintrag zurück (Name zeigt den neuen Text). |
| Löschen | Entf | Ansage `Gelöscht: …`, Fokus geht an den Nachbarn. Globales Kürzel, wirkt auch mit Fokus in der Liste. |
| Rückgängig | `ControlOrMeta+z` | Ansage `Rückgängig gemacht`. **Immer `ControlOrMeta`**, nie `Control+z`: Chromium unter macOS hört auf Meta, `Control+z` tat dort nichts. |
| Verschieben | `Alt+Pfeil` (1 px), `Alt+Umschalt+Pfeil` (10 px) | Aus der Ebenen-Liste ausgeführt und gemessen (Konva-`x()` 540 → 541, `y()` 0 → 10). Ohne Ansage. |

## Was weiter Konva braucht

Der Bedienbaum sagt, **was** da ist, nicht **wo** und wie groß. Für genaue Geometrie (Position nach einem Verschieben, Größe, Drehung) und für Pixelvergleiche gibt es `window.Konva.stages[0]` (Dev-Server). Beispiel: `window.Konva.stages[0].find('Text')[0].x()` lieferte nach `Alt+ArrowRight` 541 statt 540, nach `Alt+Shift+ArrowDown` y von 0 auf 10. Nur dafür benutzen. Stage-Größe ist die Anzeigegröße (400×500 im 1400×900-Fenster), nicht das Dokumentformat. Ob etwas **existiert, benannt, fokussierbar oder angesagt** ist, prüft man am Baum.

## Fallen

- **Der Worktree braucht ein eigenes `pnpm install`.** Das gemeinsame `node_modules` des Hauptcheckouts kann veraltet sein (siehe `pnpm deps:verify` in `CLAUDE.md`). Ein Editor, der „irgendwie" anders aussieht, ist oft ein fremder Install.
- **`chrome-devtools`-MCP:** Das Browserprofil kann eine andere Sitzung halten. Dann das Playwright-Modul des Worktrees aus einem Skript fahren (`node_modules/playwright/index.mjs`), nicht auf den MCP warten.
- **`react-scan`** hängt im Dev-Server ein Werkzeugfeld (`#react-scan-root`) ein, dessen Knopf axe als `button-name` meldet und das Klicks abfängt. Bei axe-Läufen `.exclude('#react-scan-root')`.
- **Auswahl-Ansage fehlt scheinbar:** `useSelectionAnnouncement` wartet 400 ms und schweigt, solange der Fokus in der Ebenen-Liste liegt (dort liest der Screenreader den Eintrag selbst). Ansagen für Aktionen (Löschen, Rückgängig) sind davon nicht betroffen.
- **Bedienen ohne Aufbau-Maus** geht nicht für das Anlegen eines Text-Eintrags in „dreizeilen" (siehe oben); die Balken-Zeilen und alles danach schon.
- Eigene Probeskripte gehören in den Scratchpad, nicht ins Repo.
