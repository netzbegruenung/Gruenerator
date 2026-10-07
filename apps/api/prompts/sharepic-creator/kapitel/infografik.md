# Infografik

Eine Infografik erklärt mit Bildern: jeder Punkt hat eine kleine, flache Illustration, darunter oder daneben einen fetten Titel und höchstens einen kurzen Satz. Die Illustrationen malt eine KI eigens dafür (aus `motiv`), Titel, Zahlen, Kreise und Linien setzt das Programm als bearbeitbare Ebenen.

## Aufbau einer Slide

- Oben eine kurze Headline (2–3 Zeilen), optional eine `dachzeile`. Dann ein einziges Element `{"type":"infografik","form",…,"punkte":[…]}`. Nichts weiter – kein Absatz, keine Liste, kein Diagramm daneben.
- Hintergrund: eine helle Markenfarbe (`hellgrau` oder `weiss` in Deutschland, `weiss` in Österreich), `position: "oben"` (bei `mengen`, `anteil` und `zahl`: `"mitte"`), `align: "zentriert"`, `logo: false`. Kein Foto, keine `szene`.
- Eine Quelle für Zahlen in `quelle`, wenn der Auftrag sie nennt.

## Welche form

- `raster` – 2–6 gleichrangige Punkte: Tipps, Gründe, Forderungen, Fakten. 4 Punkte stehen 2 × 2, 3 und 5–6 in Dreierreihen.
- `ablauf` – 3–5 Schritte in fester Reihenfolge: ein Weg, ein Kreislauf, „so funktioniert …“. Das Programm nummeriert und verbindet sie.
- `mengen` – 2–4 Mengen derselben Sache im Vergleich: Müll nach Branchen, Emissionen nach Sektoren, Kosten je Weg. Jeder Punkt hat `wert` (die Zahl aus dem Auftrag, ohne Einheit); das Programm macht die Illustration so groß, wie der Wert es verlangt, und stellt alle auf eine Linie. `titel` ist hier die Zahl mit Einheit („3,36 Mio. t“), `text` sagt, wofür sie steht („Bauwesen“). Gemalt wird das Gemessene, nicht der Verursacher: bei CO₂ je Verkehrsmittel eine CO₂-Wolke, bei Müll ein Müllsack, bei Kosten ein Geldstapel – das Verkehrsmittel oder die Branche steht im `text`. Alle Punkte tragen dasselbe `motiv`; das Programm malt es einmal, nur die Größe unterscheidet sie. Die Headline sagt, was gemessen wird („So viel CO₂ pro Person“), sonst stehen die Zahlen ohne Bedeutung da.

- `anteil` – 1–3 Anteile als Piktogrammreihe: „9 von 10“, „jedes fünfte Kind“, „37 %“. Jeder Punkt hat `wert` (der Teil) und `von` (das Ganze): „9 von 10“ → `wert: 9, von: 10`; „jedes fünfte“ → `wert: 1, von: 5`; Prozent → `von: 100` (zeichnet ein Raster aus 100). `von` ist 2–10 oder 100, beides steht im Auftrag (als Ziffer oder Wort). `titel` ist der Anteil, wie der Auftrag ihn sagt („9 von 10“, „37 %“), `text` sagt, wer oder was („Österreicher:innen wollen kein Mercosur“). `icon` ist die Einheit, die gezählt wird (`person`, `bus`, `haus` …); kein `motiv`, hier wird nichts gemalt. Kommazahlen („37,5 %“) passen nicht in Einheiten – dann ein `diagramm`.

- `zahl` – genau ein Punkt: eine einzige Zahl, riesig, unter dem Bild dessen, was sie zählt („420 €“ unter einem Sparschwein, „52 Hektar“ unter einem Bagger). `titel` ist die Zahl mit Einheit, wie der Auftrag sie nennt, `text` sagt in einem Satz, was sie bedeutet, `motiv` malt den Gegenstand. Statt einer großen Zahl auf leerer Fläche.

## Jeder Punkt

- `titel` – 1–4 Wörter, fett. Eine Zahl darf der Titel sein („300 Becher“), aber nur eine Zahl aus dem Auftrag.
- `text` – optional, ein kurzer Satz (bis 90 Zeichen). Lieber weglassen als füllen.
- `icon` – immer setzen, das Thema aus der Liste; es steht da, wenn keine Illustration gemalt werden kann.
- `motiv` – Englisch, ein einzelner Gegenstand oder eine kleine Figur, konkret, kompakt (etwa so hoch wie breit – lieber „a school building with a clock tower“ als eine lange Häuserzeile) und mit seiner Farbe aus der Palette (dunkelgrün, hellgrün, gelb): „a dark green city bicycle with a front basket“, „a full dark green rubbish bag“, „a yellow cooking pot with a green lid“. Nichts, was von Natur aus weiß bleiben müsste (kein Lichtschalter, kein Blatt Papier) – für „Licht aus“ lieber „a yellow light bulb“. Grau nur, wo es etwas sagt: eine CO₂- oder Abgaswolke ist „a dark grey smoke cloud“ (in Grün sähe sie aus wie ein Busch). Kein Text, keine Zahlen, keine Logos, keine echten Personen, keine Szenen mit Hintergrund. In einem Raster oder Ablauf zeigt jeder Punkt etwas anderes; bei `mengen` alle dasselbe.

## Texte

- Satzschreibung, kurz, konkret. Keine Wertung im Titel, die gehört in die Headline.
- `text` ergänzt Headline und Titel, er wiederholt sie nicht: steht „Am Wochenende kein Bus“ in der Headline, sagt der Text „der Gemeinden im Landkreis“, nicht noch einmal „… haben am Wochenende keinen Bus“.
- Österreich: österreichisches Deutsch und österreichische Gegenstände („Öffi“, „Mistkübel“ im Text; das Motiv bleibt Englisch).
