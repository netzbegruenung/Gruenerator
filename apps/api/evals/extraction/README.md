# Tabellen-Extraktion: Soll und Ist

Gemessen am 24.08.2026 an `__fixtures__/tabellen-pdf.pdf` — der Datenschutzerklärung
(Stand 09.07.2026, 8 Seiten, text-natives PDF mit drei Tabellen). Anlass war eine
Chat-Antwort, die Tabellenzeilen mit zerhackten Beschriftungen zitierte
(„KI **-** Anfragen", „Server **-** Logs").

Maßstab ist die Tabelle „Übersicht der wichtigsten Speicherfristen": **8 Zeilen ×
2 Spalten = 16 Zellen**, festgehalten in [`expectedTable.ts`](./expectedTable.ts).
Gezählt wird, wie viele davon **wortgetreu** im extrahierten Text stehen.

## Ist-Stand

Die Spalte „wo im Produkt" nennt den Stand nach #2828 (Chat-Anhang auf OCR-Text)
und #2830 (geometrie-basierte Zusammensetzung in PDF.js).

| Weg                                 | wo im Produkt                                              | Zeichen | Zellen wortgetreu |
| ----------------------------------- | ---------------------------------------------------------- | ------: | ----------------: |
| PDF.js direkt (geometrie-Join)      | Dokument-Upload → Indizierung → **Qdrant-Chunks**          |  17 500 |       **16 / 16** |
| Mistral OCR, **ohne** `tableFormat` | Chat-Anhang → Zusammenfassung + `knownText` an Indizierung |  17 871 |       **16 / 16** |
| Mistral OCR, `tableFormat: 'html'`  | — nirgends mehr                                            |  16 219 |        **3 / 16** |

### PDF.js vor #2830: 10 von 16 — und die Regel dahinter war exakt

pdfjs gibt jeden Binde- und Gedankenstrich als **eigenes Text-Item** aus.
`pdfOperations.ts` setzte die Items mit `.join(' ')` zusammen. Daraus folgte
zellenweise, ohne Ausnahme:

> Zelle **mit** Strich → zerlegt. Zelle **ohne** Strich → wortgetreu.

Sechs der sechzehn Zellen enthalten einen Strich, und genau diese sechs fehlten
(`KI - Anfragen`, `Server - Logs`); dazu brachen Wörter an Layout-Umbrüchen auf
(`Dat en`, `Missbra uchserkennung`, `Zwe i - Faktor - Authentifizierung`).

**Seit #2830 entscheidet die Geometrie** (`services/OcrService/textItemJoin.ts`):
beginnt das nächste Item dort, wo das vorige endet (`transform[4] + width`),
wird nahtlos angefügt; Zeilenwechsel (`hasEOL`) werden zu `\n`, sodass jede
Tabellenzeile auf einer eigenen Zeile steht und `applyMarkdownFormatting`
erstmals auf echten Zeilen arbeitet (Überschriften-Erkennung greift). Ergebnis
auf der Fixture: **16 / 16**, festgeschrieben in
[`tableExtraction.vitest.ts`](./tableExtraction.vitest.ts).

**Verbleibender Mangel:** gesperrt gesetzte Spaltenköpfe. Aus
`Datenart  Speicherdauer` wird weiterhin `D a t e n a r t S p e i c h e r d a u e r` —
pdfjs baut diese Leerzeichen bereits **innerhalb** eines einzelnen Text-Items in
`str` ein, da ist auf Item-Ebene nichts mehr zu entscheiden. Kein Volltextfilter
und keine Einbettung erkennt das wieder — die Tabelle hat im Index effektiv
keine Überschrift. Auch als Zusicherung festgenagelt.

### Mistral OCR mit `tableFormat: 'html'`: 3 von 16

Die schlechteste Zahl der drei, und aus einem anderen Grund: **die Tabelle wird
korrekt erkannt und dann weggeworfen.** Die Option lagert Tabellen nach
`page.tables` aus und hinterlässt im Markdown nur einen toten Verweis:

```
# **Übersicht der wichtigsten Speicherfristen:**

[tbl-2.html](tbl-2.html)
```

`mistralIntegration.ts` liest ausschließlich `page.markdown` — `page.tables` fasst
niemand an. In `page.tables` steht die Tabelle dabei tadellos, mit korrekten
Bindestrichen und richtigen Spaltenköpfen.

Die drei „Treffer" sind kein Tabelleninhalt, sondern Werte, die zufällig auch im
Fließtext vorkommen (`90 Tage`, `13 Monate`, `7 Tage`). Drei Tabellen im Dokument,
drei tote Verweise: `tbl-0.html`, `tbl-1.html`, `tbl-2.html`.

`tableFormat: 'markdown'` verhält sich identisch, nur mit `.md`-Endung.

## Soll-Stand

**16 von 16 — auf beiden produktiven Wegen erreicht.** Bei Mistral OCR, indem
`tableFormat` schlicht **weggelassen** wird — dann kommt die Tabelle inline als
Markdown:

```
|  Datenart | Speicherdauer  |
| --- | --- |
|  Sitzungsdaten (Redis) | bis Sitzungsende, max. 24 Stunden  |
|  KI-Anfragen bei KI-Dienstleistern | max. 30 Tage (Missbrauchserkennung)  |
|  Audio-/Videotranskription (Regolo) | Zero Data Retention – Löschung am Ende der Session  |
…
```

Korrekte Bindestriche, korrekter Gedankenstrich, lesbare Spaltenköpfe, und die
Struktur bleibt als Markdown-Tabelle erhalten — also auch für ein Modell als
Tabelle erkennbar. Mistral bleibt der einzige Weg mit **lesbaren Spaltenköpfen**;
PDF.js liefert die 16 Zellen ohne Tabellen-Markup und mit gesperrten Köpfen.

## Was daraus folgt

Für **Chat-Anhänge erledigt** durch #2828, und zwar auf beiden Ebenen: `tableFormat`
fällt weg (3/16 → 16/16), und der bereits extrahierte OCR-Text wird als `knownText`
an die Indizierung durchgereicht, statt dieselbe Datei ein zweites Mal durch PDF.js
zu schicken. Ein Text pro Datei — derselbe, den das Modell im Anhang liest.

Für den **Dokument-Upload außerhalb des Chats** erledigt durch #2830:
`processUploadedDocument` landet über den Parseability-Check weiter bei PDF.js
(umsonst, ~440 ms), aber die geometrie-basierte Zusammensetzung liefert dort
jetzt ebenfalls 16/16. **Rückwirkend repariert das nichts** — was vor #2830 in
Qdrant indiziert wurde, liegt dort in der zerlegten Fassung; erst eine
Neu-Indizierung der betroffenen Dokumente ändert bestehende Notebooks.

Ein Reranker hilft in keinem der Fälle — was in der Extraktion zerfällt, stellt
keine Rangfolge wieder her.

## Reproduzieren

Deterministisch, ohne Netz, in der CI:

```bash
pnpm --filter @gruenerator/api exec vitest run evals/extraction/tableExtraction.vitest.ts
```

Der Vergleich aller drei Wege (braucht `MISTRAL_API_KEY`, kostet pro Lauf):

```bash
pnpm --filter @gruenerator/api exec tsx evals/extraction/compareExtractors.ts
# optional gegen ein eigenes PDF:
pnpm --filter @gruenerator/api exec tsx evals/extraction/compareExtractors.ts /pfad/zur.pdf
```

Die Zeichenzahl stimmt mit dem überein, was das Backend im Betrieb protokolliert
(`PDF.js extraction completed: … characters`) — der Nachbau ist also der echte
Pfad, keine Annäherung. `extractWithPdfJs.ts` importiert Zusammensetzung
(`textItemJoin.ts`) und Formatierung (`applyMarkdownFormatting`) aus den
Produktionsmodulen und baut nur die Seitenschleife nach.
