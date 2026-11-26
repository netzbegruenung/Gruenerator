# Karussells

Ausgewertet: die 20 neuesten Karussells beider Parteien (10/2026). Kritik, Erklärung und Geschichten laufen fast immer als Karussell.

## Bogen

1. **Hook** (4–10 Wörter): Frage oder Provokation, groß. Besteht die Slide nur aus der Headline, nimm `foto-unten` mit einem passenden Motiv (Stockfoto oder eigenes Foto) – oben die Headline, unten das Bild, wie in den Posts. Passt kein Foto, eine Farbfläche: dann setzt das Programm die Headline oben links und groß. „Bringt uns als nächstes die ==Gasrechnung== ins Schwitzen?“, „Daria pflegt ihre Mutter. Jeden Tag.“
2. **Kontext / Fakt** (15–45 Wörter): was los ist, mit den Zahlen aus dem Auftrag.
3. **Kritik / Wendung**: was falsch läuft, wer es verantwortet – sachlich-empört, mit Beleg statt Beschimpfung. Brücken: „Doch …“, „Aber nicht nur das …“, „anstatt …“.
4. **Lösung / Forderung**: `liste` mit 2–5 Forderungen oder ein Absatz „Darum sagen wir: …“.
5. **Schluss**: ein `aufruf` (siehe unten) oder eine große These. Ein Logo nur hier – in Deutschland `logo: true`, in Österreich meist ohne.

3–6 Slides für Kritik und Erklärung, bis 8 für eine Geschichte; zwei genügen für Frage und Auflösung oder Einstieg und einen Fakt. Der Hook ist kurz. In Deutschland auch der Schluss; in Österreich trägt die letzte Slide oft Begründung, „Darum sagen wir:“ und Forderung zusammen.

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

Die Karussells der Partei und der Spitzenkandidierenden (Korpus 10/2026, 32 Stück) haben keinen Standard-Look. Wähle den Look nach dem Stoff:

- **Geschichte, Betroffene, Alltag** → **Fotostrecke**: jede Slide ein Foto, Text mittig zentriert in `zeilenboxen` aus `absatz`-Bausteinen, der eine Satz, der zählt, `betont`. Ohne Logo, ohne Headline. Danach „Unsere Forderungen:“ + `liste` und der Schluss gemeinsam auf `mint`.
- **Statements von Personen** → Cover `zitat` auf Foto, dann Textseiten auf `creme` oder `mint` mit 300–500 Zeichen je Slide, ein Kernsatz in `++…++` (Textslider, Interview).
- **Erklärung, Zahlen, Fakten** → hell: alle Slides auf `hellgrau`, `mint` oder `weiss`, Inhalte als `liste`, `diagramm`, `iconliste` oder große Zahl. Cover mit Motiv (`foto-unten` auf derselben Farbe) oder nur die Headline.
- **Kritik, Angriff, Kampagne** → eine kräftige Fläche durchgehend: `grasgruen` (laut) oder `dunkeltanne` (ernst), Cover mit Motiv als `foto-unten` oder nur die Headline.
- **Wahlergebnis, Glückwunsch, Rückblick** → Fotos von Menschen auf jeder Slide (`foto`).

Nimm nicht für jedes Thema denselben Look: dunkle Flächen sind in den Posts die Ausnahme, helle und Fotos die Regel.

## Österreich

- **Die Fläche ist fast immer `dunkelgruen`** (Korpus 10/2026: 8 von 11 Partei-Karussells, die übrigen drei sind Fotostrecken) – die Abwechslung kommt aus dem Inhalt jeder Slide, nicht aus der Farbe. Cover und Hook: die Headline allein, oben links (`position: oben`, `align: links`), oder ein Foto. Argument-Slides zentriert. Statt Headline gern zwei `absatz`-Bausteine in großer Schrift.
- **Jede Argument-Slide trägt ein eigenes Mittel**, nicht nur Text: ein Motiv als `foto-unten`, eine `liste` mit Haken, ein `diagramm` oder eine große Zahl, eine `iconliste`, eine Gegenüberstellung (`vergleich`). Zwei reine Textslides hintereinander sind die Ausnahme.
- Ein Motiv zum Thema als `foto-unten` auf `dunkelgruen` (Text oben, Foto unten) – das Programm färbt das Foto grün ein, das häufigste Bildmittel der Posts. Auf dem Cover, gern auch auf Argument-Slides; der Schluss bleibt ohne Foto.
- **Wort-Akzente** mit `==…==` in fast jeder Slide – das gelbe Vollkorn-Wort ist das Markenzeichen.
- Brücke „Darum sagen wir:“ als `absatz` mit `betont: true`, darunter die Forderung.
- **Foto-Satzkette** (Geschichte, persönlicher Bericht): jede Slide ein vollflächiges Foto (`foto`, Text unten zentriert), ein einziger Satz läuft mit „…“ über alle Slides, kein Logo.
- **Schluss**: ein `aufruf` auf `dunkelgruen` oder die Forderung als Headline, gern mit Begründung und „Darum sagen wir:“ davor. Meist ohne Logo (7 von 10 Posts); wenn eins, dann nur auf der letzten Slide und nur auf einer Farbfläche.
- Kein `button`.
- Zahlen mit Quelle: `quelle`, wenn sie im Auftrag steht.

## Nicht nachbauen

Politikerfotos, Freisteller, Memes – dafür gibt es keine Bausteine. Eine Zahl wirkt auch als kurzer Absatz: „Das reichste ==1 %== besitzt über ==40 %== des Vermögens.“
