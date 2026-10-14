# Notebook-Modelle und -Tiefe — 2026-10-06

23 Fragen an 8 LV-Notebooks (BY, BE, HE, TH, BB, MV, LSA, SL) und die Grünen
Österreich, je drei Arten: Fakt, Position, Überblick über mehrere Dokumente.
Gefahren über den Produktions-Stream (`handleNotebookStream`, Tiefe `deep`,
Modell ausdrücklich gesetzt wie auf den Notebook-Seiten, also Mistral mit
Denken). Skript: `modelEval.ts`. HH, SH und SN fehlen: ihre Notebooks haben in
`landesverbaende_documents` keine Punkte (bewusst deaktiviert, siehe #3831).

Varianten:

| Variante      | Modell                                  | Kandidaten → Passagen |
| ------------- | --------------------------------------- | --------------------- |
| `medium35`    | Mistral Medium 3.5 (Ultra bis 06.10.)   | 40 → 18               |
| `gemma`       | Gemma 4 31B (Mittel)                    | 40 → 18               |
| `large4`      | Mistral Large 4, Public Preview (#4192) | 40 → 18               |
| `gemma-wide`  | Gemma 4 31B                             | 100 → 100             |
| `large4-wide` | Mistral Large 4                         | 100 → 100             |

100 ist die Decke der Qdrant-Suche je Abfrage (`limit must be between 1 and
100`). 100 Passagen sind rund 40k Tokens — das 1M- bzw. 524k-Fenster von
Large 4 spielt im Notebook-Pfad keine Rolle, Gemmas 131k reichen.

## Wartezeit (Median, 3 Anfragen parallel)

| Variante      | erstes Denken | erster Antworttext | fertig |
| ------------- | ------------- | ------------------ | ------ |
| `medium35`    | 2 s           | 26 s               | 36 s   |
| `gemma`       | 2 s           | 27 s               | 57 s   |
| `large4`      | 1 s           | 59 s               | 106 s  |
| `large4-wide` | 4 s           | 63 s               | 108 s  |
| `gemma-wide`  | –             | –                  | ~100 s |

`gemma-wide`: 14 Antworten bei 3 parallel, Rest bei 12 parallel; beide Läufe
liegen bei ~100 s. Large 4 am ersten Preview-Tag gemessen.

## Paarvergleiche (blind, A/B zufällig)

Richter: Claude-Subagenten (dritte Modellfamilie), Rubrik wie
`judgeAnswers.ts` plus Lesbarkeit. Sie sahen Antworten und Quellentitel.

| Vergleich                     | Ergebnis (Sieg : Unentschieden : Sieg) |
| ----------------------------- | -------------------------------------- |
| `gemma-wide` vs `gemma`       | **22** : 1 : 0                         |
| `large4-wide` vs `large4`     | **20** : 2 : 1                         |
| `gemma-wide` vs `large4-wide` | **14** : 1 : 8                         |
| `large4` vs `gemma`           | 7 : 7 : **9**                          |
| `gemma` vs `medium35`         | **18** : 2 : 3                         |
| `large4` vs `medium35`        | **19** : 2 : 2                         |

„Fehlt Wichtiges": `gemma` 16/23, `large4` 17/23 — mit 100 Passagen 2/23
bzw. 1–2/23. Lesbarkeit (0–3): Gemma 2,7–2,9, Large 4 2,0–2,8, Medium 2,0.
Medium 3.5 stapelt bis zu 14 Belege an einen Satz und lässt Gliederungsreste
(`### ##`) stehen.

## Quellentreue

828 Aussagen (bis zu 8 je Antwort, Zufallsauswahl) gegen die Quellstelle
(`cited_text`) ihrer `[cite:n]`-Marken geprüft:

| Variante      | gedeckt | teilweise | nicht gedeckt |
| ------------- | ------- | --------- | ------------- |
| `medium35`    | 79,6 %  | 20,4 %    | 0,0 %         |
| `gemma`       | 61,1 %  | 37,1 %    | 1,8 %         |
| `gemma-wide`  | 65,9 %  | 33,5 %    | 0,6 %         |
| `large4`      | 48,5 %  | 50,3 %    | 1,2 %         |
| `large4-wide` | 44,6 %  | 54,9 %    | 0,6 %         |

Frei Erfundenes ist überall selten. „Teilweise" ist verzerrt und kein Ranking:
das Quelldatum steht im Prompt (`(Datum: …)`, NotebookQAService), nicht in
`cited_text`, und der Prüfer sah höchstens drei Belege je Aussage — Large 4
setzt im Schnitt ~6 je Zeile, Medium ~4.

## Folgerung

- Der Hebel ist die Tiefe, nicht das Modell: `deep` und `ultra` stehen seit
  diesem Lauf auf 100 Kandidaten/Passagen (`notebookDepthProfiles.ts`). Der
  notebook-gebundene Chat behält 40/18 (`getChatNotebookProfile`), weil sein
  Prompt höchstens `MAX_SOURCES` Quellen trägt.
- Bei voller Tiefe sind Gemma und Large 4 inhaltlich gleichauf; Gemma liest
  sich besser, ist keine Preview und hängt nicht am Mistral-Kontingent. Die
  Notebook-Vorgabe „Automatisch" ist deshalb Mittel (`resolveAutoModel`).
- Preis: ~100 s statt ~36 s (Medium) bis zur fertigen Antwort. Eine Zwischentiefe
  (z. B. 60) ist nicht gemessen.
