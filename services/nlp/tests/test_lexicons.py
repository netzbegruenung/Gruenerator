"""Lexicon integrity.

These lists are edited far more often than the code that reads them, and the
ways they break are quiet: a term that lands in two categories at once, a
display entry missing for a category the API advertises, a lemma written in a
form the lookup can never see.
"""

import pytest

from topic_classifier.emotion_lexicons import (
    EMOTION_CATEGORY_INFO,
    EMOTION_LEXICONS,
    EmotionCategory,
    get_emotion,
)
from topic_classifier.lexicons import (
    TOPIC_CATEGORY_INFO,
    TOPIC_LEXICONS,
    TOPIC_MULTI_LABEL,
    TopicCategory,
    get_topic_labels,
)


class TestTopicLookup:
    def test_single_label_term_resolves_to_its_category(self):
        assert get_topic_labels("asyl") == [(TopicCategory.MIGRATION, 1.0)]

    def test_multi_label_term_resolves_to_all_its_categories(self):
        labels = dict(get_topic_labels("klimaschutz"))
        assert labels[TopicCategory.KLIMA] == 1.0
        assert labels[TopicCategory.WIRTSCHAFT] == 0.4

    def test_lookup_is_case_insensitive(self):
        assert get_topic_labels("Asyl") == get_topic_labels("asyl")

    def test_unknown_term_resolves_to_nothing(self):
        assert get_topic_labels("wolkenkuckucksheim") == []

    def test_multi_label_wins_over_the_single_label_table(self):
        # klimaschutz sits in the KLIMA lexicon and in TOPIC_MULTI_LABEL; the
        # multi-label entry must win, otherwise its second topic is lost.
        for term in TOPIC_MULTI_LABEL:
            assert get_topic_labels(term) == TOPIC_MULTI_LABEL[term]


class TestCompoundLookup:
    """German compounds borrow the labels of a lexicon term they contain (#5670)."""

    def test_head_of_a_compound_carries_its_topic(self):
        # "kinder|armut": armut is a SOZIALES term, the compound is not listed.
        assert get_topic_labels("kinderarmut") == [(TopicCategory.SOZIALES, 1.0)]

    def test_modifier_of_a_compound_carries_its_topic(self):
        # "klima|stiftung", "umwelt|ausschuss": the field sits in front.
        assert get_topic_labels("klimastiftung") == [(TopicCategory.KLIMA, 1.0)]
        assert get_topic_labels("umweltausschuss") == [(TopicCategory.KLIMA, 1.0)]

    def test_head_wins_over_modifier(self):
        # "luftverkehrs|steuer" starts with a MOBILITAET term and ends with a
        # FINANZEN one; the head names what the word is.
        assert get_topic_labels("luftverkehrssteuer") == [(TopicCategory.FINANZEN, 1.0)]

    def test_compound_inherits_multi_label_weights(self):
        assert get_topic_labels("energiewendeprojekt") == TOPIC_MULTI_LABEL["energiewende"]

    def test_exact_term_beats_a_compound_reading(self):
        assert get_topic_labels("landwirtschaft") == [(TopicCategory.LANDWIRTSCHAFT, 1.0)]

    @pytest.mark.parametrize(
        "lemma",
        [
            "steuerung",  # steuer + derivational ending, not a tax
            "autonomie",  # auto is too short to be a compound part
            "regierungsbildung",  # bildung is excluded as a compound part
            "zusammenarbeit",
            "lebensmittelpunkt",  # looks like lebensmittel + punkt
            "stundentafel",  # the timetable, not the food bank
        ],
    )
    def test_misleading_compounds_borrow_no_topic(self, lemma):
        # A miss costs one noun; a wrong reading can tag the whole document.
        assert get_topic_labels(lemma) == []

    def test_generic_head_falls_back_to_the_modifier(self):
        # betrieb is excluded as a head, so the farm is not WIRTSCHAFT.
        assert get_topic_labels("landwirtschaftsbetrieb") == [
            (TopicCategory.LANDWIRTSCHAFT, 1.0)
        ]


class TestTopicLexiconHygiene:
    def test_every_category_has_terms(self):
        for category in TopicCategory:
            assert TOPIC_LEXICONS.get(category), category

    def test_every_category_has_display_info(self):
        # The /topics endpoint serves this map; a missing entry ships a topic
        # the frontend cannot label.
        for category in TopicCategory:
            info = TOPIC_CATEGORY_INFO[category]
            assert info["name"] and info["description"] and info["color"].startswith("#")

    def test_terms_are_lowercase(self):
        # The lookup lowercases its input; an uppercase term is unreachable.
        for category, terms in TOPIC_LEXICONS.items():
            for term in terms:
                assert term == term.lower(), (category, term)

    def test_terms_are_not_whitespace_padded(self):
        for terms in TOPIC_LEXICONS.values():
            for term in terms:
                assert term == term.strip(), term

    def test_no_new_term_is_claimed_by_two_categories(self):
        # Ambiguity is legitimate — but it belongs in TOPIC_MULTI_LABEL with
        # explicit weights, not in two lexicons, where the winner is whichever
        # dict happens to iterate last and the other topic is silently lost.
        #
        # Ratchet, not a clean assertion: these four collisions predate the
        # test. They may shrink, never grow. Fixing one means moving the term
        # into TOPIC_MULTI_LABEL and deleting it here.
        known = {"schengen", "subvention", "straftat", "beschäftigung"}

        seen: dict[str, TopicCategory] = {}
        collisions: dict[str, tuple[TopicCategory, TopicCategory]] = {}
        for category, terms in TOPIC_LEXICONS.items():
            for term in terms:
                if term in TOPIC_MULTI_LABEL:
                    continue
                if term in seen:
                    collisions[term] = (seen[term], category)
                seen[term] = category

        assert set(collisions) <= known, f"new lexicon collisions: {collisions}"

    def test_multi_label_entries_are_wellformed(self):
        for term, labels in TOPIC_MULTI_LABEL.items():
            assert term == term.lower(), term
            assert len(labels) >= 1, term
            for category, weight in labels:
                assert isinstance(category, TopicCategory), term
                assert 0 < weight <= 1.0, (term, weight)


class TestEmotionLexicons:
    def test_lookup_resolves_a_known_term(self):
        term = next(iter(EMOTION_LEXICONS[EmotionCategory.ANGST]))
        assert get_emotion(term) == EmotionCategory.ANGST

    def test_unknown_term_resolves_to_none(self):
        assert get_emotion("wolkenkuckucksheim") is None

    def test_every_category_has_terms_and_display_info(self):
        for category in EmotionCategory:
            assert EMOTION_LEXICONS.get(category), category
            info = EMOTION_CATEGORY_INFO[category]
            assert info["name"] and info["description"] and info["color"].startswith("#")

    def test_terms_are_lowercase_and_unpadded(self):
        for terms in EMOTION_LEXICONS.values():
            for term in terms:
                assert term == term.lower().strip(), term

    @pytest.mark.parametrize("category", list(EmotionCategory))
    def test_no_term_is_claimed_by_two_emotions(self, category):
        # get_emotion returns ONE category, so an overlap silently makes one of
        # the two lexicons partly dead.
        others = set().union(
            *(terms for other, terms in EMOTION_LEXICONS.items() if other is not category)
        )
        assert not (EMOTION_LEXICONS[category] & others)
