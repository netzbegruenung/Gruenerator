# Grundlagen Grüne Jugend Österreich

Das Sharepic ist von der Grünen Jugend Österreich, der Jugendorganisation – nicht von den Grünen. Ihr Design ist kantig und plakativ, ganz anders als das der Partei.

- Farben: `waldgruen` (Hauptfarbe, sehr dunkles Grün), `maigruen` (sattes Hellgrün), `creme` (für Termine, Reihen und Textseiten), `veilchen` (Violett, für Erklär-Slides), `gelb` (Akzent und Störer, selten als Fläche). Alles **flach**, ohne Verlauf.
- Schrift: eine sehr breite, schwere Grotesk. **Headlines, Dachzeilen und Aufrufe stehen in Versalien** – das Programm setzt sie groß, schreib sie normal. Wegen der breiten Schrift: kurze Zeilen, 1–2 Wörter pro Headline-Zeile, lange Wörter mit Bindestrich trennen („Grund-“, „recht“).
- Akzent: einzelne Wörter `==Wort==` werden auf dunklem Grund gelb. Eine Stelle pro Slide.
- **Keine Zeilenbalken und keine `++…++`-Marker** – die gehören zur deutschen GJ.
- Haarlinien: Auf `waldgruen` und `veilchen` rahmen dünne hellgrüne Linien die Slide, und `absatz` steht hellgrün. Das setzt das Programm. Lange Absätze mit `**fett**` für die Kernsätze sind ausdrücklich erwünscht.
- Datum und Ort: `datum` steht als gelbes Etikett oben rechts, `ort` auf einer hellgrünen Fußleiste. Schreib `ort` kurz („Linz · Jugendgästehaus“).
- Störer: eine gelbe, schräge Ellipse mit kurzem Text („Bock auf Feminismus?“, „Komm mit!“).
- Karten (Liste, Termine, Diagramm) stehen weiß mit schwarzem Rand und hartem Schatten – das setzt das Programm.
- Kein Logo: setze `"logo": false`.
- Sprache: österreichisch, direkt, Du-Ansprache („heuer“, „leistbar“, „Gemeinderat“).
- Format: 4:5 (Standard, nicht ändern).
- Häufigste Aufbauten:
  - These: `waldgruen` + Headline in 3–5 kurzen Zeilen oben links.
  - Erklär-Karussell: These auf `waldgruen`, Erklärung als `absatz` mit einem gelben Wort auf `veilchen` oder `waldgruen`, Schluss als `aufruf` (`ausruf`).
  - Event: `waldgruen`, Dachzeile (Format · Ort) + Headline + kurzer `text`, `datum` und `ort`; Programm als `liste` auf einer zweiten Slide.
  - Termine: `creme`, Dachzeile „Termine 2026“, Headline = Monat, `termine` (jedes Datum auf einem Etikett, mehrere Orte als `ort` mit „·“), optional Störer.
  - Programm: `waldgruen`, Headline „Das Programm“, `termine` mit der Kategorie als `datum` („Campaigning“, „Feminismus“), Titel und Untertitel – jede Zeile steht als Karte.
  - Zitat: `waldgruen`, Dachzeile (Anlass mit Doppelpunkt) + `zitat` – es steht in Versalien in einer hellgrünen Sprechblase –, dazu die Person als `bild` mit `ausschnitt` `freigestellt`.
  - Reihe: `creme`, Dachzeile (Reihentitel), Headline = Monat mit `groesse` `gross`, `text` = Thema, Störer; je Termin eine Slide.
  - Vorstellung: `steckbrief` auf einem Foto, kurze Merkmale (2–3 Wörter).
  - Foto-Serie: Fotos mit Headline oder `absatz` unten, ein Satz läuft mit „…“ über die Slides, Schluss auf `maigruen`.
