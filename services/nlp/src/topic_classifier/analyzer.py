"""spaCy-based topic classifier for German news articles.

Loads de_core_news_lg, extracts lemmatized nouns, matches against
topic lexicons, and returns per-topic scores.

Features:
- Headline weighting: title matches count 3x (headlines carry strongest topical signal)
- Political actor mapping: politician names serve as topic signals via TOPIC_MULTI_LABEL
- Emotion analysis with negation window (delegated to EmotionAnalyzer)
"""

from collections import Counter
from pathlib import Path

import spacy

from .constants import TITLE_WEIGHT
from .emotion_analyzer import EmotionAnalyzer
from .lexicons import TopicCategory, get_topic_labels

# External, maintainable stopword list. Edit stopword_nouns.txt to add/remove
# words — one lowercase lemma per line; '#' lines and blanks are ignored.
_STOPWORD_NOUNS_FILE = Path(__file__).parent / "stopword_nouns.txt"


def _load_stopword_nouns(path: Path) -> set[str]:
    """Load lemmatized noun stopwords from the external word list.

    One word per line; blank lines and lines starting with '#' are ignored.
    Words are lowercased to match spaCy's lemmatized, lowercased tokens.
    """
    words: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        words.add(line.lower())
    return words


STOPWORD_NOUNS = _load_stopword_nouns(_STOPWORD_NOUNS_FILE)


class TopicClassifier:
    """Classifies German text into 13 political topic categories."""

    def __init__(self, model: str = "de_core_news_lg"):
        try:
            self.nlp = spacy.load(model)
        except OSError:
            raise RuntimeError(
                f"spaCy model '{model}' not found. Install with:\n"
                f"  python -m spacy download {model}"
            )

        # Tokenization, POS tagging, morphology, lemmatization (topics/keywords)
        # plus NER for person extraction. The topic/keyword passes opt out of NER
        # per-call via `disable=["ner"]` so only the persons pass pays for it.
        self.nlp.select_pipes(
            enable=["tok2vec", "tagger", "morphologizer", "lemmatizer", "ner"]
        )
        self._emotion_analyzer = EmotionAnalyzer()
        self._ready = True

    @property
    def is_ready(self) -> bool:
        return self._ready

    def classify_text(self, text: str) -> dict[str, float]:
        """Classify a single text, returning topic scores."""
        doc = self.nlp(text)
        noun_counts: Counter[TopicCategory] = Counter()
        total_nouns = 0

        for token in doc:
            if token.pos_ not in ("NOUN", "PROPN"):
                continue
            lemma = token.lemma_.lower()
            if len(lemma) < 3 or lemma in STOPWORD_NOUNS or lemma.isdigit():
                continue

            total_nouns += 1
            labels = get_topic_labels(lemma)
            for topic, weight in labels:
                noun_counts[topic] += weight

        if total_nouns == 0:
            return {}

        scores: dict[str, float] = {}
        for topic in TopicCategory:
            count = noun_counts.get(topic, 0)
            if count > 0:
                scores[topic.value] = round((count / total_nouns) * 1000, 1)

        return scores

    def classify_batch(
        self,
        texts: list[dict],
    ) -> list[dict]:
        """Classify multiple texts in batch using nlp.pipe().

        Args:
            texts: List of dicts with 'id', 'title', 'text' fields.

        Returns:
            List of dicts with 'id', 'topics', 'primaryTopic' fields.
        """
        text_contents = []
        title_char_ends: list[int] = []
        for item in texts:
            title = item.get('title', '')
            body = item.get('text', '')
            text_contents.append(f"{title} {body}")
            title_char_ends.append(len(title))

        results = []
        for idx, (doc, item) in enumerate(zip(
            self.nlp.pipe(text_contents, batch_size=50, n_process=1, disable=["ner"]),
            texts,
        )):
            noun_counts: Counter[TopicCategory] = Counter()
            lemma_counts: Counter[str] = Counter()
            total_nouns = 0
            title_end = title_char_ends[idx]

            for token in doc:
                if token.pos_ not in ("NOUN", "PROPN"):
                    continue
                lemma = token.lemma_.lower()
                if len(lemma) < 3 or lemma in STOPWORD_NOUNS or lemma.isdigit():
                    continue
                if any(c.isdigit() for c in lemma):
                    continue

                total_nouns += 1
                lemma_counts[lemma] += 1

                in_title = token.idx < title_end
                multiplier = TITLE_WEIGHT if in_title else 1.0

                labels = get_topic_labels(lemma)
                for topic, weight in labels:
                    noun_counts[topic] += weight * multiplier

            scores: dict[str, float] = {}
            primary_topic = None
            max_score = 0.0

            if total_nouns > 0:
                for topic in TopicCategory:
                    count = noun_counts.get(topic, 0)
                    if count > 0:
                        score = round((count / total_nouns) * 1000, 1)
                        scores[topic.value] = score
                        if score > max_score:
                            max_score = score
                            primary_topic = topic.value

            # Top nouns for this article (for per-article keyword storage)
            top_nouns = [
                {"noun": noun, "count": count}
                for noun, count in lemma_counts.most_common(10)
            ]

            # Emotion analysis (reuses the same spaCy doc, with headline weighting)
            emotion_scores = self._emotion_analyzer.analyze(doc, title_end=title_end)

            results.append({
                "id": item.get("id", ""),
                "topics": scores,
                "primaryTopic": primary_topic,
                "topNouns": top_nouns,
                "emotionScores": emotion_scores,
            })

        return results

    def extract_keywords_batch(
        self,
        texts: list[dict],
        top_n: int = 50,
    ) -> list[dict]:
        """Extract top keywords (lemmatized nouns) aggregated across all texts.

        Returns a ranked list of {keyword, count, topic} dicts.
        """
        global_counts: Counter[str] = Counter()

        text_contents = [
            f"{item.get('title', '')} {item.get('text', '')}"
            for item in texts
        ]

        for doc in self.nlp.pipe(text_contents, batch_size=50, n_process=1, disable=["ner"]):
            for token in doc:
                if token.pos_ not in ("NOUN", "PROPN"):
                    continue
                lemma = token.lemma_.lower()
                if len(lemma) < 3 or lemma in STOPWORD_NOUNS or lemma.isdigit():
                    continue
                if any(c.isdigit() for c in lemma):
                    continue
                global_counts[lemma] += 1

        results = []
        for keyword, count in global_counts.most_common(top_n):
            labels = get_topic_labels(keyword)
            primary = labels[0][0].value if labels else None
            results.append({
                "keyword": keyword,
                "count": count,
                "topic": primary,
            })

        return results

    def extract_persons_batch(
        self,
        texts: list[dict],
        top_n: int = 20,
    ) -> list[dict]:
        """Extract the most frequently mentioned person names across all texts.

        Uses spaCy NER (PER entities) and counts DOCUMENT frequency — each person
        is counted at most once per document, so the ranking reflects "appears in
        the most documents" rather than "repeated most often in one document".

        Returns a ranked list of {person, count} dicts.
        """
        # document frequency per normalized name; keep the most common surface form
        doc_counts: Counter[str] = Counter()
        surface_counts: dict[str, Counter[str]] = {}

        text_contents = [
            f"{item.get('title', '')} {item.get('text', '')}"
            for item in texts
        ]

        for doc in self.nlp.pipe(text_contents, batch_size=25, n_process=1):
            seen_in_doc: set[str] = set()
            for ent in doc.ents:
                if ent.label_ != "PER":
                    continue
                name = " ".join(ent.text.split()).strip(" .,;:\"'()")
                # Names are capitalized; drop length-1 fragments and lowercase noise.
                if len(name) < 3 or not name[0].isupper():
                    continue
                norm = name.casefold()
                if norm in seen_in_doc:
                    continue
                seen_in_doc.add(norm)
                doc_counts[norm] += 1
                surface_counts.setdefault(norm, Counter())[name] += 1

        results = []
        for norm, count in doc_counts.most_common(top_n):
            # most frequent surface spelling becomes the display name
            display = surface_counts[norm].most_common(1)[0][0]
            results.append({"person": display, "count": count})

        return results
