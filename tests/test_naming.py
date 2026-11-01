"""Tests: the words Grimmich writes into Immich (tags, 'dating open', source marker) are chosen once and stay."""
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
ORIGINAL = os.getcwd()
import messages  # noqa: E402
import naming  # noqa: E402
import storage  # noqa: E402

os.chdir(ORIGINAL)


class Base(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.folder = tempfile.mkdtemp(prefix="naming_test_")
        os.chdir(self.folder)
        storage._migrated.clear()
        self.language = os.environ.get("GRIMMICH_LANGUAGE")

    def tearDown(self):
        os.chdir(self.old)
        storage._migrated.clear()
        messages.set_language(None)
        if self.language is None:
            os.environ.pop("GRIMMICH_LANGUAGE", None)
        else:
            os.environ["GRIMMICH_LANGUAGE"] = self.language
        shutil.rmtree(self.folder, ignore_errors=True)


class TestChoice(Base):
    def test_new_installation_in_english_gets_english_words(self):
        os.environ["GRIMMICH_LANGUAGE"] = "en"
        names = naming.active()
        self.assertEqual((names["tag_estimated"], names["tag_open"], names["source"]), ("Dating estimated", "Dating open", "Source"))

    def test_new_installation_in_german_gets_german_words(self):
        os.environ["GRIMMICH_LANGUAGE"] = "de"
        self.assertEqual(naming.active()["tag_estimated"], "Datierung geschätzt")

    def test_installation_that_already_wrote_keeps_german_words_in_english(self):
        storage.save("dating_written.json", {"F1": {"date": "1960-01-01"}})
        os.environ["GRIMMICH_LANGUAGE"] = "en"
        self.assertEqual(naming.active()["tag_open"], "Datierung offen")

    def test_choice_stays_after_freeze_even_if_the_language_changes(self):
        os.environ["GRIMMICH_LANGUAGE"] = "en"
        naming.freeze()
        os.environ["GRIMMICH_LANGUAGE"] = "de"
        self.assertEqual(naming.active()["tag_estimated"], "Dating estimated")

    def test_not_stored_before_freeze(self):
        os.environ["GRIMMICH_LANGUAGE"] = "en"
        naming.active()
        self.assertIsNone(storage.load(naming.DOCUMENT, None))

    def test_reading_recognises_every_spelling(self):
        os.environ["GRIMMICH_LANGUAGE"] = "en"
        for key in naming.KEYS:
            self.assertIn(naming.GERMAN[key], naming.variants(key))
            self.assertIn(naming.ENGLISH[key], naming.variants(key))


if __name__ == "__main__":
    unittest.main()
