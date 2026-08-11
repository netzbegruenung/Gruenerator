"""Emotion scoring: negation window, headline weighting, per-mille scale."""

import pytest

from topic_classifier.constants import TITLE_WEIGHT
from topic_classifier.emotion_analyzer import NEGATION_WORDS, EmotionAnalyzer
from topic_classifier.emotion_lexicons import EMOTION_LEXICONS, EmotionCategory


@pytest.fixture
def analyzer():
    return EmotionAnalyzer()


@pytest.fixture(scope="module")
def hope_word():
    """A term the lexicon scores as hope, taken from the lexicon itself."""
    return next(w for w in sorted(EMOTION_LEXICONS[EmotionCategory.HOFFNUNG]) if len(w) >= 3)


class TestScoring:
    def test_scores_are_per_mille_of_all_words(self, analyzer, make_doc, hope_word):
        doc = make_doc([hope_word, "Tisch"], lemmas=[hope_word, "tisch"])
        assert analyzer.analyze(doc)["hoffnung"] == 500.0

    def test_neutral_text_scores_nothing(self, analyzer, make_doc):
        doc = make_doc(["Tisch", "Stuhl"], lemmas=["tisch", "stuhl"])
        assert analyzer.analyze(doc) == {}

    def test_empty_doc_scores_nothing(self, analyzer, make_doc):
        assert analyzer.analyze(make_doc([])) == {}

    def test_punctuation_is_not_counted_as_a_word(self, analyzer, make_doc, hope_word):
        # Two tokens, one of them a comma → the emotion word is 1 of 1 words.
        doc = make_doc([hope_word, ","], lemmas=[hope_word, ","])
        assert analyzer.analyze(doc)["hoffnung"] == 1000.0


class TestNegationWindow:
    @pytest.mark.parametrize("distance", [1, 2, 3])
    def test_negation_within_three_tokens_suppresses_the_match(
        self, analyzer, make_doc, hope_word, distance
    ):
        words = ["nicht"] + ["Tisch"] * (distance - 1) + [hope_word]
        doc = make_doc(words, lemmas=[w.lower() for w in words])
        assert "hoffnung" not in analyzer.analyze(doc)

    def test_negation_further_away_does_not_suppress(self, analyzer, make_doc, hope_word):
        words = ["nicht", "Tisch", "Stuhl", "Regal", hope_word]
        doc = make_doc(words, lemmas=[w.lower() for w in words])
        assert "hoffnung" in analyzer.analyze(doc)

    def test_negation_after_the_word_does_not_suppress(self, analyzer, make_doc, hope_word):
        doc = make_doc([hope_word, "nicht"], lemmas=[hope_word, "nicht"])
        assert "hoffnung" in analyzer.analyze(doc)

    def test_negated_words_still_count_toward_the_total(self, analyzer, make_doc, hope_word):
        # The denominator is every word, negated ones included: suppressing a
        # match must lower the surviving score, not leave it untouched.
        words = ["nicht", hope_word, "Tisch", "Stuhl", hope_word]
        doc = make_doc(words, lemmas=[w.lower() for w in words])
        # Only the last occurrence survives → 1 of 5 words.
        assert analyzer.analyze(doc)["hoffnung"] == 200.0

    def test_every_negation_word_is_matched_by_lemma(self, analyzer, make_doc, hope_word):
        for negation in sorted(NEGATION_WORDS):
            doc = make_doc([negation, hope_word], lemmas=[negation, hope_word])
            assert "hoffnung" not in analyzer.analyze(doc), negation


class TestHeadlineWeighting:
    def test_title_matches_count_more(self, analyzer, make_doc, hope_word):
        doc = make_doc([hope_word, "Tisch"], lemmas=[hope_word, "tisch"])
        weighted = analyzer.analyze(doc, title_end=len(hope_word))["hoffnung"]
        plain = analyzer.analyze(doc)["hoffnung"]
        assert weighted == pytest.approx(plain * TITLE_WEIGHT)

    def test_title_end_zero_disables_weighting(self, analyzer, make_doc, hope_word):
        doc = make_doc([hope_word], lemmas=[hope_word])
        assert analyzer.analyze(doc, title_end=0) == analyzer.analyze(doc)
