"""Emotion analyzer for German political news text.

Scores articles across 7 emotion dimensions using lexicon matching
on lemmatized tokens from the spaCy pipeline.

Includes a negation window to skip emotion matches preceded by
negation words (e.g. "nicht hoffnungsvoll", "kein Vertrauen").
"""

from collections import Counter

from spacy.tokens import Doc

from .emotion_lexicons import EmotionCategory, get_emotion

NEGATION_WORDS = frozenset({
    "nicht", "kein", "keine", "keinen", "keinem", "keiner", "keines",
    "kaum", "weder", "ohne", "nie", "niemals", "nirgends",
})


class EmotionAnalyzer:
    """Analyzes emotion scores for German text using lexicon matching."""

    @staticmethod
    def _is_negated(doc: Doc, token_idx: int) -> bool:
        """Check if a token is preceded by a negation word within 3 tokens."""
        start = max(0, token_idx - 3)
        for i in range(start, token_idx):
            if doc[i].lemma_.lower() in NEGATION_WORDS:
                return True
        return False

    def analyze(self, doc: Doc) -> dict[str, float]:
        """Analyze a spaCy Doc and return emotion scores (per-mille).

        Returns dict mapping emotion name to score (0-1000 scale).
        Higher = more prevalent in the text.
        """
        emotion_counts: Counter[EmotionCategory] = Counter()
        total_words = 0

        for token in doc:
            if token.is_space or token.is_punct:
                continue
            total_words += 1

            lemma = token.lemma_.lower()
            if len(lemma) < 3:
                continue

            emotion = get_emotion(lemma)
            if emotion and not self._is_negated(doc, token.i):
                emotion_counts[emotion] += 1

        if total_words == 0:
            return {}

        scores: dict[str, float] = {}
        for emotion in EmotionCategory:
            count = emotion_counts.get(emotion, 0)
            if count > 0:
                scores[emotion.value] = round((count / total_words) * 1000, 1)

        return scores
