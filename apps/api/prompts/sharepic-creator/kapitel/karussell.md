# Karussells

Ausgewertet: die 20 neuesten Karussells beider Parteien (10/2026). Kritik, Erklärung und Geschichten laufen fast immer als Karussell.

## Bogen

1. **Hook** (4–10 Wörter): Frage oder Provokation, groß. Besteht die Slide nur aus der Headline, nimm `foto-unten` mit einem passenden Motiv (Stockfoto oder eigenes Foto) – oben die Headline, unten das Bild, wie in den Posts. Passt kein Foto, eine Farbfläche: dann setzt das Programm die Headline oben links und groß. „Bringt uns als nächstes die ==Gasrechnung== ins Schwitzen?“, „Daria pflegt ihre Mutter. Jeden Tag.“
2. **Kontext / Fakt** (15–45 Wörter): was los ist, mit den Zahlen aus dem Auftrag.
3. **Kritik / Wendung**: was falsch läuft, wer es verantwortet – sachlich-empört, mit Beleg statt Beschimpfung. Brücken: „Doch …“, „Aber nicht nur das …“, „anstatt …“.
4. **Lösung / Forderung**: `liste` mit 2–5 Forderungen oder ein Absatz „Darum sagen wir: …“.
5. **Schluss**: ein `aufruf` (siehe unten) oder eine große These. Ein Logo nur hier – in Deutschland `logo: true`, in Österreich meist ohne.

3–6 Slides für Kritik und Erklärung, bis 8 für eine Geschichte. Der Hook ist kurz. In Deutschland auch der Schluss; in Österreich trägt die letzte Slide oft Begründung, „Darum sagen wir:“ und Forderung zusammen.

## Was groß gehört

- **Zahlen, Kritik und Forderungen gehören in `headline` oder `absatz`** – nie in `text`. `text` ist im Karussell nur für einen Nebensatz unter einer großen Aussage.
- Eine Zahl wirkt am stärksten allein: „==−33 %== beim Obst“ als Headline-Zeile.
- Mehrere vergleichbare Zahlen (früher/heute, Anteile, Orte): als `diagramm` – siehe Kapitel `diagramme`.

## Was die Slides verbindet

- **Ein Look für alle Slides**: dieselbe Fläche, dieselbe Ausrichtung, dieselbe Textbehandlung – so sind 17 von 18 Partei-Karussells gebaut. Plane die Flächen vorab für das ganze Karussell, nicht Slide für Slide.
  - **Höchstens ein Flächenwechsel, nie zurück**: entweder direkt nach dem Cover, oder nach einer Fotostrecke für die letzten zwei Slides (Forderungen + Schluss gemeinsam). Auf einer festen Farbe bleiben auch die letzten Slides auf ihr. Nie Fläche A → B → A, nie eine dritte Fläche für den Schluss.
  - **Fotos in einer Art**: ein Motiv als `foto-unten` nur auf dem Cover – oder die ganze Strecke auf Fotos (Geschichte). Nicht einzelne Mittel-Slides mit Foto zwischen Farbflächen.
  - **Ausrichtung** bleibt zwischen Cover und Schluss gleich (alles links oder alles zentriert).
- **Sätze laufen über die Slide-Grenze** (vor allem Österreich; Deutschland brückt mit Fragen wie „Die Konsequenz?“): eine Slide endet mit „…“ oder einer Frage, die nächste beginnt mit „…“ oder einer Brücke („Deswegen …“, „Die Konsequenz?“, „Darum sagen wir:“). Beginnt eine Slide mit „…“, **muss** die davor auf „…“ enden; die letzte Slide endet nie auf „…“.
- **Fragen-Gerüst**: für Erklärstücke die Frage, die sich Leser*innen stellen, als `dachzeile` über die Slide („Warum?“, „Und was heißt das für uns?“, „Die Lösung?“), die Antwort darunter als `absatz`.

## Rahmen: Pfeil, Weiter-Text, Seitenzahl

Das Programm setzt diese Teile selbst; du entscheidest nur, ob sie da sind.

- **Weiter-Pfeil**: steht auf jeder Slide außer der letzten. `pfeil: false` nur, wenn er stört – etwa wenn jede Slide mit „…“ in die nächste läuft.
- **`weiter`**: ein kurzer Teaser neben dem Pfeil, der zur nächsten Slide zieht – „Denn →“, „Deshalb →“, „Wie stoppen wir das?“, „Und jetzt?“. Nicht auf jeder Slide, eher dort, wo die nächste Slide die Antwort bringt; nie auf der letzten.
- **`seitenzahl`**: selten – in keinem der 18 Partei-Karussells. Nur bei nummerierten Inhalten (Gründe, Schritte, Fakten) und ab 4 Slides – `punkte` (Punktreihe oben) oder `bruch` („2/5“ oben rechts). Sonst weglassen.

## Schluss-Slide: `aufruf`

Der `aufruf` steht allein auf der letzten Slide (höchstens eine `dachzeile` darüber), `position: mitte`. Wähle den Stil, der zum Ton passt – nicht immer denselben:

- `ausruf` – riesiges „!“, darüber an wen es geht (`adressat`, nur wenn der Auftrag die Person oder Partei nennt), darunter die Forderung: „Hören Sie auf, beim Klimaschutz zu sparen.“
- `kernsatz` – der eine Satz, der hängen bleibt, mittig, Logo darunter: „Klimaschutz ist ==Heimatschutz==.“
- `petition` – Aufforderung zum Mitmachen, `hinweis` als Pille darunter („Link in der Bio“) – den hinweis nur, wenn der Auftrag einen Link, eine Petition oder eine Unterschriftenaktion nennt.

## Deutschland

- **Geschichte auf Fotos**: jede Slide ein Foto, Text mittig zentriert in `zeilenboxen` aus `absatz`-Bausteinen. Der eine Satz, der zählt, ist `betont` (grüne Box). Ohne Logo, ohne Headline.
- **Textslider** (Interview, Statement): Textseiten mit 300–500 Zeichen je Slide. Interview-Auszüge auf `creme` mit einem Kernsatz in `++…++`, Cover ein `zitat` auf Foto.
- **Forderungen**: `headline` „Unsere Forderungen:“ + `liste` – nach einer Fotogeschichte auf `mint`, sonst auf der Farbe des Karussells.
- **Schluss**: auf derselben Fläche wie die Forderungen mit einem `aufruf` oder einer großen Headline mit `akzent`, `logo: true`.
- **Kritik und Erklärung**: Cover mit Motiv (`foto-unten`), dann alle Slides bis zum Schluss auf derselben Farbe (z. B. `dunkeltanne`, oben, links) – auch Forderungen und Schluss. Ein Wechsel auf `mint` am Ende gehört nur zur Fotogeschichte.

## Österreich

- **Kritik und Erklärung: alle Slides auf `dunkelgruen`**. Cover und Hook: die Headline allein, oben links (`position: oben`, `align: links`). Argument-Slides zentriert. Statt Headline gern zwei `absatz`-Bausteine in großer Schrift.
- Ein Motiv zum Thema als `foto-unten` auf `dunkelgruen` (Text oben, Foto unten) – das Programm färbt das Foto grün ein, das häufigste Bildmittel der Posts. Auf dem Cover, gern auch auf Argument-Slides; der Schluss bleibt ohne Foto.
- **Wort-Akzente** mit `==…==` in fast jeder Slide – das gelbe Vollkorn-Wort ist das Markenzeichen.
- Brücke „Darum sagen wir:“ als `absatz` mit `betont: true`, darunter die Forderung.
- **Foto-Satzkette** (Geschichte, persönlicher Bericht): jede Slide ein vollflächiges Foto (`foto`, Text unten zentriert), ein einziger Satz läuft mit „…“ über alle Slides, kein Logo.
- **Schluss**: ein `aufruf` auf `dunkelgruen` oder die Forderung als Headline, gern mit Begründung und „Darum sagen wir:“ davor. Meist ohne Logo (7 von 10 Posts); wenn eins, dann nur auf der letzten Slide und nur auf einer Farbfläche.
- Kein `button`.
- Zahlen mit Quelle: `quelle`, wenn sie im Auftrag steht.

## Nicht nachbauen

Politikerfotos, Freisteller, Memes – dafür gibt es keine Bausteine. Eine Zahl wirkt auch als kurzer Absatz: „Das reichste ==1 %== besitzt über ==40 %== des Vermögens.“
