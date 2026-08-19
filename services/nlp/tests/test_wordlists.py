"""The three external word lists and their loaders.

`stopword_nouns.txt`, `person_blocklist.txt` and `person_stop_tokens.txt` are
edited by hand, by people
who are not editing Python that day. These tests pin the parsing contract those
editors rely on (comments, blank lines, case, whitespace) and guard the one
mismatch that would make an entry silently do nothing: a normalization here that
differs from the normalization at the matching site in `analyzer.py`.
"""

from pathlib import Path

import pytest

from topic_classifier.analyzer import (
    PERSON_BLOCKLIST,
    PERSON_STOP_TOKENS,
    STOPWORD_NOUNS,
    _load_person_blocklist,
    _load_person_stop_tokens,
    _load_stopword_nouns,
)

LIST_DIR = Path(__file__).resolve().parents[1] / "src" / "topic_classifier"


@pytest.fixture
def write_list(tmp_path: Path):
    def _write(content: str) -> Path:
        path = tmp_path / "list.txt"
        path.write_text(content, encoding="utf-8")
        return path

    return _write


class TestLoaderParsing:
    """All three loaders share one format; all three are checked against it."""

    # `_load_person_stop_tokens` is absent here on purpose: it rejects the
    # multi-word entries this fixture writes. Its own case follows below.
    @pytest.mark.parametrize("load", [_load_stopword_nouns, _load_person_blocklist])
    def test_skips_comments_and_blank_lines(self, load, write_list):
        path = write_list(
            "# eine Überschrift\n"
            "\n"
            "echter eintrag\n"
            "   \n"
            "# noch ein Kommentar\n"
            "zweiter eintrag\n"
        )
        assert load(path) == {"echter eintrag", "zweiter eintrag"}

    @pytest.mark.parametrize(
        "load", [_load_stopword_nouns, _load_person_blocklist, _load_person_stop_tokens]
    )
    def test_trims_surrounding_whitespace(self, load, write_list):
        assert load(write_list("  eintrag  \n\teingerueckt\n")) == {"eintrag", "eingerueckt"}

    def test_stop_tokens_skip_comments_and_blank_lines(self, write_list):
        content = "# Überschrift\n\neintrag\n   \n# Kommentar\nzweiter\n"
        assert _load_person_stop_tokens(write_list(content)) == {"eintrag", "zweiter"}

    @pytest.mark.parametrize("load", [_load_stopword_nouns, _load_person_blocklist])
    def test_is_case_insensitive(self, load, write_list):
        assert load(write_list("Gemischte Schreibweise\n")) == {"gemischte schreibweise"}

    def test_stop_tokens_are_case_insensitive(self, write_list):
        assert _load_person_stop_tokens(write_list("Landesvorsitzende\n")) == {
            "landesvorsitzende"
        }

    @pytest.mark.parametrize(
        "load", [_load_stopword_nouns, _load_person_blocklist, _load_person_stop_tokens]
    )
    def test_empty_file_is_not_an_error(self, load, write_list):
        assert load(write_list("# nur ein Kommentar\n")) == set()


class TestPersonBlocklistNormalization:
    """The blocklist matches full names, so its normalization is load-bearing."""

    def test_collapses_internal_whitespace(self, write_list):
        # A stray double space in a hand-edited list must not silently disable
        # the entry — the name arriving from the NER has single spaces.
        assert _load_person_blocklist(write_list("Vincent   Willock\n")) == {"vincent willock"}

    def test_casefolds_sharp_s(self, write_list):
        # casefold(), not lower(): 'ß' folds to 'ss', which is how the name is
        # normalized in extract_persons_batch. lower() would leave 'meißner'
        # here and never match a document spelling it "Meissner".
        assert _load_person_blocklist(write_list("Meißner\n")) == {"meissner"}


class TestPersonStopTokens:
    """One token per line — an entry with a space could never match."""

    def test_rejects_a_multi_word_entry(self, write_list):
        # Loud at import rather than a line that silently does nothing: the
        # matching site compares against a single token at a time.
        with pytest.raises(ValueError, match="Leerzeichen"):
            _load_person_stop_tokens(write_list("landesvorsitzende berlin\n"))


class TestShippedLists:
    """The files that actually ship."""

    def test_all_lists_load_at_import(self):
        assert len(STOPWORD_NOUNS) > 100
        assert len(PERSON_BLOCKLIST) > 10
        assert len(PERSON_STOP_TOKENS) > 10

    def test_lists_live_next_to_the_analyzer(self):
        # The Dockerfile ships them via `COPY src/`. A list moved out of the
        # package directory would vanish from the image and only surface as a
        # crash at container start.
        assert (LIST_DIR / "stopword_nouns.txt").is_file()
        assert (LIST_DIR / "person_blocklist.txt").is_file()
        assert (LIST_DIR / "person_stop_tokens.txt").is_file()

    def test_every_data_file_is_declared_as_package_data(self):
        # setuptools ships .py files only. A word list not covered by the
        # package-data globs disappears from `pip install .` and the analyzer
        # then raises FileNotFoundError at import — the Docker image dodges it
        # by copying src/ wholesale, so nothing else would notice.
        import fnmatch
        import tomllib

        pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
        globs = tomllib.loads(pyproject.read_text(encoding="utf-8"))["tool"]["setuptools"][
            "package-data"
        ]["topic_classifier"]

        data_files = [p.name for p in LIST_DIR.iterdir() if p.is_file() and p.suffix != ".py"]
        assert data_files
        for name in data_files:
            assert any(fnmatch.fnmatch(name, g) for g in globs), name

    def test_known_entries_are_present(self):
        assert "unsplash" in PERSON_BLOCKLIST
        assert "vincent willock" in PERSON_BLOCKLIST

    def test_entries_are_stored_normalized(self):
        # Guards against a future entry that can never match: anything with
        # uppercase, padding or doubled spaces left in it.
        for name in PERSON_BLOCKLIST:
            assert name == " ".join(name.split()).casefold(), name

    def test_no_single_word_entry_is_shorter_than_the_ner_floor(self):
        # extract_persons_batch drops candidates below 3 characters before it
        # ever consults the blocklist, so a shorter entry is dead weight.
        for name in PERSON_BLOCKLIST:
            assert len(name) >= 3, name


class TestStopTokensDoNotEatSurnames:
    """A stop token blocks its word everywhere, including inside a real name."""

    def test_no_entry_is_a_common_surname(self):
        # "Graf", "Meister", "Ritter", "Weber", "Richter", "Schulze" are German
        # surnames as well as functions; an entry here would truncate the name
        # of every politician carrying one.
        forbidden = {
            "graf",
            "meister",
            "ritter",
            "weber",
            "richter",
            "schulze",
            "bauer",
            "koch",
            "vogt",
            "schmied",
        }
        assert not (PERSON_STOP_TOKENS & forbidden)
