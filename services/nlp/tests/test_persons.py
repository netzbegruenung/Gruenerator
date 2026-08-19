"""Person extraction: blocklist, document frequency, surface forms.

`extract_persons_batch` feeds the `persons` payload in Qdrant and the
`persons` snapshots in Postgres. Its inputs here are hand-built Docs with the
entities already set, so every assertion is about the extraction rules and none
about the NER's daily form.
"""

import pytest

def per_doc(make_doc, words: list[str], person_spans: list[tuple[int, int]]):
    """Doc in which each half-open (start, end) span is a PER entity."""
    ents = ["O"] * len(words)
    for start, end in person_spans:
        ents[start] = "B-PER"
        for i in range(start + 1, end):
            ents[i] = "I-PER"
    return make_doc(words, ents=ents)


def texts_for(docs):
    return [{"id": str(i), "title": "", "text": ""} for i in range(len(docs))]


def extract(classifier_over, docs, top_n: int = 20):
    return classifier_over(docs).extract_persons_batch(texts_for(docs), top_n=top_n)


class TestBlocklist:
    def test_drops_a_blocked_image_credit(self, classifier_over, make_doc):
        docs = [per_doc(make_doc, ["Foto", ":", "Unsplash"], [(2, 3)])]
        assert extract(classifier_over, docs) == []

    def test_drops_a_blocked_staff_member(self, classifier_over, make_doc):
        docs = [per_doc(make_doc, ["Bild", "von", "Vincent", "Willock"], [(2, 4)])]
        assert extract(classifier_over, docs) == []

    def test_keeps_politicians_in_the_same_document(self, classifier_over, make_doc):
        docs = [
            per_doc(
                make_doc,
                ["Annalena", "Baerbock", "sprach", ".", "Foto", ":", "Unsplash"],
                [(0, 2), (6, 7)],
            )
        ]
        assert [p["person"] for p in extract(classifier_over, docs)] == ["Annalena Baerbock"]

    def test_matching_ignores_case(self, classifier_over, make_doc):
        docs = [per_doc(make_doc, ["Quelle", "UNSPLASH"], [(1, 2)])]
        assert extract(classifier_over, docs) == []

    def test_a_multi_token_entry_does_not_block_a_shared_surname(
        self, classifier_over, make_doc
    ):
        # The reason multi-token entries match the whole name: a bare surname
        # line would block every politician who happens to share it.
        docs = [per_doc(make_doc, ["Ines", "Willock", "kandidiert"], [(0, 2)])]
        assert [p["person"] for p in extract(classifier_over, docs)] == ["Ines Willock"]

    def test_a_single_token_entry_also_blocks_the_names_it_is_glued_into(
        self, classifier_over, make_doc
    ):
        # The NER glues the next capitalized word onto an image credit; blocking
        # only the bare "Unsplash" let "Unsplash Gemeinsame" through (36 docs).
        docs = [per_doc(make_doc, ["Foto", "Unsplash", "Gemeinsame"], [(1, 3)])]
        assert extract(classifier_over, docs) == []


class TestDocumentFrequency:
    def test_counts_a_person_once_per_document(self, classifier_over, make_doc):
        # Repetition inside one article must not outrank presence across many.
        repeated = per_doc(
            make_doc,
            ["Robert", "Habeck", "sagte", ".", "Robert", "Habeck", "betonte"],
            [(0, 2), (4, 6)],
        )
        assert extract(classifier_over, [repeated]) == [{"person": "Robert Habeck", "count": 1}]

    def test_ranks_by_number_of_documents(self, classifier_over, make_doc):
        in_three = [per_doc(make_doc, ["Ricarda", "Lang"], [(0, 2)]) for _ in range(3)]
        in_one = [
            per_doc(
                make_doc,
                ["Omid", "Nouripour", "und", "Ricarda", "Lang"],
                [(0, 2), (3, 5)],
            )
        ]
        result = extract(classifier_over, in_three + in_one)
        assert result == [
            {"person": "Ricarda Lang", "count": 4},
            {"person": "Omid Nouripour", "count": 1},
        ]

    def test_honours_top_n(self, classifier_over, make_doc):
        docs = [per_doc(make_doc, [f"Person{i}", "X"], [(0, 2)]) for i in range(5)]
        assert len(extract(classifier_over, docs, top_n=2)) == 2


class TestSurfaceForms:
    def test_spellings_differing_only_in_case_are_one_person(self, classifier_over, make_doc):
        docs = [
            per_doc(make_doc, ["Katrin", "Göring-Eckardt"], [(0, 2)]),
            per_doc(make_doc, ["KATRIN", "GÖRING-ECKARDT"], [(0, 2)]),
        ]
        result = extract(classifier_over, docs)
        assert len(result) == 1
        assert result[0]["count"] == 2

    def test_most_common_spelling_becomes_the_display_name(self, classifier_over, make_doc):
        docs = [per_doc(make_doc, ["Cem", "Özdemir"], [(0, 2)]) for _ in range(3)]
        docs.append(per_doc(make_doc, ["CEM", "ÖZDEMIR"], [(0, 2)]))
        assert extract(classifier_over, docs)[0]["person"] == "Cem Özdemir"


class TestNoiseFilters:
    @pytest.mark.parametrize("word", ["Li", "A"])
    def test_drops_fragments_shorter_than_three_characters(
        self, classifier_over, make_doc, word
    ):
        docs = [per_doc(make_doc, [word, "sprach"], [(0, 1)])]
        assert extract(classifier_over, docs) == []

    def test_drops_lowercase_candidates(self, classifier_over, make_doc):
        # German person names are capitalized; a lowercase PER is NER noise.
        docs = [per_doc(make_doc, ["irgendwas", "passiert"], [(0, 1)])]
        assert extract(classifier_over, docs) == []

    def test_strips_trailing_punctuation_from_names(self, classifier_over, make_doc):
        docs = [
            per_doc(make_doc, ["Sagte", "Annalena", "Baerbock", "."], [(1, 4)]),
            per_doc(make_doc, ["Auch", "Annalena", "Baerbock"], [(1, 3)]),
        ]
        result = extract(classifier_over, docs)
        assert result == [{"person": "Annalena Baerbock", "count": 2}]

    def test_ignores_non_person_entities(self, classifier_over, make_doc):
        docs = [make_doc(["Berlin", "waechst"], ents=["B-LOC", "O"])]
        assert extract(classifier_over, docs) == []

    def test_no_texts_yields_no_persons(self, classifier_over):
        assert classifier_over([]).extract_persons_batch([]) == []


class TestCanonicalisation:
    """Folding the same person's variants together.

    Measured on the live Qdrant payloads before this pass existed: `Merz` (195
    documents) sat next to `Friedrich Merz` (385), `Putins` (226) next to
    `Putin` (256), and a third of all tagged volume was single-token noise.
    """

    def test_a_bare_surname_folds_into_the_only_matching_full_name(
        self, classifier_over, make_doc
    ):
        docs = [
            per_doc(make_doc, ["Friedrich", "Merz", "sprach"], [(0, 2)]),
            per_doc(make_doc, ["Merz", "antwortete"], [(0, 1)]),
        ]
        assert extract(classifier_over, docs) == [{"person": "Friedrich Merz", "count": 2}]

    def test_an_ambiguous_surname_is_dropped_rather_than_guessed(
        self, classifier_over, make_doc
    ):
        docs = [
            per_doc(make_doc, ["Jutta", "Wegner"], [(0, 2)]),
            per_doc(make_doc, ["Kai", "Wegner"], [(0, 2)]),
            per_doc(make_doc, ["Wegner", "sagte"], [(0, 1)]),
        ]
        assert sorted(p["person"] for p in extract(classifier_over, docs)) == [
            "Jutta Wegner",
            "Kai Wegner",
        ]

    def test_a_surname_without_any_full_name_is_dropped(self, classifier_over, make_doc):
        # The exit for the biggest noise class: "Link", "Messlatte", "Kitas".
        docs = [per_doc(make_doc, ["Link", "anklicken"], [(0, 1)])]
        assert extract(classifier_over, docs) == []

    def test_a_genitive_folds_into_the_base_form(self, classifier_over, make_doc):
        docs = [
            per_doc(make_doc, ["Wladimir", "Putin", "sprach"], [(0, 2)]),
            per_doc(make_doc, ["Wladimir", "Putins", "Krieg"], [(0, 2)]),
        ]
        assert extract(classifier_over, docs) == [{"person": "Wladimir Putin", "count": 2}]

    def test_a_genitive_folds_across_the_surname_fold_too(self, classifier_over, make_doc):
        # "Söders" → "Söder" → "Markus Söder", both passes in one chain.
        docs = [
            per_doc(make_doc, ["Markus", "Söder"], [(0, 2)]),
            per_doc(make_doc, ["Söders", "Politik"], [(0, 1)]),
        ]
        assert extract(classifier_over, docs) == [{"person": "Markus Söder", "count": 2}]

    def test_a_name_ending_in_s_survives_without_a_base_form(
        self, classifier_over, make_doc
    ):
        docs = [per_doc(make_doc, ["Cornelia", "Weiss"], [(0, 2)])]
        assert extract(classifier_over, docs) == [{"person": "Cornelia Weiss", "count": 1}]

    def test_the_same_person_is_counted_once_per_document(self, classifier_over, make_doc):
        # Both variants in ONE document must not double the document frequency.
        docs = [
            per_doc(
                make_doc,
                ["Friedrich", "Merz", "sagte", ".", "Merz", "betonte"],
                [(0, 2), (4, 5)],
            )
        ]
        assert extract(classifier_over, docs) == [{"person": "Friedrich Merz", "count": 1}]

    def test_hyphenation_across_a_line_break_is_one_person(self, classifier_over, make_doc):
        docs = [
            per_doc(make_doc, ["Dieter", "Grü-", "newald"], [(0, 3)]),
            per_doc(make_doc, ["Dieter", "Grünewald"], [(0, 2)]),
        ]
        assert extract(classifier_over, docs) == [{"person": "Dieter Grünewald", "count": 2}]


class TestEntityTrimming:
    """Cutting titles and roles off a PER span.

    These need POS tags, so the Docs here set them — that is exactly the
    information the rule reads. Without POS the trimming is skipped (see
    `test_a_doc_without_pos_tags_keeps_the_whole_span`), which is what keeps the
    hand-built Docs elsewhere in this file meaningful.
    """

    def per_doc_pos(self, make_doc, words, pos, person_spans):
        ents = ["O"] * len(words)
        for start, end in person_spans:
            ents[start] = "B-PER"
            for i in range(start + 1, end):
                ents[i] = "I-PER"
        return make_doc(words, pos=pos, ents=ents)

    def test_cuts_a_role_tail_off_a_letterhead_span(self, classifier_over, make_doc):
        # Verbatim from a Berlin PDF letterhead; the uncut span stood in the
        # live facet as its own "person" with 673 documents.
        doc = self.per_doc_pos(
            make_doc,
            ["Werner", "Graf", "Landesvorsitzende", "Kommandantenstr"],
            ["PROPN", "PROPN", "ADJ", "PROPN"],
            [(0, 4)],
        )
        assert extract(classifier_over, [doc]) == [{"person": "Werner Graf", "count": 1}]

    def test_drops_a_leading_function_word(self, classifier_over, make_doc):
        doc = self.per_doc_pos(
            make_doc,
            ["Verkehrsminister", "Kaweh", "Mansoori"],
            ["NOUN", "PROPN", "PROPN"],
            [(0, 3)],
        )
        assert extract(classifier_over, [doc]) == [{"person": "Kaweh Mansoori", "count": 1}]

    def test_drops_a_span_that_has_no_proper_noun_at_all(self, classifier_over, make_doc):
        doc = self.per_doc_pos(make_doc, ["Foto"], ["NOUN"], [(0, 1)])
        assert extract(classifier_over, [doc]) == []

    def test_keeps_a_surname_particle(self, classifier_over, make_doc):
        doc = self.per_doc_pos(
            make_doc,
            ["Thomas", "von", "Sarnowski"],
            ["PROPN", "ADP", "PROPN"],
            [(0, 3)],
        )
        assert extract(classifier_over, [doc]) == [
            {"person": "Thomas von Sarnowski", "count": 1}
        ]

    def test_keeps_a_double_first_name(self, classifier_over, make_doc):
        doc = self.per_doc_pos(
            make_doc,
            ["Jan", "Philipp", "Albrecht"],
            ["PROPN", "PROPN", "PROPN"],
            [(0, 3)],
        )
        assert extract(classifier_over, [doc]) == [
            {"person": "Jan Philipp Albrecht", "count": 1}
        ]

    def test_strips_a_parliamentary_abbreviation(self, classifier_over, make_doc):
        # "MdL" is tagged PROPN, so the POS rule alone would keep it.
        doc = self.per_doc_pos(
            make_doc,
            ["Constanze", "Oehlrich", "MdL"],
            ["PROPN", "PROPN", "PROPN"],
            [(0, 3)],
        )
        assert extract(classifier_over, [doc]) == [
            {"person": "Constanze Oehlrich", "count": 1}
        ]

    def test_strips_an_academic_title(self, classifier_over, make_doc):
        doc = self.per_doc_pos(
            make_doc,
            ["Dr.", "Harald", "Terpe"],
            ["NOUN", "PROPN", "PROPN"],
            [(0, 3)],
        )
        assert extract(classifier_over, [doc]) == [{"person": "Harald Terpe", "count": 1}]

    def test_a_doc_without_pos_tags_keeps_the_whole_span(self, classifier_over, make_doc):
        doc = per_doc(make_doc, ["Katrin", "Göring-Eckardt"], [(0, 2)])
        assert extract(classifier_over, [doc]) == [
            {"person": "Katrin Göring-Eckardt", "count": 1}
        ]

    def test_a_stop_token_ends_the_name_even_when_tagged_propn(
        self, classifier_over, make_doc
    ):
        # The case the POS rule alone misses: de_core_news_lg tags
        # "Landesvorsitzende" as ADJ in one sentence of a Berlin WPS letterhead
        # and as PROPN in the next.
        doc = self.per_doc_pos(
            make_doc,
            ["Werner", "Graf", "Landesvorsitzende", "Landesgeschäftsstelle"],
            ["PROPN", "PROPN", "PROPN", "PROPN"],
            [(0, 4)],
        )
        assert extract(classifier_over, [doc]) == [{"person": "Werner Graf", "count": 1}]

    def test_a_leading_stop_token_drops_the_whole_candidate(
        self, classifier_over, make_doc
    ):
        doc = self.per_doc_pos(
            make_doc, ["Wahlprüfsteine", "Dachverband"], ["PROPN", "PROPN"], [(0, 2)]
        )
        assert extract(classifier_over, [doc]) == []

    def test_stop_tokens_apply_without_pos_tags_too(self, classifier_over, make_doc):
        doc = per_doc(make_doc, ["Emily", "Büning", "Platz"], [(0, 3)])
        assert extract(classifier_over, [doc]) == [{"person": "Emily Büning", "count": 1}]
