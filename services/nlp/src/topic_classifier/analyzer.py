"""Simplified spaCy-based topic classifier for German news articles.

Loads de_core_news_lg, extracts lemmatized nouns, matches against
topic lexicons, and returns per-topic scores.
"""

from collections import Counter

import spacy

from .lexicons import TopicCategory, get_topic_labels


STOPWORD_NOUNS = {
    # From bundestag-analysis: procedural/parliamentary terms
    "herr", "frau", "dame", "kollege", "kollegin",
    "präsident", "präsidentin", "vizepräsident", "vizepräsidentin",
    "abgeordnete", "abgeordneter", "abg",
    "antrag", "drucksache", "nummer", "prozent",
    "beifall", "zuruf", "zwischenfrage",
    "verehrten", "geehrten", "verehrte",
    # From bundestag-analysis: party names
    "spd", "cdu", "csu", "cdu/csu", "fdp", "afd", "grüne", "grünen",
    "linke", "bsw", "bündnis", "fraktion",
    # From bundestag-analysis: names/titles
    "dr.", "prof.", "dr", "prof",
    # From bundestag-analysis: time words
    "jahr", "jahre", "jahren", "monat", "tag", "zeit", "woche",
    # From bundestag-analysis: generic terms (low semantic value)
    "frage", "antwort", "rede", "debatte",
    "punkt", "stelle", "bereich", "rahmen", "grund",
    "art", "weise", "form", "teil", "seite",
    "beispiel", "fall", "sache", "ding", "thema", "themen",
    "ende", "endes", "anfang", "blick",
    "dinge", "dingen", "sache", "sachen",
    # From bundestag-analysis: quantitative terms
    "prozent", "million", "millionen", "milliarde", "milliarden",
    "euro", "viel",
    # News-specific stopwords
    "foto", "bild", "video", "nummer",
    "mensch", "menschen", "land", "länder", "stadt",
    "deutschland", "österreich", "berlin", "münchen", "wien",
    "regierung", "partei", "politik", "politiker",
    "angriff", "folge", "leben", "experte", "kritik",
    "problem", "druck", "preis", "welt", "haus",
    "league", "champions", "spiel", "gericht",
    "bundesregierung", "us-präsident",
    "januar", "februar", "märz", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "dezember",
    "uhr", "mittwoch", "donnerstag", "freitag", "montag",
    "dienstag", "samstag", "sonntag",
    "datum", "quelle", "artikel", "bericht", "nachricht",
    "unternehmen", "firma", "mann", "kind", "frau",
    "stunde", "minute", "woche", "heute", "morgen",
    "information", "angabe", "sprecher", "sprecherin",
}


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

        # Only need tokenization, POS tagging, morphology, and lemmatization
        self.nlp.select_pipes(enable=["tok2vec", "tagger", "morphologizer", "lemmatizer"])
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
        for item in texts:
            combined = f"{item.get('title', '')} {item.get('text', '')}"
            text_contents.append(combined)

        results = []
        for doc, item in zip(
            self.nlp.pipe(text_contents, batch_size=50, n_process=1),
            texts,
        ):
            noun_counts: Counter[TopicCategory] = Counter()
            lemma_counts: Counter[str] = Counter()
            total_nouns = 0

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
                labels = get_topic_labels(lemma)
                for topic, weight in labels:
                    noun_counts[topic] += weight

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

            results.append({
                "id": item.get("id", ""),
                "topics": scores,
                "primaryTopic": primary_topic,
                "topNouns": top_nouns,
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

        for doc in self.nlp.pipe(text_contents, batch_size=50, n_process=1):
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
