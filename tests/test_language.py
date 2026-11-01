"""Tests for the language files in languages/: one JSON file per language.

The texts in the code are English. A language file maps English text -> translated text. For every language:
the file is valid, every text of the interface and of the server messages has a translation (unless the file says
"complete": false in its "language" block, then missing texts only fall back to English), nothing unused is in the file,
and placeholders and plural notation agree with the English text.
Run in the Grimmich folder:   python3 -m unittest tests.test_language"""
import ast
import glob
import json
import os
import re
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACEHOLDER = re.compile(r"\{(\w+)(?::([^{}|]*)\|([^{}]*))?\}")


def name_list(text):
    return sorted(set(m.group(1) for m in PLACEHOLDER.finditer(text)))


def language_files():
    return sorted(glob.glob(os.path.join(HERE, "languages", "*.json")))


def load(path_):
    with open(path_, encoding="utf-8") as f:
        return json.load(f)


def js_keys():
    """All texts that are translated in web/js and index.html: tr("..."), tr(cond ? "..." : "...") and data-t."""
    found = {}
    for f in sorted(glob.glob(os.path.join(HERE, "web", "js", "**", "*.js"), recursive=True)):
        if os.path.basename(f) == "language.js":
            continue
        s = open(f, encoding="utf-8").read()
        for m in re.finditer(r'\btr\(\s*"((?:[^"\\\n]|\\.)*)"(?:\s*\?\s*"((?:[^"\\\n]|\\.)*)"\s*:\s*"((?:[^"\\\n]|\\.)*)")?', s):
            for g in m.groups():
                if g is not None:
                    found.setdefault(json.loads('"' + g + '"'), f)
        for m in re.finditer(r'\btr\([^"\n]*\?\s*"((?:[^"\\\n]|\\.)*)"\s*:\s*"((?:[^"\\\n]|\\.)*)"', s):
            for g in m.groups():
                found.setdefault(json.loads('"' + g + '"'), f)
    h = open(os.path.join(HERE, "web", "index.html"), encoding="utf-8").read()
    for m in re.finditer(r'data-t="([^"]+)"', h):
        found.setdefault(m.group(1), "index.html")
    for m in re.finditer(r'data-t-attr="[\w-]+\|([^"]+)"', h):
        found.setdefault(m.group(1), "index.html")
    return found


def python_keys():
    """First arguments of t(...) / tx(...) / messages.tx(...) in the server code."""
    found = {}
    for f in sorted(glob.glob(os.path.join(HERE, "*.py"))):
        tree = ast.parse(open(f, encoding="utf-8").read())
        for n in ast.walk(tree):
            if isinstance(n, ast.Call) and n.args and isinstance(n.args[0], ast.Constant) and isinstance(n.args[0].value, str):
                fn = n.func
                name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else ""
                if name in ("t", "tx") and os.path.basename(f) != "messages.py":
                    found.setdefault(n.args[0].value, f)
    return found


def all_sources():
    s = ""
    for f in glob.glob(os.path.join(HERE, "*.py")) + glob.glob(os.path.join(HERE, "web", "js", "**", "*.js"), recursive=True) + [os.path.join(HERE, "web", "index.html")]:
        s += open(f, encoding="utf-8").read()
    return s


class LanguageFiles(unittest.TestCase):
    def test_there_is_english_and_every_file_is_valid(self):
        codes = []
        for p in language_files():
            doc = load(p)
            meta = doc.get("language") or {}
            self.assertEqual(meta.get("code"), os.path.basename(p)[:-5], p)
            self.assertTrue(meta.get("name"), p)
            self.assertIsInstance(doc.get("texts"), dict, p)
            codes.append(meta["code"])
        self.assertIn("en", codes)

    def test_every_text_is_translated(self):
        keys = set(js_keys()) | set(python_keys())
        for p in language_files():
            doc = load(p)
            if doc["language"]["code"] == "en" or doc["language"].get("complete") is False:
                continue
            missing = [k for k in keys if k not in doc["texts"] and k.strip()]
            self.assertEqual(missing, [], "%s: not translated: %s" % (p, missing[:5]))

    def test_nothing_unused(self):
        src = all_sources()
        for p in language_files():
            unused = [k for k in load(p)["texts"] if json.dumps(k, ensure_ascii=False)[1:-1] not in src and k.replace("\\", "") not in src]
            self.assertEqual(unused, [], "%s: not used any more: %s" % (p, unused[:5]))

    def test_placeholders_agree(self):
        for p in language_files():
            bad = [k for k, v in load(p)["texts"].items() if name_list(k) != name_list(v)]
            self.assertEqual(bad, [], "%s: placeholders differ: %s" % (p, bad[:3]))

    def test_no_empty_translations(self):
        for p in language_files():
            self.assertEqual([k for k, v in load(p)["texts"].items() if not str(v).strip()], [], p)

    def test_no_expressions_in_keys(self):
        self.assertEqual([k for k in js_keys() if "${" in k], [])


class ServerSide(unittest.TestCase):
    def setUp(self):
        import messages
        self.texts = messages

    def tearDown(self):
        self.texts.set_language(None)

    def test_english_is_the_text_in_the_code(self):
        self.texts.set_language("en")
        self.assertEqual(self.texts.t("Album “{name}” found.", name="X"), "Album “X” found.")

    def test_german_comes_from_the_language_file(self):
        self.texts.set_language("de")
        self.assertEqual(self.texts.t("Album “{name}” found.", name="X"), "Album „X“ gefunden.")

    def test_region_variants_use_the_language(self):
        self.texts.set_language("de-AT")
        self.assertEqual(self.texts.language(), "de")

    def test_unknown_text_stays(self):
        self.texts.set_language("de")
        self.assertEqual(self.texts.t("Not translated {a}", a=1), "Not translated 1")

    def test_list_of_languages(self):
        codes = [x["code"] for x in self.texts.available()]
        self.assertEqual(codes[0], "en")
        self.assertIn("de", codes)


if __name__ == "__main__":
    unittest.main()
