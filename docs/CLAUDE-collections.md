# Kollektionen im Marktplatz bauen und gestalten

Eine Kollektion ist eine kurze Geschichte: ein großes Bild, ein Titel, ein paar Absätze, die erklären, warum es sie gibt, und dazwischen die Agents, Rezepte, Vorlagen und Sticker selbst. Diese Datei sagt, wie man eine baut, wie sie aussehen muss und was man dabei nicht tun darf.

Der Entwurf, aus dem die Regeln stammen, war der fünfte Anlauf. Die vier davor sind gescheitert, und die Gründe stehen unten unter _Was nicht funktioniert hat_. Wer an der Gestaltung etwas ändert, liest das zuerst.

## Wo was liegt

| Was | Wo |
|---|---|
| Registry aller Kollektionen | `packages/shared/src/marketplace/frontpage.ts` → `MARKETPLACE_COLLECTIONS` |
| Größere Kollektionen in eigener Datei | `packages/shared/src/marketplace/collections/<id>.ts`, in die Registry importiert |
| Bausteine (Typen) und Filter je Person | `packages/shared/src/marketplace/collectionStory.ts` → `CollectionStoryBlock`, `resolveStory` |
| Id (F0, steht in geteilten Links `?kollektion=`) | `packages/contracts/src/schemas/marketplace.ts` → `marketplaceCollectionIdSchema` |
| Einträge, die es nur als Datei gibt | `samples` (Vorbild: `sampleCollection.ts`), Bilder unter `apps/web/public/images/marketplace/collections/<id>/` |
| Cover | `apps/web/public/images/marketplace/collections/<stem>-{640,1200}.webp` und `<stem>-banner-{640,1200,1920,2400}.webp` |
| Rendering (Web) | `apps/web/src/features/marketplace/MarketplaceCollections.tsx` (Kopf, Raster) und `CollectionStory.tsx` (Bausteine) |
| Server | `apps/api/services/marketplace/marketplaceService.ts` löst `pinned` und `fill` auf; die Story bleibt Client-Registry |

Mobile rendert Kollektionen heute nicht.

## Eine neue Kollektion, Schritt für Schritt

1. **Id anlegen** in `marketplaceCollectionIdSchema`. Die Id ist F0: sie steht in geteilten Links und wird nie umbenannt.
2. **Eintrag schreiben**, bei mehr als ein paar Zeilen in `collections/<id>.ts`, und in `MARKETPLACE_COLLECTIONS` an die gewünschte Stelle setzen (Reihenfolge = Anzeigereihenfolge).
3. **Einträge festlegen.** `pinned` für alles mit stabilem `ref` (offizielle Agents, Rezepte), `samples` für Einträge, die nur als Datei existieren, `fill` für Inhalte ohne stabilen Ref (z. B. die beliebtesten Canva-Vorlagen). `show` begrenzt, `min` blendet die Kollektion unterhalb aus.
4. **Story schreiben** (siehe _Bausteine_). Ohne `story` zeigt die Seite die Einträge als Raster wie bisher.
5. **Cover ablegen** in allen sechs Größen. nginx liefert `/images/**` als unveränderlich aus: ein neues Bild bekommt einen neuen Stem (`-v2`), nie denselben Namen.
6. **Länder prüfen.** `audience` der Kollektion und jedes länderspezifischen Bausteins setzen (siehe _Österreich_).
7. **Tests:** `collectionStory.vitest.ts`, `frontpage.vitest.ts` (Minimum erreichbar) und `apps/web/src/features/marketplace/collectionCovers.vitest.ts` (Cover-Dateien vorhanden).
8. **`listed: false`**, solange die Kollektion nicht in die Reihe auf der Startseite soll. Sie bleibt dann über `?kollektion=<id>` erreichbar.

## Bausteine

Sechs Bausteine, nicht mehr. Ein neuer kommt erst dazu, wenn eine Kollektion ihn wirklich braucht und keiner der sechs ihn abdeckt.

| Baustein | Wofür | Regeln |
|---|---|---|
| **Titel** | Cover, Kicker, Titel, Beschreibung, Hauptaktion | Kein Block: kommt aus `cover`, `kicker`, `title`, `description`. Immer zuerst. |
| `text` | Ein bis drei Absätze. Erklärt, warum es die Kollektion gibt. | Klartext, kein Markdown. Kurze Absätze. |
| `claim` | Ein Satz oder eine Zahl in Titelgröße, darunter eine Zeile (`note`). | Enthält `text` eine Ziffer, ist `source` Pflicht (Test). Höchstens zwei pro Kollektion, sonst verliert jede an Gewicht. |
| `quote` | Eine Stimme aus der Praxis. | `by` nennt Funktion und Ort. Echte Zitate nur mit Freigabe der Person. Erfundene Zitate nur, solange die Kollektion `listed: false` ist, und dann mit „Beispiel“ in `by`. |
| `items` | Einträge an der Stelle, an der der Text von ihnen spricht. | `display: 'rows'` für Agents und Rezepte, `'gallery'` für alles mit Bild. Nur Einträge aus `pinned` oder `samples` (Test). |
| `example` | Ein Eintrag mit kurzem Austausch: was du schreibst, was er antwortet. | Die Antwort ist echt oder realistisch, nie ein Werbesatz, höchstens 200 Zeichen (Test). Höchstens einer pro Kollektion. |
| `vorlagen` | Die Grünerator-Vorlagen eines Themas (`SharepicThema`: `queer`, `frauen`, `europa`) oder eines Designs (`brand: 'gruene-jugend'`, je Land eine Kollektion mit eigener `audience`) als Galerie; ohne `brand` nur Partei-Vorlagen, jede öffnet ihre Vorschau auf `/vorlagen`. | Die Seite fragt den Katalog (`/api/sharepic-vorlagen`) selbst, im Land der Person. Die Vorlagen sind Parteiinhalt und liegen im privaten Repo, nie hier. Fehlt der Katalog oder hat er nichts zum Thema, zeigt der Block nichts — der Text davor bleibt dann stehen, also so schreiben, dass er auch allein trägt. |
| `friends` | Grünerator-Friends (`ids`, Robot-Ids aus `GRUENERATOR_FRIENDS`) als Profilbild-Angebot; ein Klick öffnet die Friends-Einstellungen. | Nur Friends, die zum Thema gehören (Queer: die Pride-Edition mit Regenbogen, Juna und Bunti). Ids müssen existieren (Test). |

Was kein Block zeigt, steht am Ende unter „Mehr aus der Kollektion“. Sieht eine Person einen Eintrag nicht, fällt er aus seinem Block. Ein Block ohne Einträge fällt ganz weg und mit ihm ein `text` direkt davor, der sonst ins Leere erklärt (`resolveStory`).

### Eine gute Reihenfolge

Kein Gesetz, aber bewährt:

```
text      warum es die Kollektion gibt
claim     die eine Zahl oder der eine Satz
items     die Einträge, um die es geht (gallery oder rows)
quote     die Stimme
text      wie man es nutzt
items     die übrigen Einträge
```

Zwischen zwei `items` steht immer Text, sonst ist die Story ein Raster mit Umwegen.

## Gestaltung

Die Regeln sind im Renderer verankert, nicht in den Daten. **Kein Baustein hat Farbe, Größe, Hintergrund oder Ausrichtung als Feld.** Wer kuratiert, wählt Bausteine aus und ordnet sie an. Nur so passen alle Kollektionen zusammen.

- **Zwei Flächen:** die Seite und das Bild. Text steht immer auf der Seite: nie in einem Kasten, nie auf einer getönten Fläche, nie auf einem Foto.
- **Eine Bildwelt:** Ein Bild ist ein Foto aus der Grünerator-Bildwelt (Tageslicht, Wiese, Sonnenblumen, Marktplatz, Pflanze) oder ein echtes Produkt (Sharepic, Vorlage, Sticker). Keine Illustrationen, keine Icon-Kacheln als Bildersatz, keine gemalten Platzhalter in CSS.
- **Grün** trägt nur die Hauptaktion und das Siegel der Agents und Rezepte (ihr eigenes Icon auf Tanne). Zahlen, Zitate und Aussagen sind Schrift auf Seite, ohne Farbe.
- **Zwei Breiten:** die Lesespalte (`max-w-[42rem]`, linke Kante wie der Titel) für Text, Aussage, Zitat, Beispiel und Zeilen; die volle Breite für Cover und Galerien.
- **Vier Schriftgrößen:** Display (Raleway 800, Titel und `claim`), Groß (Raleway 500–600, Zitat, Beispielantwort, Überschrift einer Galerie), Text (PT Sans 19px), Klein (Kicker, Quelle, Beschreibung). Keine weitere Größe.
- **Ein Radius** für alle Bilder (22px), Sticker freigestellt ohne Fläche.
- **Galerien** zeigen Produkte in ihrem echten Format auf gemeinsamer Höhe (250/300px), nicht in einheitlich beschnittene Kacheln gepresst.
- **Bewegung** nur als Antwort auf Druck (`active:scale`), keine Einblend-Animationen.

### Was nicht funktioniert hat

1. **Themenspezifische Layouts.** Eigene Varianten für ein Thema (Kalender, Kapitel nur für Gleichstellung) skalieren nicht. Der Baukasten ist für alle Kollektionen derselbe.
2. **Jeder Baustein mit eigener Fläche.** Grüne Zahlenkästen, Sand-Hinweisboxen, getönte Feature-Blöcke, gestrichelte Posttext-Kästen, Avatare am Zitat: sieben Bausteine, sieben Stimmen, ein Musterkatalog statt einer Seite.
3. **Alles weggekürzt.** Eine reine Textspalte ist ruhig, aber ohne große Bilder und große Sätze langweilig.
4. **Vier Bildsprachen gemischt.** Blasse Fotos mit dunklem Verlauf, knallige CSS-Sharepics, Chat-Blasen auf Mint, Linien-Icons auf Kacheln, dazu vier Flächenfarben und wechselnde Radien. Kein Raster verband sie. Daraus stammt die Regel _eine Bildwelt, zwei Flächen_.

## Texte schreiben

- **Für wen:** Kreis- und Ortsverbände, die etwas veröffentlichen wollen. Der Text sagt, warum das Thema zählt und wie man die Einträge nutzt, nicht, wie toll sie sind.
- **Kurz.** Ein `text` hat höchstens drei Absätze, ein Absatz höchstens drei Sätze.
- **Zahlen mit Quelle, Jahr und Land.** Die Quelle verlinkt die Primärquelle (Destatis, BKA, Statistik Austria), nicht einen Zeitungsartikel. Zahlen veralten: Wer eine Kollektion mit `claim` anlegt, notiert im PR, wann sie zu prüfen ist.
- **Keine Parteiinterna.** Die Registry liegt in `packages/shared` und damit im Web-Bundle und in jeder Mobile-Binary (siehe _Parteiinterne Inhalte_ in `CLAUDE.md`).
- **Wording:** Agents, Rezepte, Marktplatz, Kollektion, „Zu meinen Grüneratoren“ (Agents/Rezepte), „Merken“ (Vorlagen, Sticker, Hintergründe).

## Österreich

`de-AT` ist gleichwertig. Eine Kollektion mit `audience: 'all'` darf länderspezifische Bausteine tragen: ein Block mit `audience: 'de-DE'` und sein Gegenstück mit `audience: 'de-AT'` stehen hintereinander, `resolveStory` zeigt jeder Person ihren. Das gilt für jede Zahl, jedes Gesetz, jede Ansprechstelle und jedes Hilfetelefon. Fehlt das österreichische Gegenstück, lieber den Block weglassen als eine deutsche Zahl in Österreich zeigen.

## Sharepics in Kollektionen

**Themen-Kollektionen** (Sharepics zu einem Thema) tragen `row: 'themen'` und stehen auf der Startseite in der eigenen Reihe „Themen“ unter „Kollektionen“; die Vorschau einer Vorlage mit `spec.thema` verlinkt auf ihre Kollektion (`collectionForThema`). Die Einleitung steht in `description` und darf Begriffe mit `**…**` fett setzen (auf der Karte ohne Hervorhebung).

**Eine Sharepic-Kollektion bleibt kurz:** höchstens eine Einleitung, dann die Vorlagen, dazu höchstens passende Friends. Keine Zahlen, Zitate, Beispiele oder Agent-Zeilen dazwischen — der Fokus sind die Sharepics. Ohne Einträge braucht sie `pinned: []` und `min: 0`; die Seite zeigt eine Kollektion, sobald der Server sie liefert, auch leer.

Grünerator-Sharepics gehören über `vorlagen` in eine Kollektion, nicht als Bilddatei ins Repo: der Katalog liefert sie im richtigen Land, mit aktuellem Vorschaubild, und eine neue Vorlage zum Thema erscheint ohne Codeänderung. Lokal braucht die API dafür `INTERN_CONTENT_DIR` auf einen Checkout von `gruenerator-intern` (sonst ist der Block leer).

Sharepics, die noch entstehen, können vorübergehend als `samples` mit Platzhalterbild kommen. Platzhalter tragen sichtbar „Platzhalter“ und dieselbe Bildwelt wie das Endprodukt (Foto als Grund, Tanne-Balken). Eine Kollektion mit Platzhaltern bleibt `listed: false`.

Cover dürfen Fotos aus `apps/api/public/sharepic_example_bg/` sein (Unsplash, öffentlich); dann mit `credit`.

## Offen

- **Startseite:** Die Karten in der Reihe „Kollektionen“ sind noch die 16:9-`ShowcaseCard`. Der Entwurf sieht eine große Karte und darunter Karten im Format 4:5 vor, mit Titel unter dem Bild; dafür braucht jedes Cover einen Hochkant-Schnitt.
- **Cover im Format 16:9** statt des 3:1-Banners auf der Kollektionsseite, am Handy 4:5.
