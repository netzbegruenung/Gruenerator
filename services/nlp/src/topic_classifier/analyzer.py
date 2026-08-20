"""spaCy-based topic classifier for German news articles.

Loads de_core_news_lg, extracts lemmatized nouns, matches against
topic lexicons, and returns per-topic scores.

Features:
- Headline weighting: title matches count 3x (headlines carry strongest topical signal)
- Political actor mapping: politician names serve as topic signals via TOPIC_MULTI_LABEL
- Emotion analysis with negation window (delegated to EmotionAnalyzer)
"""

import re
from collections import Counter
from pathlib import Path

import spacy

from .constants import TITLE_WEIGHT
from .emotion_analyzer import EmotionAnalyzer
from .lexicons import TopicCategory, get_topic_labels

# External, maintainable stopword list. Edit stopword_nouns.txt to add/remove
# words — one lowercase lemma per line; '#' lines and blanks are ignored.
_STOPWORD_NOUNS_FILE = Path(__file__).parent / "stopword_nouns.txt"

# Namen, die die NER als PER taggt, die aber keine inhaltlich erwähnte Person
# sind: Bildquellen ("Unsplash") und Mitarbeitende/Fotograf*innen der LV-Seiten.
_PERSON_BLOCKLIST_FILE = Path(__file__).parent / "person_blocklist.txt"

# Wörter, an denen ein Name endet: Funktionen, Organisationsteile und
# Adressbestandteile, die die NER aus PDF-Briefköpfen in die Spanne zieht.
_PERSON_STOP_TOKENS_FILE = Path(__file__).parent / "person_stop_tokens.txt"


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


def _load_person_blocklist(path: Path) -> set[str]:
    """Load blocked person names from the external list.

    One name per line; blank lines and lines starting with '#' are ignored.
    Names are casefolded and their internal whitespace collapsed so they match
    the normalized form built in `extract_persons_batch` (casefold, not lower:
    it also folds 'ß' to 'ss', so 'Meißner' and 'Meissner' are one entry).
    """
    names: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        names.add(" ".join(line.split()).casefold())
    return names


PERSON_BLOCKLIST = _load_person_blocklist(_PERSON_BLOCKLIST_FILE)


def _load_person_stop_tokens(path: Path) -> set[str]:
    """Load the tokens a name ends before.

    Same format as the other two lists. Single words, casefolded — they are
    compared against one token at a time in `_name_from_entity`, so an entry
    with a space in it could never match and is rejected on the spot rather
    than silently doing nothing.
    """
    tokens: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        token = line.casefold()
        if " " in token:
            raise ValueError(
                f"{path.name}: '{line}' hat ein Leerzeichen — die Liste matcht "
                "einzelne Tokens und könnte diesen Eintrag nie treffen"
            )
        tokens.add(token)
    return tokens


PERSON_STOP_TOKENS = _load_person_stop_tokens(_PERSON_STOP_TOKENS_FILE)

# Titles and parliamentary abbreviations spaCy keeps inside a PER span. Named
# rather than left to the POS pass because the tagging is inconsistent: "Dr."
# comes back as NOUN and "MdL" as PROPN, and only the first would be cut.
_TITLE_TOKENS = frozenset(
    {"mdb", "mdl", "mda", "mdep", "mep", "dr", "prof", "herr", "herrn", "frau"}
)

# Lowercase particles that are part of a surname ("Thomas von Sarnowski"). The
# POS pass would otherwise cut the name at them — they are tagged ADP/DET.
_NAME_PARTICLES = frozenset(
    {
        "von", "vom", "van", "zu", "zum", "zur", "der", "den", "dem", "de",
        "del", "della", "di", "da", "das", "dos", "la", "le", "el", "ter",
        "ten", "af", "av", "bin", "ibn", "y",
    }
)


def _name_from_entity(ent) -> str:
    """Reduce a PER span to the name itself.

    Two problems the raw span text has, both measured on the live corpus:
    a leading role or title ("Verkehrsminister Mansoori", "Dr. Terpe") and a
    trailing run of whatever followed the name in a PDF letterhead
    ("Werner Graf Landesvorsitzende Landesgeschäftsstelle Kommandantenstr").

    Both are cut in two steps. `PERSON_STOP_TOKENS` (person_stop_tokens.txt)
    ends the name before a known function or address word — needed because the
    model tags "Landesvorsitzende" as ADJ in one sentence and PROPN in the
    next. What is left is then cut by the POS tags the pipeline already
    produces: the name starts at the first proper noun and ends before the
    first token that is neither a proper noun nor a surname particle. Docs
    without POS annotation (the hand-built ones in the tests, and any pipeline
    run without a tagger) skip that second step rather than truncating
    everything to one token.
    """
    tokens = [t for t in ent if not t.is_space]
    tokens = [t for t in tokens if t.text.casefold().rstrip(".") not in _TITLE_TOKENS]

    for index, token in enumerate(tokens):
        if token.text.casefold().rstrip(".") in PERSON_STOP_TOKENS:
            tokens = tokens[:index]
            break

    if any(t.pos_ for t in tokens):
        start = next((i for i, t in enumerate(tokens) if t.pos_ == "PROPN"), None)
        if start is None:
            return ""
        kept = [tokens[start]]
        for token in tokens[start + 1 :]:
            if token.pos_ == "PROPN" or token.text.casefold() in _NAME_PARTICLES:
                kept.append(token)
            else:
                break
        while kept and kept[-1].text.casefold() in _NAME_PARTICLES:
            kept.pop()
        tokens = kept

    return " ".join(t.text for t in tokens)


def _normalize_surface(name: str) -> str:
    """Collapse whitespace, repair PDF hyphenation, strip edge punctuation.

    `Dieter Grü- newald` is one document's line break, not a second person —
    it stood in the live facet with 179 documents next to `Dieter Grünewald`.
    """
    name = re.sub(r"(\w)-\s+(\w)", r"\1\2", name)
    return " ".join(name.split()).strip(" .,;:\"'()-–")


def _is_blocked(norm: str) -> bool:
    """Whether a normalized name matches the blocklist.

    A blocked entry blocks every candidate that *contains* it as a whole token
    sequence, so one `unsplash` line also kills `Unsplash Gemeinsame` — the NER
    happily glues the next capitalized word onto an image credit.
    """
    if norm in PERSON_BLOCKLIST:
        return True
    tokens = norm.split()
    for blocked in PERSON_BLOCKLIST:
        parts = blocked.split()
        span = len(parts)
        if span >= len(tokens):
            continue
        if any(tokens[i : i + span] == parts for i in range(len(tokens) - span + 1)):
            return True
    return False


def _degenitive(norm: str, known: set[str]) -> str | None:
    """`wladimir putins` → `wladimir putin`, but only if that form was seen."""
    head, _, last = norm.rpartition(" ")
    if not last.endswith("s") or len(last) < 4:
        return None
    candidate = f"{head} {last[:-1]}".strip()
    return candidate if candidate in known else None


def _canonical_names(names: set[str]) -> dict[str, str | None]:
    """Map every extracted name to the name it should be counted as.

    Two folds, in order, and then one drop:

    * **Genitive** — `Söders` is `Söder`, `Markus Söders` is `Markus Söder`.
      Only folded when the base form actually occurs, so a real name ending in
      -s survives.
    * **Bare surname** — `Merz` is folded into `Friedrich Merz` when that is the
      *only* full name in the batch ending on it. Ambiguous ones (`Wegner` has a
      Jutta and a Kai) are not guessed at.
    * Whatever is still a single token afterwards is dropped. That is the exit
      for the largest noise class in the live facet — `Link` (1938 documents),
      `Messlatte`, `Kitas`, `Foto` — and it also keeps the facet pickable: a
      list of full names is what a person can choose from.
    """
    canonical: dict[str, str | None] = {}

    folded: dict[str, str] = {}
    for name in names:
        base = _degenitive(name, names)
        folded[name] = base if base else name

    after_genitive = set(folded.values())
    full_names_by_last: dict[str, list[str]] = {}
    for name in after_genitive:
        if " " in name:
            full_names_by_last.setdefault(name.rsplit(" ", 1)[1], []).append(name)

    for name, base in folded.items():
        if " " in base:
            canonical[name] = base
            continue
        canonical[name] = _fold_surname(base, full_names_by_last)

    return canonical


def _fold_surname(surname: str, full_names_by_last: dict[str, list[str]]) -> str | None:
    """The one full name a bare surname belongs to, or None to drop it.

    Tried genitive-last, because a batch can hold `Söders` and `Markus Söder`
    without the intermediate `Söder` ever appearing on its own.
    """
    candidates = [surname]
    if surname.endswith("s") and len(surname) >= 4:
        candidates.append(surname[:-1])
    for candidate in candidates:
        matches = full_names_by_last.get(candidate, [])
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            return None
    return None



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

        The raw NER output is not usable as a filter facet on its own: measured
        against the live Qdrant payloads it produced role-contaminated spans
        ("Werner Graf Landesvorsitzende Wahlprüfsteine"), hyphenation artefacts
        from PDFs ("Dieter Grü- newald"), genitives as separate people ("Putins"
        next to "Putin") and bare surnames next to the full name ("Merz" next to
        "Friedrich Merz"). Four passes clean that up, in this order:

        1. `_name_from_entity` cuts titles and role words off the span.
        2. `_normalize_surface` repairs hyphenation and strips punctuation.
        3. `PERSON_BLOCKLIST` drops non-people (image credits, staff).
        4. `_canonical_names` folds genitives and bare surnames into the full
           name, and drops every single-token name that has no full name to fold
           into — that is where the "Link"/"Messlatte" class of NER noise dies.

        Returns a ranked list of {person, count} dicts.
        """
        # Names per document (deduplicated inside a document), so the canonical
        # pass below can rewrite them before anything is counted.
        per_doc: list[set[str]] = []
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
                name = _normalize_surface(_name_from_entity(ent))
                # Names are capitalized; drop length-1 fragments and lowercase noise.
                if len(name) < 3 or not name[0].isupper():
                    continue
                norm = name.casefold()
                if _is_blocked(norm):
                    continue
                seen_in_doc.add(norm)
                surface_counts.setdefault(norm, Counter())[name] += 1
            per_doc.append(seen_in_doc)

        canonical = _canonical_names({n for names in per_doc for n in names})

        doc_counts: Counter[str] = Counter()
        for names in per_doc:
            resolved = {canonical[n] for n in names if canonical.get(n)}
            doc_counts.update(resolved)

        results = []
        for norm, count in doc_counts.most_common(top_n):
            # most frequent surface spelling becomes the display name
            display = surface_counts[norm].most_common(1)[0][0]
            results.append({"person": display, "count": count})

        return results
