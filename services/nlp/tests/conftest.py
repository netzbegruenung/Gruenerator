"""Shared fixtures for the NLP service tests.

Two tiers, and the split is deliberate:

* **Modellfrei** (the bulk). The scoring, filtering and ranking logic in
  `analyzer.py` consumes spaCy `Doc` objects — it does not care which model
  produced them. So the tests build Docs by hand on a blank German vocab and
  drive the methods directly. That keeps every assertion deterministic: a test
  for the person blocklist asserts about the blocklist, not about whether some
  statistical model happened to tag "Vincent Willock" as PER today.
* **Mit Modell** (`@pytest.mark.model`, a handful). Only for what genuinely
  needs a loaded pipeline — above all that the component names in
  `select_pipes(enable=[...])` still match a real model, which otherwise fails
  at service startup and nowhere earlier.

The model tier auto-skips when no German model is installed, so `pytest` works
on a bare checkout. CI installs `de_core_news_sm` (~15 MB) to actually run it;
production uses `de_core_news_lg` (~610 MB) and the tests take whichever is
present.
"""

import pytest
import spacy
from spacy.tokens import Doc

# Preference order: production model first, so a developer who has it installed
# tests against the real thing.
CANDIDATE_MODELS = ("de_core_news_lg", "de_core_news_sm")


def installed_model() -> str | None:
    for name in CANDIDATE_MODELS:
        if spacy.util.is_package(name):
            return name
    return None


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "model: needs an installed German spaCy model (auto-skipped without one)",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if installed_model():
        return
    skip = pytest.mark.skip(
        reason=f"no German spaCy model installed (tried: {', '.join(CANDIDATE_MODELS)})"
    )
    for item in items:
        if "model" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def vocab():
    """Vocab of a blank German pipeline.

    Blank, not a trained model: it carries the German lexical attribute getters
    (`is_punct`, `is_space`, …) that `EmotionAnalyzer` reads, but loads no
    weights, so it costs milliseconds.
    """
    return spacy.blank("de").vocab


@pytest.fixture
def make_doc(vocab):
    """Build a spaCy Doc with hand-set annotations.

    Lets a test state exactly what the pipeline "recognized" — lemmas, POS tags,
    entities — instead of hoping a model produces them.

    `ents` uses IOB tags, one per token: "O" outside, "B-PER" at the start of an
    entity, "I-PER" for each further token of it.
    """

    def _make(
        words: list[str],
        *,
        lemmas: list[str] | None = None,
        pos: list[str] | None = None,
        ents: list[str] | None = None,
        spaces: list[bool] | None = None,
    ) -> Doc:
        if spaces is None:
            # Single space between tokens, none after the last one — so
            # `token.idx` lines up with the text the service would have seen.
            spaces = [True] * len(words)
            if spaces:
                spaces[-1] = False
        return Doc(
            vocab,
            words=words,
            spaces=spaces,
            lemmas=lemmas if lemmas is not None else words,
            pos=pos,
            ents=ents,
        )

    return _make


class _StubPipeline:
    """Stands in for `TopicClassifier.nlp`, returning pre-built Docs.

    `nlp.pipe` is the only thing the batch methods call on the pipeline, so a
    stub with that one method is enough to exercise them without a model.
    """

    def __init__(self, docs: list[Doc]):
        self._docs = docs

    def pipe(self, texts, **_kwargs):
        texts = list(texts)
        # The batch methods zip the pipe output against their input list; a
        # mismatch here would silently truncate and make a test pass for the
        # wrong reason.
        assert len(texts) == len(self._docs), (
            f"stub has {len(self._docs)} docs but {len(texts)} texts were piped"
        )
        return iter(self._docs)


@pytest.fixture
def classifier_over():
    """Build a TopicClassifier whose pipeline yields the given Docs.

    Bypasses `__init__` (which loads a model) and injects the stub instead, so
    the counting and filtering logic can be tested against exactly the
    annotations a test declares.
    """
    from topic_classifier.analyzer import TopicClassifier
    from topic_classifier.emotion_analyzer import EmotionAnalyzer

    def _make(docs: list[Doc]):
        classifier = object.__new__(TopicClassifier)
        classifier.nlp = _StubPipeline(docs)
        classifier._emotion_analyzer = EmotionAnalyzer()
        classifier._ready = True
        return classifier

    return _make


@pytest.fixture(scope="session")
def real_classifier():
    """A TopicClassifier on whichever German model is installed."""
    from topic_classifier.analyzer import TopicClassifier

    name = installed_model()
    if not name:
        pytest.skip("no German spaCy model installed")
    return TopicClassifier(model=name)
