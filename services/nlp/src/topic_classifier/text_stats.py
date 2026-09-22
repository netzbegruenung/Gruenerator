"""Counts and lemma frequencies of one text, for `notebook_quellen action="stats"`.

Works on a spaCy `Doc` so the tests can hand-build one (see `tests/conftest.py`).
"""

from collections import Counter, defaultdict

from spacy.tokens import Doc

# Content words only: function words would crowd out everything a person
# actually asks about ("wie oft kommt Klimaschutz vor").
LEMMA_POS = frozenset({"NOUN", "PROPN", "VERB", "ADJ", "ADV"})

SENTENCE_END = frozenset({".", "!", "?", "…"})


def _count_sentences(tokens: list) -> int:
    """Sentence count from the parser's boundaries, or from final punctuation.

    The service runs without the dependency parser (`select_pipes` in
    `analyzer.py`), so production Docs carry no sentence boundaries and
    `doc.sents` would raise. Then a run of sentence-final punctuation ends a
    sentence, and trailing words without one form the last sentence.
    """
    if not tokens:
        return 0
    doc = tokens[0].doc
    if doc.has_annotation("SENT_START"):
        return sum(1 for sent in doc.sents if any(not t.is_space for t in sent))
    sentences = 0
    open_sentence = False
    for token in tokens:
        if token.text in SENTENCE_END:
            if open_sentence:
                sentences += 1
            open_sentence = False
        else:
            open_sentence = True
    return sentences + (1 if open_sentence else 0)


def compute_text_stats(doc: Doc, top_n: int, lemma_of: list[str]) -> dict:
    """Token, word and sentence counts plus the top-N content lemmas.

    `lemmas` is keyed by the lowercased lemma; its `pos` is the tag the lemma
    carried most often. `forms` holds, for every requested lemma (matched
    case-insensitively, any POS), how often each surface form occurred — keyed
    by the lemma exactly as requested, so the caller can look it up again.
    """
    tokens = [t for t in doc if not t.is_space]
    lemma_counts: Counter[str] = Counter()
    pos_by_lemma: dict[str, Counter[str]] = defaultdict(Counter)
    # Case-insensitive: "Wald" and "wald" are one lemma, and each requested
    # spelling gets the forms under its own key.
    wanted: dict[str, list[str]] = defaultdict(list)
    for requested in dict.fromkeys(lemma_of):
        wanted[requested.lower()].append(requested)
    forms: dict[str, Counter[str]] = {lemma: Counter() for lemma in lemma_of}

    for token in tokens:
        lemma = token.lemma_.lower()
        for requested in wanted.get(lemma, ()):
            forms[requested][token.text] += 1
        if token.pos_ not in LEMMA_POS or token.is_stop or token.is_punct or not lemma:
            continue
        lemma_counts[lemma] += 1
        pos_by_lemma[lemma][token.pos_] += 1

    return {
        "tokens": len(tokens),
        "words": sum(1 for t in tokens if t.is_alpha or t.like_num),
        "sentences": _count_sentences(tokens),
        "lemmas": [
            {"lemma": lemma, "pos": pos_by_lemma[lemma].most_common(1)[0][0], "count": count}
            for lemma, count in lemma_counts.most_common(top_n)
        ],
        "forms": {
            lemma: [{"form": form, "count": count} for form, count in counter.most_common()]
            for lemma, counter in forms.items()
        },
    }
