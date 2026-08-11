"""HTTP contract of the FastAPI service.

The Express side (`apps/api/services/nlp/nlpClient.ts`) parses these response
shapes by hand, so field names and nesting here are a wire contract: renaming
`primaryTopic` or moving `persons` out of its wrapper object breaks notebook
enrichment at runtime with no type error anywhere.

`TestClient` is deliberately NOT used as a context manager — that would run the
lifespan handler and load the 610 MB production model. Without it the module
level `classifier` stays None, which each test then sets to what it needs.
"""

import pytest
from fastapi.testclient import TestClient

from topic_classifier import api
from topic_classifier.lexicons import TopicCategory


class StubClassifier:
    """Records what it was called with and returns canned results."""

    is_ready = True

    def __init__(self):
        self.calls: list[tuple[str, list[dict], int | None]] = []

    def classify_batch(self, texts):
        self.calls.append(("classify", texts, None))
        return [
            {
                "id": t["id"],
                "topics": {"klima": 500.0},
                "primaryTopic": "klima",
                "topNouns": [{"noun": "klimaschutz", "count": 2}],
                "emotionScores": {"hoffnung": 12.5},
            }
            for t in texts
        ]

    def extract_keywords_batch(self, texts, top_n=50):
        self.calls.append(("keywords", texts, top_n))
        return [{"keyword": "klimaschutz", "count": 2, "topic": "klima"}]

    def extract_persons_batch(self, texts, top_n=20):
        self.calls.append(("persons", texts, top_n))
        return [{"person": "Annalena Baerbock", "count": 3}]


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def stub(monkeypatch):
    stub = StubClassifier()
    monkeypatch.setattr(api, "classifier", stub)
    return stub


@pytest.fixture
def no_classifier(monkeypatch):
    """Service state before the model has finished loading."""
    monkeypatch.setattr(api, "classifier", None)


class TestHealth:
    def test_reports_ok_once_the_classifier_is_ready(self, client, stub):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["model"] == "de_core_news_lg"
        assert body["topics"] == len(TopicCategory)

    def test_reports_loading_before_the_model_is_ready(self, client, no_classifier):
        # The Docker HEALTHCHECK only asserts HTTP 200, so this stays 200 while
        # loading — the distinction lives in the body.
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "loading"


class TestTopicsEndpoint:
    def test_serves_display_info_for_every_category(self, client):
        body = client.get("/topics").json()
        assert set(body) == {c.value for c in TopicCategory}
        assert body["klima"]["name"] and body["klima"]["color"]

    def test_analyze_topics_returns_the_full_result_shape(self, client, stub):
        response = client.post(
            "/analyze/topics",
            json={"texts": [{"id": "doc-1", "title": "Klima", "text": "Klimaschutz"}]},
        )
        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result == {
            "id": "doc-1",
            "topics": {"klima": 500.0},
            "primaryTopic": "klima",
            "topNouns": [{"noun": "klimaschutz", "count": 2}],
            "emotionScores": {"hoffnung": 12.5},
        }

    def test_passes_title_and_text_through_to_the_classifier(self, client, stub):
        client.post(
            "/analyze/topics",
            json={"texts": [{"id": "doc-1", "title": "Titel", "text": "Fließtext"}]},
        )
        assert stub.calls[0][1] == [{"id": "doc-1", "title": "Titel", "text": "Fließtext"}]

    def test_title_and_text_are_optional(self, client, stub):
        response = client.post("/analyze/topics", json={"texts": [{"id": "doc-1"}]})
        assert response.status_code == 200
        assert stub.calls[0][1] == [{"id": "doc-1", "title": "", "text": ""}]

    def test_missing_id_is_rejected(self, client, stub):
        response = client.post("/analyze/topics", json={"texts": [{"title": "ohne id"}]})
        assert response.status_code == 422


class TestKeywordsEndpoint:
    def test_returns_keyword_entries(self, client, stub):
        response = client.post(
            "/analyze/keywords",
            json={"texts": [{"id": "doc-1", "text": "Klimaschutz"}], "top_n": 5},
        )
        assert response.json() == {
            "keywords": [{"keyword": "klimaschutz", "count": 2, "topic": "klima"}]
        }

    def test_top_n_reaches_the_classifier(self, client, stub):
        client.post("/analyze/keywords", json={"texts": [{"id": "a"}], "top_n": 7})
        assert stub.calls[0][2] == 7

    def test_top_n_defaults_to_fifty(self, client, stub):
        client.post("/analyze/keywords", json={"texts": [{"id": "a"}]})
        assert stub.calls[0][2] == 50


class TestPersonsEndpoint:
    def test_returns_person_entries(self, client, stub):
        response = client.post("/analyze/persons", json={"texts": [{"id": "doc-1"}]})
        assert response.json() == {"persons": [{"person": "Annalena Baerbock", "count": 3}]}

    def test_top_n_reaches_the_classifier(self, client, stub):
        client.post("/analyze/persons", json={"texts": [{"id": "a"}], "top_n": 3})
        assert stub.calls[0][2] == 3

    def test_top_n_defaults_to_twenty(self, client, stub):
        client.post("/analyze/persons", json={"texts": [{"id": "a"}]})
        assert stub.calls[0][2] == 20


class TestDegradationWhileLoading:
    """Every analyze endpoint answers 200 with an empty result, not an error.

    Worth pinning because it is a trap as much as a feature: the caller cannot
    tell "model still loading" from "nothing found". `enrichCollection` handles
    exactly this by counting an empty batch as an NLP failure and writing no
    tags — an empty response must therefore never be mistaken for a result.
    """

    @pytest.mark.parametrize(
        ("path", "key"),
        [
            ("/analyze/topics", "results"),
            ("/analyze/keywords", "keywords"),
            ("/analyze/persons", "persons"),
        ],
    )
    def test_returns_empty_instead_of_failing(self, client, no_classifier, path, key):
        response = client.post(path, json={"texts": [{"id": "doc-1", "text": "irgendwas"}]})
        assert response.status_code == 200
        assert response.json() == {key: []}
