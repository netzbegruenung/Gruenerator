"""Topic scoring and keyword extraction on hand-annotated Docs."""

import pytest

from topic_classifier.constants import TITLE_WEIGHT


def noun_doc(make_doc, words: list[str], lemmas: list[str] | None = None):
    """Doc in which every token is a noun — the only POS the scorer looks at."""
    return make_doc(words, lemmas=lemmas or [w.lower() for w in words], pos=["NOUN"] * len(words))


def classify(classifier_over, docs, items):
    return classifier_over(docs).classify_batch(items)


class TestScoring:
    def test_scores_are_per_mille_of_counted_nouns(self, classifier_over, make_doc):
        # Two nouns, one of them topical → 1/2 * 1000.
        docs = [noun_doc(make_doc, ["Rente", "Tisch"])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["topics"]["soziales"] == 500.0

    def test_primary_topic_is_the_highest_scoring_one(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Rente", "Rente", "Bahnhof"])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["primaryTopic"] == "soziales"

    def test_multi_label_terms_score_every_topic_they_carry(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Klimaschutz"])]
        topics = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])[0][
            "topics"
        ]
        # klimaschutz → klima 1.0 + wirtschaft 0.4, both on one noun.
        assert topics["klima"] == 1000.0
        assert topics["wirtschaft"] == 400.0

    def test_uncategorized_text_yields_no_topics(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Tisch", "Stuhl"])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["topics"] == {}
        assert result[0]["primaryTopic"] is None

    def test_document_without_usable_nouns_survives(self, classifier_over, make_doc):
        # No division by zero, and the id still comes back so the caller can
        # match results to inputs.
        docs = [make_doc(["und", "der"], pos=["CCONJ", "DET"])]
        result = classify(classifier_over, docs, [{"id": "leer", "title": "", "text": ""}])
        assert result[0] == {
            "id": "leer",
            "topics": {},
            "primaryTopic": None,
            "topNouns": [],
            "emotionScores": {},
        }


class TestHeadlineWeighting:
    def test_title_nouns_count_more_than_body_nouns(self, classifier_over, make_doc):
        # The Doc is "<title> <body>"; title_end is the title's character length,
        # so the first token falls inside it and the second does not.
        title = "Rente"
        docs = [noun_doc(make_doc, ["Rente", "Bahnhof"])]
        in_title = classify(
            classifier_over, docs, [{"id": "a", "title": title, "text": "Bahnhof"}]
        )[0]["topics"]["soziales"]

        docs = [noun_doc(make_doc, ["Rente", "Bahnhof"])]
        in_body = classify(classifier_over, docs, [{"id": "a", "title": "", "text": "…"}])[0][
            "topics"
        ]["soziales"]

        assert in_title == pytest.approx(in_body * TITLE_WEIGHT)


class TestNounFilters:
    @pytest.mark.parametrize(
        "lemma",
        [
            "de",  # shorter than 3 characters
            "2026",  # pure digits
            "g20",  # contains a digit
        ],
    )
    def test_rejected_lemmas_are_not_counted(self, classifier_over, make_doc, lemma):
        docs = [noun_doc(make_doc, ["Rente", "X"], lemmas=["rente", lemma])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        # Only "rente" counts, so it is 1/1 rather than 1/2.
        assert result[0]["topics"]["soziales"] == 1000.0

    def test_stopword_nouns_are_not_counted(self, classifier_over, make_doc):
        from topic_classifier.analyzer import STOPWORD_NOUNS

        stopword = next(w for w in sorted(STOPWORD_NOUNS) if len(w) >= 3 and w.isalpha())
        docs = [noun_doc(make_doc, ["Rente", "X"], lemmas=["rente", stopword])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["topics"]["soziales"] == 1000.0

    def test_only_nouns_are_counted(self, classifier_over, make_doc):
        docs = [
            make_doc(
                ["Rente", "sinkt"],
                lemmas=["rente", "sinken"],
                pos=["NOUN", "VERB"],
            )
        ]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["topics"]["soziales"] == 1000.0


class TestTopNouns:
    def test_top_nouns_are_ranked_by_frequency(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Rente", "Rente", "Bahnhof"])]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert result[0]["topNouns"][0] == {"noun": "rente", "count": 2}

    def test_top_nouns_are_capped_at_ten(self, classifier_over, make_doc):
        # Lemmas must be digit-free — the scorer drops anything containing one.
        lemmas = [f"wort{chr(97 + i)}" for i in range(15)]
        docs = [noun_doc(make_doc, [w.capitalize() for w in lemmas], lemmas=lemmas)]
        result = classify(classifier_over, docs, [{"id": "a", "title": "", "text": ""}])
        assert len(result[0]["topNouns"]) == 10


class TestKeywords:
    def test_counts_are_aggregated_across_documents(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Rente", "Tisch"]), noun_doc(make_doc, ["Rente", "Stuhl"])]
        items = [{"id": "a", "title": "", "text": ""}, {"id": "b", "title": "", "text": ""}]
        keywords = classifier_over(docs).extract_keywords_batch(items)
        assert keywords[0] == {"keyword": "rente", "count": 2, "topic": "soziales"}

    def test_uncategorized_keywords_carry_no_topic(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, ["Tisch"])]
        keywords = classifier_over(docs).extract_keywords_batch(
            [{"id": "a", "title": "", "text": ""}]
        )
        assert keywords == [{"keyword": "tisch", "count": 1, "topic": None}]

    def test_honours_top_n(self, classifier_over, make_doc):
        docs = [noun_doc(make_doc, [f"Wort{i}" for i in range(8)], lemmas=[f"wort{chr(97 + i)}" for i in range(8)])]
        keywords = classifier_over(docs).extract_keywords_batch(
            [{"id": "a", "title": "", "text": ""}], top_n=3
        )
        assert len(keywords) == 3
