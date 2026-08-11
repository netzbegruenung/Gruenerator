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

    def test_blocks_only_the_full_name_not_a_fragment(self, classifier_over, make_doc):
        # Documented behaviour, and the reason the list matches full names: a
        # bare surname line would block every politician who shares it. Whoever
        # wants the fragment gone adds it as its own line.
        docs = [per_doc(make_doc, ["Willock", "kandidiert"], [(0, 1)])]
        assert [p["person"] for p in extract(classifier_over, docs)] == ["Willock"]


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
            per_doc(make_doc, ["Sagte", "Baerbock", "."], [(1, 3)]),
            per_doc(make_doc, ["Auch", "Baerbock"], [(1, 2)]),
        ]
        result = extract(classifier_over, docs)
        assert result == [{"person": "Baerbock", "count": 2}]

    def test_ignores_non_person_entities(self, classifier_over, make_doc):
        docs = [make_doc(["Berlin", "waechst"], ents=["B-LOC", "O"])]
        assert extract(classifier_over, docs) == []

    def test_no_texts_yields_no_persons(self, classifier_over):
        assert classifier_over([]).extract_persons_batch([]) == []
