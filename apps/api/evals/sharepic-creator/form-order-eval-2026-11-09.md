# Welche Form wurde bestellt? — Messung 09.11.2026

Anlass: #5546. Im Studio scheiterte „Insta-Karussell: … bei allen Terminen im Stadtrat …“ bei jedem Versuch mit „Für die Form „Termine“ brauche ich mindestens zwei Termine mit Datum“.

**Ursache:**

- `namedSharepicForm` las den ganzen Auftrag mit einer Wortliste.
- `termine` stand darin vor `karussell`.
- `missingMaterial` brach dann schon vor jedem Modellaufruf ab.

## Was geändert wurde

- **Wer über die Form entscheidet:** `bedarf_melden`, der erste Aufruf des Creators, meldet zusätzlich `form_bestellt` (die eigenen Worte der Person verlangen genau diese Form) und `folien` (`eine` | `mehrere` | `offen`).
- **Fest vorgegeben** wird eine Form nur noch durch Zustand: ein Studio-Chip (`body.form`), eine Vorlage oder der Chat-Chip „Als …“.
  - Den Text des Chat-Chips baut und liest `sharepicAlternativeRequest`/`sharepicAlternativeForm` in `@gruenerator/contracts`.
- **Termine mit nur einem Datum** (oder Wochentag) werden zur Veranstaltung statt zu einer Rückfrage (`formForMaterial`).
- **Entfernt:** `wantsOneSlide` und `alsoCarousel`. `namedSharepicForm` bleibt nur als Prüfung unserer eigenen Vorlagen-Prompts (`vorlageProblems`).

## Messung

- **Messset:** `form-order-cases.jsonl`, 122 Fälle.
  - `o`: erlaubte bestellte Form, `null` heißt „nichts bestellt“.
  - `f`: erlaubte Folienangabe.
  - `r`: der Chat-Wortlaut, wenn er vom Prompt abweicht.
- **Ablauf:** je 2 Läufe mit dem echten `needsPrompt`/`needsCall` (Gemma 4 auf Melious `:speed`, Denken an).
- **Vergleich:** gegen `namedSharepicForm`, `wantsOneSlide` und `alsoCarousel` von master.
- Die Systemprompt-Datei kam aus der öffentlichen Kopie, `INTERN_CONTENT_DIR` war nicht gesetzt.

|                                                                                                    | Modell      | Wortliste (master) |
| -------------------------------------------------------------------------------------------------- | ----------- | ------------------ |
| bestellte Form richtig, gesamt                                                                     | **232/244** | 198/244            |
| Formwort nur im Inhalt („bei allen Terminen“, „im Interview mit der FAZ“, „die Rechnung zahlen“ …) | **62/62**   | 16/62              |
| ausdrücklich bestellte Form (alle 16 Formen, auch mit Tippfehler/Englisch)                         | 65/68       | 68/68              |
| Verneinung, Mischform („Karussell mit Bingo“), Folienzahl, Chat mit Material, alte Testsätze       | 105/106     | 106/106            |
| eine vs. mehrere Folien                                                                            | **119/122** | 114/122            |
| Chat-Chip „Andere Variante als …“                                                                  | 0/8         | 8/8                |

Mediane Dauer von `bedarf_melden`: 5,4 s (p90 9,3 s). Diesen Aufruf gab es vorher schon, er kostet keinen zusätzlichen Aufruf.

**Die Fehlgriffe des Modells:**

- **Chat-Chip:** „Andere Variante“ liest das Modell als Bitte um eine neue Variante und wählt ein Einzelbild. Deshalb ist der Chip jetzt Zustand und geht nicht mehr ans Modell (siehe oben).
- **Bestellt, aber nicht als bestellt gemeldet:** „Ich stell mich vor: …“ (2×) und „Termin-Sharepic: … am 20.11.“ (1×). Die gewählte Form stimmte, es entsteht derselbe Entwurf. Es fehlt nur die Rückfrage bei fehlendem Material.
- **Andere Form gewählt:** „Interview-Sharepic mit Anna: eine Frage, eine Antwort“ wurde 1× als Zitat gebaut.

**Nachgeschärft zwischen v1 und v2:**

- v1 lag bei 160/178. Ein vorangestellter Formname wie „Steckbrief: …“ oder „Save the dates: …“ zählte dort nicht als Bestellung.
- In v2 nennt die Regel diese Form ausdrücklich, und `formCatalog` listet je Form die `stichworte` („bestellt mit: …“).

## Ungeprüft

- **Ganze Entwürfe:** Gemessen wurde nur `bedarf_melden`, nicht der ganze Entwurf. Dass der Entwurf in der bestellten Form gelingt, sichern die Unit-Tests (`draftAgent.formOrder.vitest.ts`) gegen ein gemocktes Modell ab, nicht gegen Gemma.
- **Andere Systemprompt:** Mit der internen Systemprompt-Datei wurde nicht gemessen.
