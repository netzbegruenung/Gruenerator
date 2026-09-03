# NLP-Service

FastAPI-Dienst mit spaCy (`de_core_news_lg`), der für den Monitor und für
Notebook-Dokumente Themen (`themes`, `primary_topic`), Schlagwörter, Emotionen
und Personen (`persons`) bestimmt. Konsumiert wird er über HTTP von
`apps/api/services/nlp/nlpClient.ts`; die Ergebnisse landen in Qdrant-Payloads
und in `notebook_keyword_snapshots`.

## Tests

```bash
cd services/nlp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt -e ".[dev]"
pytest
```

Läuft in unter einer Sekunde und braucht **kein** spaCy-Modell. Der Grund steht
in `tests/conftest.py`: die Zähl-, Filter- und Blocklisten-Logik in
`analyzer.py` verarbeitet spaCy-`Doc`-Objekte, ihr ist egal, welches Modell sie
erzeugt hat. Die Tests bauen die Docs deshalb von Hand — mit gesetzten Lemmata,
POS-Tags und Entitäten. Damit prüft ein Test für die Personen-Blockliste die
Blockliste und nicht die Tagesform eines statistischen Modells.

Ein kleiner Teil braucht doch eine geladene Pipeline (`tests/test_pipeline_model.py`,
Marker `model`): dass die Komponentennamen in `select_pipes(enable=[…])` noch zu
einem echten Modell passen (sonst stirbt der Dienst beim Start), und dass die
Lemmatisierung überhaupt feuert (sonst fallen alle Scores still gegen null).
Ohne installiertes Modell überspringt sich dieser Teil selbst:

```bash
python -m spacy download de_core_news_sm   # ~15 MB, reicht für die Modell-Tests
pytest -m model
```

`de_core_news_lg` (~610 MB, das Produktionsmodell) wird bevorzugt, wenn es
installiert ist — die Tests nehmen, was da ist. Die CI installiert das kleine
Modell, weil dort Verdrahtung geprüft wird, nicht Modellqualität.

## Wortlisten

Drei Dateien unter `src/topic_classifier/`, von Hand gepflegt, ein Eintrag pro
Zeile, `#` für Kommentare:

| Datei                    | Wirkung                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stopword_nouns.txt`     | Lemmata, die nicht als Schlagwort zählen                                                                                                                                              |
| `person_blocklist.txt`   | Kandidat ist **keine Person** — der ganze Treffer fällt weg. Ein Eintrag greift, sobald er als vollständige Tokenfolge im Namen vorkommt (`unsplash` nimmt „Unsplash Gemeinsame" mit) |
| `person_stop_tokens.txt` | Der Name **endet vor** diesem Wort. Einzelne Tokens, für Funktionen („Landesvorsitzende"), Organisationsteile und Adressbestandteile aus PDF-Briefköpfen                              |

Alle drei liegen bewusst **im Paketverzeichnis**: das Dockerfile kopiert `src/`
als Ganzes, eine Liste außerhalb davon fehlt im Image und fällt erst beim
Containerstart auf. `tests/test_wordlists.py` prüft Format und Ort.

## Personen-Erkennung

`extract_persons_batch` liefert nicht die rohen PER-Spannen der NER — die sind
als Filter-Facette unbrauchbar. Gemessen an den Live-Payloads in Qdrant standen
dort „Werner Graf Landesvorsitzende Wahlprüfsteine" (673 Dokumente),
„Dieter Grü- newald" neben „Dieter Grünewald", „Putins" neben „Putin",
„Merz" neben „Friedrich Merz", und ein Drittel des getaggten Volumens waren
Ein-Wort-Treffer wie „Link" (1938 Dokumente) oder „Messlatte".

Vier Durchgänge, in dieser Reihenfolge:

1. **Spanne beschneiden** (`_name_from_entity`) — Titel und Rollen fallen weg,
   über `person_stop_tokens.txt` und über die Wortarten. Beides ist nötig:
   dasselbe Wort taggt das Modell im selben Dokument einmal als `ADJ` und
   einmal als `PROPN`.
2. **Schreibweise normalisieren** (`_normalize_surface`) — Silbentrennung aus
   PDFs zusammenziehen, Satzzeichen an den Rändern abschneiden.
3. **Blockliste** (`_is_blocked`).
4. **Varianten zusammenführen** (`_canonical_names`) — Genitiv auf die
   Grundform, bloßer Nachname auf den einen dazu passenden Vollnamen.
   Mehrdeutige („Wegner" gibt es als Jutta und als Kai) werden nicht geraten.
   Was danach noch ein einzelnes Wort ist, fällt weg.

Änderungen hier wirken **nur auf neu getaggte Dokumente**. Die bereits
geschriebenen Payloads tragen `nlp_version`; erst ein Hochzählen von
`NLP_VERSION` in `apps/api/services/notebook/notebookEnrichmentService.ts`
macht sie wieder fällig.

## Betrieb

```bash
pip install -r requirements.txt -e .
python -m spacy download de_core_news_lg
uvicorn topic_classifier.api:app --reload --port 8000
```
