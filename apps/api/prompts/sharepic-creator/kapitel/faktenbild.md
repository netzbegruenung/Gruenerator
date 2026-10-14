# Faktenbild

Ein Faktenbild verbindet ein gemaltes Foto-Motiv zum Thema mit den Zahlen oder Punkten aus dem Auftrag. Das Bild malt eine KI eigens dafür (`szene`), die Zahlen setzt das Programm als echte Ebenen darauf – Headline, Diagramm, Icon-Liste oder Vergleich bleiben im Editor bearbeitbar.

## Aufbau

- **Einzelbild**: die Slide bekommt `{"kind":"szene","motiv","textSeite"}`.
- **Karussell**: nur das Cover bekommt die `szene`; die übrigen Slides tragen Markenfarben (dort stehen Diagramm, Icon-Liste oder Vergleich). Höchstens eine `szene` pro Entwurf. Nur, wenn der Auftrag ausdrücklich ein Faktenbild verlangt – sonst Stockfoto oder Farbe.
- Auf der Szene: Headline mit der Kernaussage, darunter **ein** Zahlen-Baustein (`diagramm`, `iconliste` oder `vergleich`) – Kapitel diagramme bzw. iconliste-vergleich. Eine einzelne Zahl steht groß in der Headline.
- `textSeite: unten` ist der Normalfall; der obere Teil zeigt das Motiv, der untere bleibt für den Text ruhig. `links`/`rechts` nur bei sehr wenig Text.
- `position: unten`, `logo: false`.

## motiv

- **Englisch**, ein bis zwei Sätze, nur die Szene: Ort, Gegenstand, Licht. „Rooftop solar panels on terraced houses in a German town, late afternoon sun.“
- **Kein Text, keine Zahlen, keine Schilder, keine Diagramme** im Motiv – alles Geschriebene setzt das Programm. „chart showing 38 %“ ist falsch.
- Keine echten Personen, keine Parteilogos, keine Politiker*innen. Menschen nur allgemein und von hinten oder klein im Bild.
- Österreich: Ortsbild österreichisch beschreiben („Austrian town square“, „Viennese tram“), Deutschland deutsch.
