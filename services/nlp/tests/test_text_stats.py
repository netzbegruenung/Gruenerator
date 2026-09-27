"""Text statistics for `notebook_quellen action="stats"`.

`compute_text_stats` consumes a spaCy `Doc`, so the tests build the Docs by
hand (see `conftest.py`) and state exactly which lemmas and POS tags the
pipeline "recognized". The endpoint test drives `/analyze/text-stats` through
a classifier whose pipeline yields those Docs.
"""

import pytest
from fastapi.testclient import TestClient

from topic_classifier import api
from topic_classifier.text_stats import compute_text_stats


@pytest.fixture
def klima_doc(make_doc):
    # "Die Klimaziele gelten . Klimaziele schützen 2 Wälder ."
    return make_doc(
        ["Die", "Klimaziele", "gelten", ".", "Klimaziele", "schützen", "2", "Wälder", "."],
        lemmas=["der", "Klimaziel", "gelten", ".", "Klimaziel", "schützen", "2", "Wald", "."],
        pos=["DET", "NOUN", "VERB", "PUNCT", "NOUN", "VERB", "NUM", "NOUN", "PUNCT"],
    )


class TestCounts:
    def test_counts_tokens_words_and_sentences(self, klima_doc):
        stats = compute_text_stats(klima_doc, top_n=50, lemma_of=[])
        assert stats["tokens"] == 9
        # Words are alphabetic or number-like — the "2" counts, the dots do not.
        assert stats["words"] == 7
        assert stats["sentences"] == 2

    def test_ignores_whitespace_tokens(self, make_doc):
        doc = make_doc(
            ["Wald", "\n\n", "Wiese"], spaces=[False, False, False], pos=["NOUN", "SPACE", "NOUN"]
        )
        stats = compute_text_stats(doc, top_n=50, lemma_of=[])
        assert stats["tokens"] == 2
        assert stats["words"] == 2

    def test_uses_parsed_sentence_boundaries_when_present(self, vocab):
        from spacy.tokens import Doc

        doc = Doc(
            vocab,
            words=["Wald", "wächst", "Wiese", "blüht"],
            sent_starts=[True, False, True, False],
        )
        assert compute_text_stats(doc, top_n=50, lemma_of=[])["sentences"] == 2

    def test_counts_a_trailing_sentence_without_final_punctuation(self, make_doc):
        doc = make_doc(["Wald", "wächst", ".", "Wiese", "blüht"])
        assert compute_text_stats(doc, top_n=50, lemma_of=[])["sentences"] == 2

    def test_empty_text(self, make_doc):
        stats = compute_text_stats(make_doc([]), top_n=50, lemma_of=["wald"])
        assert stats == {
            "tokens": 0,
            "words": 0,
            "sentences": 0,
            "lemmas": [],
            "forms": {"wald": []},
        }


class TestLemmas:
    def test_ranks_content_lemmas_lowercased(self, klima_doc):
        stats = compute_text_stats(klima_doc, top_n=50, lemma_of=[])
        assert stats["lemmas"][0] == {"lemma": "klimaziel", "pos": "NOUN", "count": 2}
        lemmas = {entry["lemma"] for entry in stats["lemmas"]}
        assert lemmas == {"klimaziel", "gelten", "schützen", "wald"}

    def test_drops_determiners_numbers_punctuation_and_stopwords(self, make_doc):
        # "sehr" is an ADV but a German stop word; "Die" is a DET.
        doc = make_doc(
            ["Die", "sehr", "grüne", "Stadt", "."],
            lemmas=["der", "sehr", "grün", "Stadt", "."],
            pos=["DET", "ADV", "ADJ", "PROPN", "PUNCT"],
        )
        lemmas = [e["lemma"] for e in compute_text_stats(doc, top_n=50, lemma_of=[])["lemmas"]]
        assert lemmas == ["grün", "stadt"]

    def test_cuts_to_top_n(self, klima_doc):
        stats = compute_text_stats(klima_doc, top_n=1, lemma_of=[])
        assert stats["lemmas"] == [{"lemma": "klimaziel", "pos": "NOUN", "count": 2}]


class TestForms:
    def test_counts_surface_forms_of_a_requested_lemma(self, make_doc):
        doc = make_doc(
            ["Der", "Wald", "und", "die", "Wälder", "des", "Waldes", "Wälder"],
            lemmas=["der", "Wald", "und", "der", "Wald", "der", "Wald", "Wald"],
            pos=["DET", "NOUN", "CCONJ", "DET", "NOUN", "DET", "NOUN", "NOUN"],
        )
        stats = compute_text_stats(doc, top_n=50, lemma_of=["WALD"])
        assert stats["forms"] == {
            "WALD": [
                {"form": "Wälder", "count": 2},
                {"form": "Wald", "count": 1},
                {"form": "Waldes", "count": 1},
            ]
        }

    def test_two_spellings_of_one_lemma_both_get_the_forms(self, make_doc):
        doc = make_doc(["Wälder"], lemmas=["Wald"], pos=["NOUN"])
        stats = compute_text_stats(doc, top_n=50, lemma_of=["Wald", "wald"])
        assert stats["forms"] == {
            "Wald": [{"form": "Wälder", "count": 1}],
            "wald": [{"form": "Wälder", "count": 1}],
        }

    def test_a_lemma_that_does_not_occur_has_no_forms(self, klima_doc):
        assert compute_text_stats(klima_doc, top_n=50, lemma_of=["mond"])["forms"] == {"mond": []}


class TestEndpoint:
    def test_returns_one_result_per_text_with_its_id(self, classifier_over, klima_doc, monkeypatch):
        monkeypatch.setattr(api, "classifier", classifier_over([klima_doc]))
        response = TestClient(api.app).post(
            "/analyze/text-stats",
            json={"texts": [{"id": "d1", "text": "egal"}], "top_n": 1, "lemma_of": ["wald"]},
        )
        assert response.status_code == 200
        assert response.json() == {
            "results": [
                {
                    "id": "d1",
                    "tokens": 9,
                    "words": 7,
                    "sentences": 2,
                    "lemmas": [{"lemma": "klimaziel", "pos": "NOUN", "count": 2}],
                    "forms": {"wald": [{"form": "Wälder", "count": 1}]},
                }
            ]
        }

    def test_returns_no_results_while_the_model_loads(self, monkeypatch):
        monkeypatch.setattr(api, "classifier", None)
        response = TestClient(api.app).post(
            "/analyze/text-stats", json={"texts": [{"id": "d1", "text": "Wald"}]}
        )
        assert response.json() == {"results": []}
