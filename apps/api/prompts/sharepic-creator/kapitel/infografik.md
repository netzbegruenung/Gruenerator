# Infografik

Eine Infografik erklärt mit Bildern: jeder Punkt hat eine kleine, flache Illustration, darunter oder daneben einen fetten Titel und höchstens einen kurzen Satz. Die Illustrationen malt eine KI eigens dafür (aus `motiv`), Titel, Zahlen, Kreise und Linien setzt das Programm als bearbeitbare Ebenen.

## Aufbau einer Slide

- Oben eine kurze Headline (2–3 Zeilen), optional eine `dachzeile`. Dann ein einziges Element `{"type":"infografik","form",…,"punkte":[…]}`. Nichts weiter – kein Absatz, keine Liste, kein Diagramm daneben.
- Hintergrund: eine helle Markenfarbe (`hellgrau` oder `weiss` in Deutschland, `weiss` in Österreich), `position: "oben"` (bei `mengen`: `"mitte"`), `align: "zentriert"`, `logo: false`. Kein Foto, keine `szene`.
- Eine Quelle für Zahlen in `quelle`, wenn der Auftrag sie nennt.

## Welche form

- `raster` – 2–6 gleichrangige Punkte: Tipps, Gründe, Forderungen, Fakten. 4 Punkte stehen 2 × 2, 3 und 5–6 in Dreierreihen.
- `ablauf` – 3–5 Schritte in fester Reihenfolge: ein Weg, ein Kreislauf, „so funktioniert …“. Das Programm nummeriert und verbindet sie.
- `mengen` – 2–4 Mengen derselben Sache im Vergleich: Müll nach Branchen, Emissionen nach Sektoren, Kosten je Weg. Jeder Punkt hat `wert` (die Zahl aus dem Auftrag, ohne Einheit); das Programm macht die Illustration so groß, wie der Wert es verlangt, und stellt alle auf eine Linie. `titel` ist hier die Zahl mit Einheit („3,36 Mio. t“), `text` sagt, wofür sie steht („Bauwesen“). Alle Punkte zeigen denselben Gegenstand (ein Müllsack, ein Geldstapel) – nur die Größe unterscheidet sie.

## Jeder Punkt

- `titel` – 1–4 Wörter, fett. Eine Zahl darf der Titel sein („300 Becher“), aber nur eine Zahl aus dem Auftrag.
- `text` – optional, ein kurzer Satz (bis 90 Zeichen). Lieber weglassen als füllen.
- `icon` – immer setzen, das Thema aus der Liste; es steht da, wenn keine Illustration gemalt werden kann.
- `motiv` – Englisch, ein einzelner, farbiger Gegenstand oder eine kleine Figur, konkret (nichts, was von Natur aus weiß ist – kein Lichtschalter, kein Blatt Papier): „a city bicycle with a front basket“, „a full black rubbish bag“, „a heat pump unit“. Kein Text, keine Zahlen, keine Logos, keine echten Personen, keine Szenen mit Hintergrund. In einem Raster oder Ablauf zeigt jeder Punkt etwas anderes; bei `mengen` alle dasselbe.

## Texte

- Satzschreibung, kurz, konkret. Keine Wertung im Titel, die gehört in die Headline.
- Österreich: österreichisches Deutsch und österreichische Gegenstände („Öffi“, „Mistkübel“ im Text; das Motiv bleibt Englisch).
