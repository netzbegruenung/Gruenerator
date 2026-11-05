# Wahlprüfstein-Eval

Echte Fragenkataloge von Verbänden gehen durch den Chat (wie der Paste-Chip des Web-Composers sie schickt), und die Antwort wird gegen die echte Antwort von BÜNDNIS 90/DIE GRÜNEN auf denselben Katalog gemessen. Die Fälle stammen aus den beantworteten Wahlprüfsteinen der Bundesgeschäftsstelle zur Bundestagswahl 2021, zur Europawahl 2024 und zur Bundestagswahl 2025.

## Fälle

Die Kataloge sind Texte Dritter und liegen deshalb im internen Repo, nicht hier: `<INTERN_CONTENT_DIR>/_korpus/wahlpruefsteine/eval/<fall>/` mit

- `question.md` — der Katalog, wie man ihn einfügt (Kontaktdaten entfernt)
- `questions.json` — die Fragen einzeln, `[{ n, text }]`
- `reference.json` — die echte Antwort, `{ title, answers: [{ n, position, answer }] }`
- `meta.json` — Wahl, Verband, Format, Zeichenlimit

Die zwölf Kataloge sind aus der Beispielsammlung `wahlpruefstein_examples` ausgenommen (`scripts/ingest-wahlpruefstein-examples.ts`), sonst fände das Beispielwerkzeug die Musterlösung.

## API starten

```bash
cd apps/api && PORT=3031 INTERN_CONTENT_DIR=<pfad> HOCUSPOCUS_ENABLED=false pnpm start
```

Der Runner liest `DEV_AUTH_BYPASS_TOKEN` aus `apps/api/.env`. Nach einer Änderung am Rezept die API neu starten — die Rezepte werden beim ersten Zugriff gecacht.

## Ausführen

```bash
npx tsx apps/api/evals/wahlpruefstein/runWpsEval.ts --mode agent --agent gruenerator-wahlpruefsteine
npx tsx apps/api/evals/wahlpruefstein/runWpsEval.ts --mode rezept            # Standard-Chat + @wahlpruefstein
npx tsx apps/api/evals/wahlpruefstein/runWpsEval.ts --mode plain             # Standard-Chat ohne Rezept
npx tsx apps/api/evals/wahlpruefstein/runWpsEval.ts --mode agent --agent gruenerator-wahlpruefsteine --case ew24-evg-verkehr
```

Ausgabe nach `results/<Datum-Uhrzeit>-<modus>/` (nicht eingecheckt): je Fall die Antwort (`.md`) und der SSE-Strom ohne Textdeltas (`.sse.txt`), dazu `summary.json` und `summary.md`. Der Runner legt den Thread jedes Falls danach in den Papierkorb — sonst holt der proaktive Rückgriff auf frühere Chats die Antwort eines Laufs in den nächsten Lauf desselben Katalogs.

## Kennzahlen

| Kennzahl          | Bedeutung                                                                                                                           | gut                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| beantwortet       | Fragen, unter denen mindestens fünf Wörter Antwort stehen. Gefunden wird jede Frage über ihre ersten sieben Wörter oder ihre Nummer | alle                    |
| Ø-Wörter KI/Ref   | Median der Wörter je Antwort, gegen die echte Antwort                                                                               | ähnlich                 |
| über Limit        | Antworten über dem Zeichenlimit des Katalogs                                                                                        | 0                       |
| Bund-Titel        | erste Zeile „Antworten auf die Wahlprüfsteine …"                                                                                    | `true` bei Bund/Europa  |
| Freigabe/Kontakt  | Freigabevermerk oder Kontaktzeile — gehört nur zu Landesverbänden                                                                   | `false` bei Bund/Europa |
| Stern/Doppelpunkt | Genderzeichen in den Antworten                                                                                                      | kein Doppelpunkt        |
| Wir-Anteil KI/Ref | Antworten mit `wir`/`uns`/`unser`                                                                                                   | ähnlich                 |
| Schlussfrage      | Nachricht endet mit Rückfrage oder Angebot des Modells; das Dokument-Angebot des Systems zählt nicht                                | `false`                 |
| Werkzeuge         | aufgerufene Werkzeuge                                                                                                               | Suche dabei             |

Stil, Haltung und erfundene Positionen misst keine Zahl: dafür die `.md` neben `reference.json` lesen. Die Ausgabe des Modells schwankt — Läufe miteinander vergleichen, nicht einzelne Werte bewerten.
