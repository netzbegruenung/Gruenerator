"""The few things that need a real spaCy pipeline.

Everything else in this suite drives the analyzer with hand-built Docs, which is
deterministic. What that cannot cover is the pipeline wiring itself — component
names, whether NER is actually on for persons and off for topics, whether the
lemmatizer produces the lowercase base forms the lexicons are written against.
Those fail at container start or silently degrade every score, and nowhere else
would catch them.

Auto-skipped without an installed German model; CI installs `de_core_news_sm`.
"""

import pytest

pytestmark = pytest.mark.model


class TestPipelineWiring:
    def test_the_enabled_components_exist_in_a_real_model(self, real_classifier):
        # `select_pipes(enable=[...])` raises on an unknown name, so reaching
        # this line already proves the list matches the model. Constructing the
        # classifier IS the assertion; this pins the intent.
        assert real_classifier.is_ready
        assert "ner" in real_classifier.nlp.pipe_names

    def test_unknown_model_fails_with_an_actionable_error(self):
        from topic_classifier.analyzer import TopicClassifier

        with pytest.raises(RuntimeError, match="spacy download"):
            TopicClassifier(model="de_core_news_gibtsnicht")


class TestLemmatization:
    def test_inflected_forms_reach_the_lexicon(self, real_classifier):
        # The lexicons deliberately store only singular base forms; if the
        # lemmatizer stops firing, every score silently drops to near zero.
        result = real_classifier.classify_batch(
            [{"id": "a", "title": "", "text": "Die Renten und die Asylverfahren."}]
        )[0]
        assert result["topics"], "no topic matched — lemmatization or POS tagging is off"


class TestNerToggling:
    def test_topic_classification_runs_without_ner(self, real_classifier):
        # classify_batch passes disable=["ner"]; the point is that it still
        # returns a complete result while skipping the expensive component.
        result = real_classifier.classify_batch(
            [{"id": "a", "title": "Klimaschutz", "text": "Klimaschutz und Emissionen."}]
        )[0]
        assert set(result) == {"id", "topics", "primaryTopic", "topNouns", "emotionScores"}

    def test_person_extraction_finds_a_name(self, real_classifier):
        # A smoke test, not a quality assertion: which names a given model tags
        # is the model's business, that NER runs at all is ours.
        persons = real_classifier.extract_persons_batch(
            [
                {
                    "id": str(i),
                    "title": "",
                    "text": "Robert Habeck sprach in Berlin über die Energiewende.",
                }
                for i in range(3)
            ]
        )
        assert persons, "NER produced no PER entities at all"

    def test_a_blocked_name_never_survives_the_real_pipeline(self, real_classifier):
        # End-to-end counterpart to the deterministic blocklist tests: whatever
        # the NER tags in this text, nothing on the blocklist comes out.
        from topic_classifier.analyzer import PERSON_BLOCKLIST

        persons = real_classifier.extract_persons_batch(
            [
                {
                    "id": "a",
                    "title": "",
                    "text": "Ricarda Lang bei der Konferenz. Foto: Vincent Willock / Unsplash",
                }
            ]
        )
        assert not [p for p in persons if p["person"].casefold() in PERSON_BLOCKLIST]
