"""The two external word lists and their loaders.

`stopword_nouns.txt` and `person_blocklist.txt` are edited by hand, by people
who are not editing Python that day. These tests pin the parsing contract those
editors rely on (comments, blank lines, case, whitespace) and guard the one
mismatch that would make an entry silently do nothing: a normalization here that
differs from the normalization at the matching site in `analyzer.py`.
"""

from pathlib import Path

import pytest

from topic_classifier.analyzer import (
    PERSON_BLOCKLIST,
    STOPWORD_NOUNS,
    _load_person_blocklist,
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
    """Both loaders share one format; both are checked against it."""

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

    @pytest.mark.parametrize("load", [_load_stopword_nouns, _load_person_blocklist])
    def test_trims_surrounding_whitespace(self, load, write_list):
        assert load(write_list("  eintrag  \n\teingerueckt\n")) == {"eintrag", "eingerueckt"}

    @pytest.mark.parametrize("load", [_load_stopword_nouns, _load_person_blocklist])
    def test_is_case_insensitive(self, load, write_list):
        assert load(write_list("Gemischte Schreibweise\n")) == {"gemischte schreibweise"}

    @pytest.mark.parametrize("load", [_load_stopword_nouns, _load_person_blocklist])
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


class TestShippedLists:
    """The files that actually ship."""

    def test_both_lists_load_at_import(self):
        assert len(STOPWORD_NOUNS) > 100
        assert len(PERSON_BLOCKLIST) > 10

    def test_lists_live_next_to_the_analyzer(self):
        # The Dockerfile ships them via `COPY src/`. A list moved out of the
        # package directory would vanish from the image and only surface as a
        # crash at container start.
        assert (LIST_DIR / "stopword_nouns.txt").is_file()
        assert (LIST_DIR / "person_blocklist.txt").is_file()

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
