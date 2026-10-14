# Baseline: alter Canvas-KI-Edit-Pfad (07.10.2026)

Stand: Branch `feat/canvas-ai-edit-spec-path` (ungeändert), Pfad `op` (Agent `gruenerator-sharepic-editor`, Tool `edit_document`, `editor_operations`-Ops). Live gegen Dev-Stack, Modell laut API-Log Cortecs Gemma 4 31B (Planer/Synth), Ops-Planung `canvas_ai_suggest`.

## Ergebnis

- **Pass-Rate: 5 von 15 (33 %)**. Fehlschläge: 3x Modell lehnt ab (Schriftgröße/Position), 6x Layout/Inhalt kaputt (b1-e5, b1-e6, b2-e7, b3-e1, b3-e4, b3-e8), 1x ohne sichtbare Wirkung (b1-e9).
- **Median: 6,9 s** über alle 15 (7,3 s bei den 11 Edits mit Banner; Spanne 4,9–10,1 s). Ohne Banner enthalten die Zeiten feste Wartezeiten.
- Ops pro Edit: 0 (3x, alle Ablehnungen), 1 (10x), 2 (1x), 4 (1x).
- Aufbau: b1 (Einzelbild, "mit Foto"): der Entwurf enthielt **kein Foto** (mintfarbene Fläche mit 500). b2 (Zitat) ok. b3 (Karussell) beim ersten Versuch am Creator gescheitert (Entwurf-Validierung: "Grund 1" nennt Zahl nicht im Auftrag, 502); Brief auf "drei Folien: Gründe …" umformuliert (eine Wiederholung).

## Wichtige Befunde

1. **Chat-Tab ist im Editor ausgeblendet** (`CanvasEditor/index.tsx`: "too unreliable", Commit 1675a8ed33). Gemessen wurde per Route-Patch des Moduls.
2. Das Modell lehnt Schriftgröße und Position ab ("kann ... nicht direkt ändern") – obwohl der Editor das könnte; Capability-Lücke im Op-Vokabular/Prompt.
3. Antworten behaupten Erfolg, den das Bild nicht zeigt (e9 "Element wird verkleinert", e5 "Quellenangabe entfernt").
4. Fehlendes Foto wird nicht erkannt (e6 färbt die ganze Fläche dunkelgrün).
5. Multi-Folien: Edits treffen nur Folie 1 (e4), e8 legt keine erkennbare neue Folie an.
6. Nach Reload waren die per Behalten übernommenen KI-Änderungen (Sand/Dunkelgrün) nicht mehr im Canvas, die manuelle Verschiebung schon (ungeprüft, ob Autosave für Ops fehlt).

## Tabelle

| Brief | Edit | Anweisung                                                               | Sekunden | Ops | Banner | Fehler | Handedit überlebt               | Urteil                                                                                                                                         |
| ----- | ---- | ----------------------------------------------------------------------- | -------- | --- | ------ | ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| b1    | e1   | Mach die Headline kürzer und knackiger                                  | 6.8      | 1   | ja     | -      | -                               | **pass** – Headline gekürzt ("Mobilitätswende jetzt!"), nichts kaputt.                                                                         |
| b1    | e2   | Schrift der Headline größer                                             | 6.9      | 0   | nein   | -      | -                               | **fail** – Modell lehnt ab: "kann die Schriftgröße nicht direkt ändern"; 0 Ops.                                                                |
| b1    | e3   | Verschieb den Text nach oben                                            | 6.9      | 0   | nein   | -      | -                               | **fail** – Modell lehnt ab: "kann die Position nicht verschieben"; 0 Ops.                                                                      |
| b1    | e4   | Ändere die Hintergrundfarbe auf Sand                                    | 7.8      | 1   | ja     | -      | -                               | **pass** – Hintergrund wird Sand.                                                                                                              |
| b1    | e5   | Entferne die Quellenangabe                                              | 9.3      | 1   | ja     | -      | -                               | **fail** – Es gab keine Quellenangabe; entfernt wurde der KI-Hinweis-Text, ein leerer grauer Balken bleibt stehen.                             |
| b1    | e6   | Ersetze das Foto durch eine einfarbige Fläche                           | 7.8      | 1   | ja     | -      | -                               | **fail** – Entwurf hatte kein Foto; Ops färben die ganze Fläche Dunkelgrün, dunkler Text darauf unlesbar.                                      |
| b1    | e9   | Mach dieses Element kleiner                                             | 4.9      | 1   | ja     | -      | -                               | **fail** – Antwort behauptet "Element verkleinert", im Bild keine sichtbare Größenänderung (gewählt: "500").                                   |
| b1    | e10  | Mach die Headline kürzer                                                | 6.8      | 1   | ja     | -      | Position ja; Text nicht prüfbar | **pass** – Headline gekürzt ("Radwege!"); Handposition (+150px) blieb. Hand-Text konnte nicht gesetzt werden (Doppelklick-Tippen griff nicht). |
| b2    | e1   | Mach die Headline kürzer und knackiger                                  | 6.8      | 1   | ja     | -      | -                               | **pass** – "Klimaschutz = Gerechtigkeit" (Zitat dabei umgeschrieben).                                                                          |
| b2    | e4   | Ändere die Hintergrundfarbe auf Sand                                    | 5.2      | 1   | ja     | -      | -                               | **pass** – Hintergrund wird Sand.                                                                                                              |
| b2    | e7   | Ändere das Zitat zu 'Gerechtigkeit braucht Klimaschutz', Autorin bleibt | 5.7      | 1   | ja     | -      | -                               | **fail** – Neues Zitat ist dreizeilig und überlappt "Anna Beispiel".                                                                           |
| b3    | e1   | Mach die Headline kürzer und knackiger                                  | 10.1     | 2   | ja     | -      | -                               | **fail** – Folie 1: Headline abgeschnitten, grüner Akzentbalken leer.                                                                          |
| b3    | e2   | Schrift der Headline größer                                             | 6.9      | 0   | nein   | -      | -                               | **fail** – Modell lehnt ab: kann Schriftgröße nicht anpassen; 0 Ops.                                                                           |
| b3    | e4   | Ändere die Hintergrundfarbe auf Sand                                    | 8.4      | 1   | ja     | -      | -                               | **fail** – Foto der Folie 1 verschwindet (nicht verlangt), heller Text auf Sand kaum lesbar; nur Folie 1 betroffen.                            |
| b3    | e8   | Füge eine weitere Folie mit einem Fazit hinzu                           | 9.8      | 4   | ja     | -      | -                               | **fail** – Fazit-Text landet auf Folie 1 und überlappt/läuft aus dem Bild; keine neue Folie erkennbar.                                         |

e10 (Handedit): Nach Versuch 1 (Doppelklick traf die "500") und Versuch 2 (Headline, `MANUAL_Y=0.22`) blieb die Handverschiebung (+150 px) erhalten; der Hand-Text " (Hand)" ließ sich per Doppelklick+Tippen nicht setzen, daher nicht prüfbar. Versuch 1 liegt als `b1-e10-try1` in `/private/tmp/claude-501/-Users-moritzwachter-Gruenerator/2fc5c0de-91ed-465c-959f-ac09d6ef3515/scratchpad/canvas-eval-baseline/`.

Bilder: `baseline/<brief>-<edit>-before|after.jpg`, Rohdaten `baseline/results.json`.
