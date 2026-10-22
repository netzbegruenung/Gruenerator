# PPTX-Export: Handprüfung

Der Export (`writePptx.ts`) wird in Node getestet (`writePptx.vitest.ts`): Folienzahl, Texte und Laufattribute, Notizen, Bildzahl, Reihenfolge. Ob eine Datei in einem Programm richtig aussieht, sagt dieser Test nicht. Diese Prüfung macht man von Hand, nach jeder Änderung an `writePptx.ts`, `writeText.ts` oder `buildPptxModel.ts`.

## Prüf-Deck erzeugen

```bash
cd packages/canvas-editor
PPTX_FIXTURE_DIR=/tmp/pptx pnpm exec vitest run src/export/pptx/presentationFixtureDeck.vitest.ts
```

Das erzeugt `praesentation-de-DE.pptx` und `praesentation-de-AT.pptx`. Ohne `PPTX_FIXTURE_DIR` landen die Dateien in `$TMPDIR/gruenerator-pptx-fixture/`. Jedes Deck hat vier Folien mit allen Elementarten (`presentationFixtureDeck.ts`). Raster und Bilder sind dabei beschriftete Platzhalter, weil es in Node kein Stage gibt. Ob Raster vom echten Canvas richtig ankommen, prüft man im Editor: eine Präsentation anlegen, dann „Teilen“ → Format „PowerPoint (.pptx)“.

## Programme

| Programm           | Öffnen                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PowerPoint (macOS) | Datei öffnen. Ohne Dialog als PDF speichern: `osascript -e 'tell application "Microsoft PowerPoint" to open POSIX file "/tmp/pptx/praesentation-de-DE.pptx"' -e 'tell application "Microsoft PowerPoint" to save active presentation in POSIX file "/tmp/pptx/de.pdf" as save as PDF'` |
| QuickLook          | `qlmanage -t -s 1920 datei.pptx -o <ordner>` zeigt nur die erste Folie. Für Folie n schreibt man ein Deck, das nur diese Folie enthält.                                                                                                                                                |
| Keynote            | Datei öffnen                                                                                                                                                                                                                                                                           |
| Google Slides      | In Drive hochladen, dann „Mit Google Präsentationen öffnen“                                                                                                                                                                                                                            |
| LibreOffice        | wird nicht geprüft (Ruling R4)                                                                                                                                                                                                                                                         |

## Checkliste je Elementart

Je Programm prüfen: Ist das Element bearbeitbar? Stimmt die Lage? Stimmt die Schrift? Stimmt die Reihenfolge der Ebenen? Sind die Notizen da?

| Elementart                                                           | Erwartung                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hintergrundfarbe                                                     | Folienhintergrund. Im Fotomodus gibt es keine Füllung.                                                                                                                                                                                                                |
| Hintergrundfoto (unbearbeitet)                                       | Bild über die ganze Folie, mittig zugeschnitten (cover), ganz hinten                                                                                                                                                                                                  |
| Text                                                                 | Textfeld, bearbeitbar. Läufe behalten fett, kursiv und unterstrichen. Akzent bekommt eigene Farbe und Schrift, Marker eine Texthervorhebung. Aufzählung und Nummerierung behalten die Startnummer. Fester Zeilenabstand, gedreht wie auf dem Canvas, Schatten bleibt. |
| Form: Rechteck, abgerundetes Rechteck, Kreis/Ellipse, Dreieck, Stern | native Form mit Füllfarbe, Transparenz und Drehung                                                                                                                                                                                                                    |
| andere Formen (Pfeile, Linien, Wolken …)                             | Bild                                                                                                                                                                                                                                                                  |
| Pille, Kreis-Badge                                                   | Form mit eigenem Textfeld darüber, beide bearbeitbar                                                                                                                                                                                                                  |
| Foto (unbearbeitet)                                                  | Bild, gedehnt oder zugeschnitten, rund bei Kreismaske                                                                                                                                                                                                                 |
| Foto mit Filter, Zuschnitt oder Schatten                             | Bild (gerastert)                                                                                                                                                                                                                                                      |
| Diagramm                                                             | natives Diagramm mit Daten in eingebetteter Tabelle. Ist es gedreht oder durchscheinend, wird es ein Bild.                                                                                                                                                            |
| Icon, Illustration, Asset, Rahmen, Balken                            | Bild                                                                                                                                                                                                                                                                  |
| Sprechernotizen                                                      | Notizen der jeweiligen Folie                                                                                                                                                                                                                                          |

## Ergebnisse

### 22.10.2026: Prüf-Deck DE und AT, PowerPoint für Mac (PDF-Export per AppleScript) und QuickLook

**PowerPoint (macOS)**

- Die Datei öffnet ohne Reparatur-Dialog. Der Export lief per AppleScript ohne Rückfrage durch.
  - Davor ist ein Fehler behoben worden: pptxgenjs 4.0.1 schreibt für jeden Lauf ein `<a:pPr>` in den Absatz, und das ist schemawidrig. `dropRepeatedParagraphProps` behält nur das erste.
- Texte:
  - Lage, Größe und Farben stimmen.
  - fett, kursiv, Akzentfarbe und Marker-Hervorhebung (gelbgrüner Kasten) werden angezeigt.
  - Aufzählungszeichen und „4.“ als Startnummer stimmen.
  - Der weiche Zeilenumbruch bleibt im Absatz.
- Gedrehter Text (−6°) ist gedreht, der Schatten wird angezeigt.
- Pille: abgerundetes Rechteck mit zentriertem Text.
- Kreis-Badge: Ellipse, beide Zeilen gedreht (−8°).
- Formen:
  - Rechteck, Kreis, Dreieck und Stern sind nativ.
  - Das abgerundete Rechteck ist um 12° gedreht, der Eckenradius stimmt.
- Diagramm:
  - natives Säulendiagramm mit Titel, einer Farbe je Säule, Werten mit „ %“ und Gitterlinien.
- Bilder und Raster sitzen in ihren Boxen. Die Reihenfolge der Ebenen entspricht dem Modell.
- Schriften: GrueneType Neue und Gotham Narrow sind auf dem Prüfrechner nicht installiert. PowerPoint ersetzt sie durch eine serifenlose Schrift. Genau deshalb steht der Schrift-Hinweis im Download-Menü.
- Notizen: im XML vorhanden (`notesSlide1.xml`, Test). In der PowerPoint-Notizansicht wurden sie nicht angesehen.

**QuickLook**

- Fehlt im Bild:
  - Diagramme
  - Texthervorhebung (Marker)
  - Drehung von Textfeldern
- Aufzählungszeichen sind schwarz und stehen links außerhalb der Box.
- Fehlende Schriften ersetzt QuickLook durch Times.
- QuickLook taugt nur zum schnellen Blick auf Lage und Farben, nicht als Maßstab.

**Nicht geprüft:** Keynote, Google Slides, und ein Export aus dem laufenden Editor mit echten Rastern (Dev-Stack).
