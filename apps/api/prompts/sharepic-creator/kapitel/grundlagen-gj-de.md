# Grundlagen GRÜNE JUGEND (Deutschland)

Das Sharepic ist von der GRÜNEN JUGEND, der Jugendorganisation – nicht von der Partei. Ihr Design ist bunter und lauter als das der Grünen.

- Farben: `limette` (Hellgrün, die Hauptfarbe und der Wiedererkennungswert), `lavendel`, `pink`, `apricot` – die vier stehen **flach und vollflächig**, ohne Verlauf. Dazu `wiese` (ein kräftigeres Grün, gut für Termine), `weiss` (Erklär- und Textslides) und `schwarz` (ernste Themen, Gedenken, Beschlüsse – dann ohne Grün). Ein Karussell bleibt in einer Farbe oder wechselt zwischen einer Primärfarbe und Weiß.
- Auf allen Primärfarben steht die Schrift **schwarz**, auf Schwarz und auf Fotos weiß. Das setzt das Programm.
- Themen-Sharepics (`"thema"`) wie bei der Partei; die Fläche bleibt dann eine Themenfarbe.
- Schrift: Wix Madefor Display ExtraBold für Headlines, in normaler Schreibung, groß. Fließtext in Wix Madefor Text.
- **Hervorhebung sind Balken, keine Farbwörter:** `++…++` legt einen hellgrünen (auf Hellgrün weißen) Balken hinter 1–3 Wörter – sparsam, eine Stelle pro Slide. `==Wort==` bleibt schwarz und ist hier fast nie nötig.
- **Zeilenbalken auf Fotos:** Auf einem Foto setzt du `"zeilenboxen": true` – dann steht jede Zeile auf ihrem eigenen Balken, die erste weiß, die folgenden hellgrün, lückenlos untereinander. Das ist das Markenzeichen der GJ-Fotoposts (Danke-, Aufruf- und Demo-Fotos). Headline dann in 2–3 kurzen Zeilen.
- **Zeilenbalken auf Farbe:** Auf einer Primärfarbe stehen die Balken schwarz mit weißer Schrift – für Cover von Erklär-Karussells und Einladungen. Dann nur Headline (und höchstens eine Dachzeile) auf der Slide, weil jeder Text Balken bekommt.
- Störer: ein schwarzer Zackenstern mit weißer Schrift. Text sehr kurz: „!!!“, „Neu!“, „Jetzt!“.
- Logo: die schräge Wortmarke „GRÜNE JUGEND“ unten links. Setze `"logo": true` auf **jeder** Grafik-Slide (Farbfläche), nie auf Foto-Slides.
- Sprache: direkt, Du-Ansprache, solidarisch, gern zugespitzt („Schluss mit …“, „Wir gehen auf die Straße!“). Kein Parteideutsch.
- Format: 4:5 (Standard, nicht ändern).
- Häufigste Aufbauten:
  - Statement: `limette`, `apricot`, `lavendel` oder `pink` + Headline oben links + ein kurzer `text`, optional Störer.
  - Foto + Headline auf Zeilenbalken unten links (`zeilenboxen`).
  - Zitat auf Foto: `zitat` mit `name` und `funktion` „Sprecherin der GRÜNEN JUGEND“.
  - Erklär-Karussell: Hook auf einer Primärfarbe, dann 2–4 Slides auf `weiss` mit `absatz` (eine `++…++`-Stelle) oder `liste`, Schluss mit `aufruf` (`kernsatz`) auf der Primärfarbe.
  - Gedenken: `schwarz`, Headline weiß, `absatz`, Schluss auf `weiss` mit Kernsatz.
  - Einladung: `lavendel`, Headline + kurzer `text`, darunter Wann und Wo als `iconliste` mit den Icons `kalender` und `ort`.
  - Termine: `wiese`, Dachzeile (Region) + Headline, `termine` – jedes Datum steht auf einem Kalenderblatt. `datum` als „22. Aug.“ oder „8.–9. Aug.“ schreiben (Tag, Leerzeichen, Monat).
  - Interview-Karussell: Cover als `zitat` auf Foto (steht hellgrün), dann `frage` mit `von` (Medium) + `absatz` als Antwort, im Wechsel auf `weiss` und `lavendel`.
