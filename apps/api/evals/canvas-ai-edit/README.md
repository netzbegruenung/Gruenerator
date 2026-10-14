# Canvas-KI-Edit-Eval (live)

Misst die KI-Bearbeitung eines Sharepics im Canvas-Editor (`/studio/canvas/:id`, Chat-Tab, `CanvasInlineChatSection`) gegen den laufenden Dev-Stack. Echte Modellaufrufe, kostet Geld: jede Anweisung läuft einmal.

## Voraussetzungen

- API (z. B. :3011, Log-Pfad in `API_LOG` im Skript anpassen), Web mit Dev-Auth-Bypass (:3012), Hocuspocus, Postgres/Redis/Qdrant.
- Playwright (Pfad oben im Skript) und ein headless Chromium.
- Das Skript `canvas-edit-eval.cjs` liegt bewusst nicht im Repo (Maschinenwerkzeug mit lokalen Pfaden). Es folgt dem Playwright-Muster der Sharepic-Galerie-Skripte: Creator-Flow unter `/bild-editor` → „Im Editor öffnen“ → Chat-Tab → Anweisung → Banner abwarten → Screenshots vorher/nachher.
- Für die Baseline war der Chat-Tab noch ausgeblendet (1675a8ed33) und wurde per Playwright-Route eingeblendet; seit dem Spec-Pfad-PR ist er wieder sichtbar.

## Aufruf

```bash
BASE_URL=http://localhost:3012 OUT_DIR=/pfad/zum/out node canvas-edit-eval.cjs          # alle Briefs
node canvas-edit-eval.cjs b1                  # ein Brief
node canvas-edit-eval.cjs b1:e1,e2            # einzelne Edits
CREATE_ONLY=1 node canvas-edit-eval.cjs b2    # nur Entwurf erzeugen
MANUAL_Y=0.22 node canvas-edit-eval.cjs b1:e10
```

Wiederaufnahme: `OUT_DIR/state.json` merkt sich Canvas-URLs und fertige Edits; fertige werden übersprungen.

## Was gemessen wird (`corpus.json`, Ergebnis in `results-<ts>.json`)

Pro Edit: Sekunden bis Behalten-Banner / Antwort / Fehler, Anzahl Ops (aus dem API-Log `emitted N canvas op(s)`), Banner ja/nein, Fehlertext, Screenshots vorher/nachher, bei `manual` ob Handposition/-text überlebt. Das Urteil pass/fail wird von Hand anhand der Bilder gefällt (pass = Anweisung sichtbar umgesetzt, nichts kaputt).
Hinweise: Bei Antworten ohne Banner enthält `seconds` feste Wartezeiten (~6,5 s). Der Nachher-Screenshot entsteht beim Erscheinen des Banners, die Chat-Antwort streamt dann noch.
