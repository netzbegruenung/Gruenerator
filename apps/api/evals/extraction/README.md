# Tabellen-Extraktion: Soll und Ist

Gemessen am 24.08.2026 an `__fixtures__/tabellen-pdf.pdf` — der Datenschutzerklärung
(Stand 09.07.2026, 8 Seiten, text-natives PDF mit drei Tabellen). Anlass war eine
Chat-Antwort, die Tabellenzeilen mit zerhackten Beschriftungen zitierte
(„KI **-** Anfragen", „Server **-** Logs").

Maßstab ist die Tabelle „Übersicht der wichtigsten Speicherfristen": **8 Zeilen ×
2 Spalten = 16 Zellen**, festgehalten in [`expectedTable.ts`](./expectedTable.ts).
Gezählt wird, wie viele davon **wortgetreu** im extrahierten Text stehen.

## Ist-Stand

Die Spalte „wo im Produkt" nennt den Stand **am Messtag** — #2828 hat die letzten
beiden Zeilen seither getauscht (siehe „Was daraus folgt").

| Weg                                 | wo im Produkt (24.08.2026)                                | Zeichen | Zellen wortgetreu |
| ----------------------------------- | --------------------------------------------------------- | ------: | ----------------: |
| PDF.js direkt                       | Indizierung → **Qdrant-Chunks** → alles, was zitiert wird |  18 601 |       **10 / 16** |
| Mistral OCR, `tableFormat: 'html'`  | Chat-Anhang → Zusammenfassung                             |  16 219 |        **3 / 16** |
| Mistral OCR, **ohne** `tableFormat` | — nirgends                                                |  17 871 |       **16 / 16** |

Beide zum Messzeitpunkt produktiv genutzten Wege verlieren die Tabelle; der Weg, der
sie vollständig liefert, wurde nirgends benutzt. #2828 hat das für Chat-Anhänge
gedreht — siehe „Was daraus folgt".

### PDF.js: 10 von 16 — und die Regel dahinter ist exakt

pdfjs gibt jeden Binde- und Gedankenstrich als **eigenes Text-Item** aus.
`pdfOperations.ts` setzt die Items mit `.join(' ')` zusammen. Daraus folgt
zellenweise, ohne Ausnahme:

> Zelle **mit** Strich → zerlegt. Zelle **ohne** Strich → wortgetreu.

Sechs der sechzehn Zellen enthalten einen Strich, und genau diese sechs fehlen.
Das ist keine Beobachtung an Stichproben, sondern in
[`tableExtraction.vitest.ts`](./tableExtraction.vitest.ts) als Zusicherung
festgeschrieben.

Zwei weitere Schäden desselben Ursprungs:

- **Gesperrt gesetzte Spaltenköpfe werden buchstabenweise zerlegt.** Aus
  `Datenart  Speicherdauer` wird `D a t e n a r t   S p e i c h e r d a u e r`.
  Kein Volltextfilter und keine Einbettung erkennt das wieder — die Tabelle hat
  im Index effektiv keine Überschrift.
- **Wörter brechen an Layout-Umbrüchen auf**: `Dat en`, `Missbra uchserkennung`,
  `Zwe i - Faktor - Authentifizierung`.

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

**16 von 16.** Erreicht, indem `tableFormat` schlicht **weggelassen** wird — dann
setzt Mistral OCR die Tabelle inline als Markdown:

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
Tabelle erkennbar.

## Was daraus folgt

Für **Chat-Anhänge erledigt** durch #2828, und zwar auf beiden Ebenen: `tableFormat`
fällt weg (3/16 → 16/16), und der bereits extrahierte OCR-Text wird als `knownText`
an die Indizierung durchgereicht, statt dieselbe Datei ein zweites Mal durch PDF.js
zu schicken. Ein Text pro Datei — derselbe, den das Modell im Anhang liest.

**Offen bleibt der Dokument-Upload außerhalb des Chats.** `processUploadedDocument`
in `fileProcessing.ts` liest die Datei von der Platte neu ein und hat keinen
OCR-Text zur Hand; es ruft `extractTextFromFile` ohne `knownText`, landet über den
Parseability-Check bei PDF.js — und damit wieder bei 10/16. Für diesen Pfad steht
die Abwägung noch aus: PDF.js ist umsonst und schnell (440 ms), OCR kostet und
dauert (1 314 ms).

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

Die Zeichenzahlen 18 601 und 16 219 stimmen mit dem überein, was das Backend im
Betrieb protokolliert — der Nachbau ist also der echte Pfad, keine Annäherung.
`extractWithPdfJs.ts` baut dafür nur die Zusammensetzung nach und importiert den
Formatierungsschritt (`applyMarkdownFormatting`) aus dem Produktionsmodul; auf
dieser Fixture ändert er nichts, siehe die Begründung im Kopf der Datei.
