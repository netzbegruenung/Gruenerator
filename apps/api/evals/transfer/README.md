# Übertragungs-Eval (Leichte und Einfache Sprache)

Prüft die Chat-Agents `gruenerator-leichte-sprache` und `gruenerator-einfache-sprache` an echten, öffentlichen Seitentexten (samt Navigations-Müll, wie ihn Nutzer*innen einfügen). Der Runner schickt jeden Text so, wie der Paste-Chip des Web-Composers es tut, liest den SSE-Strom und holt das Prüfprotokoll-Dokument (`document_created`) über `GET /api/docs/:id`.

## API starten

```bash
cd apps/api && PORT=3031 pnpm dev
```

`INTERN_CONTENT_DIR` ist für diese beiden Agents nicht nötig. Der Runner liest `DEV_AUTH_BYPASS_TOKEN` aus `apps/api/.env`.

## Ausführen

```bash
npx tsx apps/api/evals/transfer/runTransferEval.ts                    # alle Fälle, nacheinander
npx tsx apps/api/evals/transfer/runTransferEval.ts --agent ls         # nur Leichte Sprache
npx tsx apps/api/evals/transfer/runTransferEval.ts --case at-stvo-es  # ein Fall
npx tsx apps/api/evals/transfer/runTransferEval.ts --base http://localhost:3031
```

Ausgabe nach `results/<Datum-Uhrzeit>/` (nicht eingecheckt): je Fall `.final.md`, `.protocol.md`, `.sse.txt`, dazu `summary.json` und `summary.md`.

## Fälle

`cases.ts` listet Fall, Agent, Fixture, Quell-URL und Abrufdatum. Die Fixtures sind unbearbeitet abgerufen (HTML zu Text, Navigation bleibt drin). Der lange Fall (`lang-geschichte-ls`, ca. 96.000 Zeichen) prüft die abschnittsweise Übertragung; ein Beschluss-Text war nicht auffindbar, daher die Geschichtsseite von gruene.de.

## Kennzahlen

| Kennzahl                                         | Bedeutung                                                                                                                                                                                                    | gut                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Urteil / Runden                                  | Kopf des Prüfprotokolls                                                                                                                                                                                      | `FREIGABE`, wenige Runden              |
| numberRecall                                     | Anteil der Zahlen (ab 2 Ziffern) des Originals, die im Ergebnis stehen; `10.500`, `10 500`, `10500` gelten gleich. Das Original enthält auch Seiten-Zahlen (Datum, Navigation), deshalb nie genau 1 erwarten | nahe 1                                 |
| Verhältnis                                       | Länge Ergebnis / Original; Navigation im Original drückt es                                                                                                                                                  | nur im Vergleich zwischen Läufen lesen |
| Schlussangebot                                   | Nachricht endet in einer Frage („Soll ich daraus ein Sharepic machen?")                                                                                                                                      | `false`                                |
| Visual-Fence                                     | Block wie ` ```chart ` in der Nachricht                                                                                                                                                                      | `false`                                |
| Spur in Nachricht                                | „Prüfbericht", „Rückübersetzung" oder „Abdeckungstabelle" in der Nachricht                                                                                                                                   | `false`                                |
| Ø Wörter/Satz, Anteil > 12 (nur Leichte Sprache) | Satzlänge ohne Überschriften und Statuszeile                                                                                                                                                                 | Ø ≤ ca. 8 bis 10                       |

Die Ausgabe des Modells schwankt. Läufe miteinander vergleichen (vorher/nachher), nicht einzelne Werte bewerten.
