"""Emotion analyzer for German political news text.

Scores articles across 7 emotion dimensions using lexicon matching
on lemmatized tokens from the spaCy pipeline.

Features:
- Negation window: skips emotion matches preceded by negation words
- Headline weighting: emotion matches in titles count 3x (optional)
"""

from collections import Counter

from spacy.tokens import Doc

from .constants import TITLE_WEIGHT
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

    def analyze(self, doc: Doc, title_end: int = 0) -> dict[str, float]:
        """Analyze a spaCy Doc and return emotion scores (per-mille).

        Args:
            doc: spaCy Doc to analyze.
            title_end: Character offset where the title ends (0 = no weighting).

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
                multiplier = TITLE_WEIGHT if title_end > 0 and token.idx < title_end else 1.0
                emotion_counts[emotion] += multiplier

        if total_words == 0:
            return {}

        scores: dict[str, float] = {}
        for emotion in EmotionCategory:
            count = emotion_counts.get(emotion, 0)
            if count > 0:
                scores[emotion.value] = round((count / total_words) * 1000, 1)

        return scores
