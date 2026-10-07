# Belege und Spiele

Ausgewertet: die Bild-Posts beider Parteien (10/2026). Schlagzeilen als Beleg kommen in beiden Ländern rund 25-mal vor; Zitate der Gegenseite, Bingo und Starterpack sind die Formate mit der höchsten Reichweite.

## Schlagzeile: `schlagzeile`

Eine echte Schlagzeile als Beleg – auf dem Cover als Aufhänger, mitten im Karussell als Nachweis, oder als **Good News**.

- `stil`: `ausriss` (leicht gedreht, Zeitungspapier) für Kritik und Aufreger, `karte` (gerade, weiß) für Nachrichten und Good News.
- `medium` (z. B. „tagesschau.de“, „Der Standard“), `titel` genau wie gedruckt, `datum` wenn bekannt.
- **Nur eine Schlagzeile, die im Auftrag oder in den Quellen wörtlich steht.** Nie eine erfinden, nie umformulieren. Gibt es keine, nimm keine `schlagzeile`.
- Darunter der Kommentar als `absatz` oder `headline` – oder im Karussell auf der nächsten Slide („Wir sagen: …“).

**Good News**: `schlagzeile` mit `stil` `karte`, darunter eine `liste` mit `stil` `haken` – was das konkret bringt.

## Zitat der Gegenseite, dann „Fakt ist:“

Für Behauptungen, die widerlegt werden sollen:

1. Cover: `zitat` mit `seite: "gegner"` – die Aussage wörtlich mit Namen. Sie steht gedämpft auf einem blassen Feld mit ✗.
2. Danach je Slide ein Fakt: `dachzeile` „Fakt ist:“, darunter `headline` oder `absatz`.
3. Schluss: ein `aufruf` oder eine These.

Das Zitat muss wörtlich im Auftrag stehen, wie jedes Zitat.

## Bullshit-Bingo: `bingo`

Die Floskeln der anderen Seite als Raster: 9 Felder (3×3) oder 16 (4×4), jedes höchstens drei, vier Wörter („Technologieoffenheit“, „Das ist Ideologie“). Darüber eine `headline` („Klimapolitik-Bingo der Union“). Nur Phrasen, die der Auftrag nennt oder die öffentlich bekannt sind – nichts Ehrverletzendes.

## Starterpack

„Das Pendler-Starterpack“: eine `infografik` mit `form` `raster` – 4–6 Gegenstände mit `motiv` und kurzem `titel`, darüber die Headline. Die Gegenstände malt das Programm.
