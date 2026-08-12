# NLP-Service

FastAPI-Dienst mit spaCy (`de_core_news_lg`), der für den Monitor und für
Notizbuch-Dokumente Themen (`themes`, `primary_topic`), Schlagwörter, Emotionen
und Personen (`persons`) bestimmt. Konsumiert wird er über HTTP von
`apps/api/services/nlp/nlpClient.ts`; die Ergebnisse landen in Qdrant-Payloads
und in `notebook_keyword_snapshots`.

## Tests

```bash
cd services/nlp
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
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

`src/topic_classifier/stopword_nouns.txt` und
`src/topic_classifier/person_blocklist.txt` werden von Hand gepflegt, ein
Eintrag pro Zeile, `#` für Kommentare. Beide Dateien liegen bewusst **im
Paketverzeichnis**: das Dockerfile kopiert `src/` als Ganzes: eine Liste
außerhalb davon fehlt im Image und fällt erst beim Containerstart auf.
`tests/test_wordlists.py` prüft beides — das Format und den Ort.

## Betrieb

```bash
pip install -e .
python -m spacy download de_core_news_lg
uvicorn topic_classifier.api:app --reload --port 8000
```
