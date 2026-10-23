"""
test_backend.py — Comprehensive unit tests for the AI Research Assistant backend.

Run with:
    python -m unittest backend/tests/test_backend.py

Or from the backend/ directory:
    python -m unittest tests/test_backend.py
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# ── Path setup ────────────────────────────────────────────────────────────────
# Ensure the backend directory is on sys.path so that `import analyzer`,
# `import storage`, and `import app` all resolve correctly regardless of
# the working directory from which the tests are launched.

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── Stub out heavy third-party imports before loading any backend module ──────
# Several backend modules import google.generativeai, fitz, pdfminer, etc. at
# module level.  We stub them here so the tests can run without those packages
# being installed.

for _stub in [
    "google",
    "google.generativeai",
    "fitz",
    "pdfminer",
    "pdfminer.high_level",
    "pdfminer.layout",
    "bs4",
    "requests",
    "dotenv",
]:
    if _stub not in sys.modules:
        sys.modules[_stub] = MagicMock()

# python-dotenv's load_dotenv is called at app.py module level; stub it.
sys.modules["dotenv"].load_dotenv = lambda *a, **kw: None

# ── Now import the modules under test ────────────────────────────────────────

import analyzer
import storage

# ─────────────────────────────────────────────────────────────────────────────
# 1. analyzer.compute_stats()
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeStats(unittest.TestCase):
    """Tests for analyzer.compute_stats()."""

    def test_word_count_basic(self):
        text = "The quick brown fox jumps over the lazy dog."
        stats = analyzer.compute_stats(text)
        # 9 words
        self.assertEqual(stats["word_count"], 9)

    def test_sentence_count_excludes_short_sentences(self):
        # Sentences shorter than 30 chars are excluded from sentence_count.
        long_sent = "This is a sufficiently long sentence that should be counted properly."
        short_sent = "Short."
        text = long_sent + " " + short_sent
        stats = analyzer.compute_stats(text)
        # Only the long sentence qualifies (> 30 chars after strip).
        self.assertEqual(stats["sentence_count"], 1)

    def test_sentence_count_multiple_long_sentences(self):
        s1 = "Neural networks have transformed the field of natural language processing significantly."
        s2 = "Transformer architectures rely on self-attention mechanisms to capture long-range dependencies."
        s3 = "Large language models are pre-trained on vast corpora of text data."
        text = f"{s1} {s2} {s3}"
        stats = analyzer.compute_stats(text)
        self.assertGreaterEqual(stats["sentence_count"], 2)

    def test_unique_words_case_insensitive(self):
        text = "Apple apple APPLE orange"
        stats = analyzer.compute_stats(text)
        # "apple" (x3, case-folded) + "orange" = 2 unique
        self.assertEqual(stats["unique_words"], 2)

    def test_avg_sentence_length_single_sentence(self):
        # With one long sentence, avg_sentence_length == word_count.
        text = "This is a long sentence that contains exactly eleven words total."
        stats = analyzer.compute_stats(text)
        # avg = word_count / sentence_count; sentence_count >= 1
        self.assertIsInstance(stats["avg_sentence_length"], float)
        self.assertGreater(stats["avg_sentence_length"], 0)

    def test_empty_text_returns_zero_counts(self):
        stats = analyzer.compute_stats("")
        self.assertEqual(stats["word_count"], 0)
        self.assertEqual(stats["unique_words"], 0)

    def test_returns_all_expected_keys(self):
        stats = analyzer.compute_stats("Hello world. This is a test sentence for counting.")
        for key in ("word_count", "sentence_count", "avg_sentence_length", "unique_words"):
            self.assertIn(key, stats)


# ─────────────────────────────────────────────────────────────────────────────
# 2. analyzer.clean_text()
# ─────────────────────────────────────────────────────────────────────────────

class TestCleanText(unittest.TestCase):
    """Tests for analyzer.clean_text()."""

    def test_collapses_whitespace(self):
        text = "hello    world\t\tnewline\nhere"
        result = analyzer.clean_text(text)
        self.assertEqual(result, "hello world newline here")

    def test_strips_leading_trailing_whitespace(self):
        text = "   leading and trailing   "
        result = analyzer.clean_text(text)
        self.assertEqual(result, "leading and trailing")

    def test_removes_special_characters(self):
        # Characters outside \w \s . , ! ? ; : - should become spaces.
        text = "hello@world #hashtag $money"
        result = analyzer.clean_text(text)
        self.assertNotIn("@", result)
        self.assertNotIn("#", result)
        self.assertNotIn("$", result)

    def test_preserves_allowed_punctuation(self):
        text = "Hello, world! How are you? Fine: good; yes-no."
        result = analyzer.clean_text(text)
        for char in (",", "!", "?", ":", ";", "-", "."):
            self.assertIn(char, result)

    def test_preserves_alphanumeric_content(self):
        text = "Python3 is version 3.11 of the language."
        result = analyzer.clean_text(text)
        self.assertIn("Python3", result)
        self.assertIn("3.11", result)

    def test_multiple_newlines_collapsed(self):
        text = "line one\n\n\nline two\n\nline three"
        result = analyzer.clean_text(text)
        self.assertNotIn("\n", result)
        self.assertIn("line one", result)
        self.assertIn("line two", result)

    def test_already_clean_text_unchanged(self):
        text = "This text is already clean and tidy."
        result = analyzer.clean_text(text)
        self.assertEqual(result, text)


# ─────────────────────────────────────────────────────────────────────────────
# 3. analyzer._fallback_keywords()
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackKeywords(unittest.TestCase):
    """Tests for analyzer._fallback_keywords()."""

    def test_returns_list_of_dicts(self):
        text = "deep learning neural network transformer attention mechanism"
        result = analyzer._fallback_keywords(text)
        self.assertIsInstance(result, list)
        for item in result:
            self.assertIsInstance(item, dict)

    def test_each_dict_has_term_and_score(self):
        text = (
            "deep learning neural network transformer attention mechanism "
            "deep learning deep learning neural network neural network"
        )
        result = analyzer._fallback_keywords(text)
        self.assertTrue(len(result) > 0)
        for item in result:
            self.assertIn("term", item)
            self.assertIn("score", item)

    def test_respects_top_n(self):
        text = " ".join(["machine learning neural network transformer attention"] * 10)
        for n in (3, 5, 10):
            result = analyzer._fallback_keywords(text, top_n=n)
            self.assertLessEqual(len(result), n)

    def test_default_top_n_is_12(self):
        # Generate text with many distinct words to exercise the default cap.
        words = [f"algorithm{i} technique{i} framework{i}" for i in range(20)]
        text = " ".join(words)
        result = analyzer._fallback_keywords(text)
        self.assertLessEqual(len(result), 12)

    def test_filters_stopwords(self):
        # "the", "and", "or" are stopwords; they should not appear as keyword terms.
        text = "the and or but machine learning deep neural network"
        result = analyzer._fallback_keywords(text)
        terms = [kw["term"] for kw in result]
        for stopword in ("the", "and", "or", "but"):
            self.assertNotIn(stopword, terms)

    def test_score_is_numeric(self):
        text = "transformer attention mechanism language model fine-tuning"
        result = analyzer._fallback_keywords(text)
        for item in result:
            self.assertIsInstance(item["score"], (int, float))

    def test_empty_text_returns_empty_list(self):
        result = analyzer._fallback_keywords("")
        self.assertIsInstance(result, list)


# ─────────────────────────────────────────────────────────────────────────────
# Storage tests — each test class gets a fresh temp directory
# ─────────────────────────────────────────────────────────────────────────────

class _StorageTestBase(unittest.TestCase):
    """Mixin that creates an isolated temp dir and overrides storage.BASE_DIR."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        # Override the module-level BASE_DIR so all path helpers use it.
        storage.BASE_DIR = self.tmpdir

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)


# ─────────────────────────────────────────────────────────────────────────────
# 4. storage.create_workspace()
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateWorkspace(_StorageTestBase):
    """Tests for storage.create_workspace()."""

    def test_returns_metadata_dict(self):
        meta = storage.create_workspace("test query")
        self.assertIsInstance(meta, dict)

    def test_metadata_has_expected_fields(self):
        meta = storage.create_workspace("machine learning")
        for field in ("id", "query", "created_at", "last_opened", "favorite", "paper_count", "mode"):
            self.assertIn(field, meta)

    def test_query_stored_correctly(self):
        meta = storage.create_workspace("quantum computing")
        self.assertEqual(meta["query"], "quantum computing")

    def test_favorite_defaults_to_false(self):
        meta = storage.create_workspace("test")
        self.assertFalse(meta["favorite"])

    def test_paper_count_defaults_to_zero(self):
        meta = storage.create_workspace("test")
        self.assertEqual(meta["paper_count"], 0)

    def test_creates_workspace_folder_on_disk(self):
        meta = storage.create_workspace("folder test")
        wid = meta["id"]
        expected_dir = os.path.join(self.tmpdir, f"workspace_{wid}")
        self.assertTrue(os.path.isdir(expected_dir))

    def test_creates_uploads_subdirectory(self):
        meta = storage.create_workspace("uploads test")
        wid = meta["id"]
        uploads_dir = os.path.join(self.tmpdir, f"workspace_{wid}", "uploads")
        self.assertTrue(os.path.isdir(uploads_dir))

    def test_writes_metadata_json(self):
        meta = storage.create_workspace("json test")
        wid = meta["id"]
        meta_path = os.path.join(self.tmpdir, f"workspace_{wid}", "metadata.json")
        self.assertTrue(os.path.isfile(meta_path))
        with open(meta_path, "r", encoding="utf-8") as f:
            on_disk = json.load(f)
        self.assertEqual(on_disk["query"], "json test")
        self.assertEqual(on_disk["id"], wid)

    def test_id_is_8_chars(self):
        meta = storage.create_workspace("id length test")
        self.assertEqual(len(meta["id"]), 8)

    def test_mode_defaults_to_topic(self):
        meta = storage.create_workspace("mode test")
        self.assertEqual(meta["mode"], "topic")


# ─────────────────────────────────────────────────────────────────────────────
# 5. storage.save_analyses() / load_workspace() round-trip
# ─────────────────────────────────────────────────────────────────────────────

class TestSaveLoadAnalyses(_StorageTestBase):
    """Tests that save_analyses() + load_workspace() form a correct round-trip."""

    def setUp(self):
        super().setUp()
        self.meta = storage.create_workspace("round-trip test")
        self.wid = self.meta["id"]

    def test_save_and_load_single_analysis(self):
        analyses = [{"title": "Paper A", "summary": "A good paper."}]
        storage.save_analyses(self.wid, analyses)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["analyses"], analyses)

    def test_save_and_load_multiple_analyses(self):
        analyses = [
            {"title": "Paper A", "summary": "Summary A"},
            {"title": "Paper B", "summary": "Summary B"},
        ]
        storage.save_analyses(self.wid, analyses)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(len(ws["analyses"]), 2)
        self.assertEqual(ws["analyses"][1]["title"], "Paper B")

    def test_save_and_load_empty_analyses(self):
        storage.save_analyses(self.wid, [])
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["analyses"], [])

    def test_load_nonexistent_workspace_returns_none(self):
        result = storage.load_workspace("00000000")
        self.assertIsNone(result)

    def test_load_workspace_returns_all_keys(self):
        ws = storage.load_workspace(self.wid)
        for key in ("metadata", "papers", "analyses", "combined", "ideas", "chat"):
            self.assertIn(key, ws)

    def test_save_analyses_preserves_nested_data(self):
        analyses = [{"keywords": [{"term": "deep learning", "score": 5}], "stats": {"word_count": 100}}]
        storage.save_analyses(self.wid, analyses)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["analyses"][0]["keywords"][0]["term"], "deep learning")


# ─────────────────────────────────────────────────────────────────────────────
# 6. storage.toggle_favorite()
# ─────────────────────────────────────────────────────────────────────────────

class TestToggleFavorite(_StorageTestBase):
    """Tests for storage.toggle_favorite()."""

    def setUp(self):
        super().setUp()
        self.meta = storage.create_workspace("favorite test")
        self.wid = self.meta["id"]

    def test_initial_favorite_is_false(self):
        ws = storage.load_workspace(self.wid)
        self.assertFalse(ws["metadata"]["favorite"])

    def test_first_toggle_sets_true(self):
        result = storage.toggle_favorite(self.wid)
        self.assertTrue(result)

    def test_second_toggle_sets_false(self):
        storage.toggle_favorite(self.wid)   # True
        result = storage.toggle_favorite(self.wid)  # False
        self.assertFalse(result)

    def test_third_toggle_sets_true_again(self):
        storage.toggle_favorite(self.wid)   # True
        storage.toggle_favorite(self.wid)   # False
        result = storage.toggle_favorite(self.wid)  # True
        self.assertTrue(result)

    def test_toggle_persists_to_disk(self):
        storage.toggle_favorite(self.wid)
        ws = storage.load_workspace(self.wid)
        self.assertTrue(ws["metadata"]["favorite"])

    def test_toggle_returns_bool(self):
        result = storage.toggle_favorite(self.wid)
        self.assertIsInstance(result, bool)


# ─────────────────────────────────────────────────────────────────────────────
# 7. storage.save_combined() / load_workspace() — combined key
# ─────────────────────────────────────────────────────────────────────────────

class TestSaveLoadCombined(_StorageTestBase):
    """Tests that save_combined() data is retrievable through load_workspace()."""

    def setUp(self):
        super().setUp()
        self.meta = storage.create_workspace("combined test")
        self.wid = self.meta["id"]

    def test_combined_key_present_in_loaded_workspace(self):
        ws = storage.load_workspace(self.wid)
        self.assertIn("combined", ws)

    def test_combined_defaults_to_empty_dict(self):
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["combined"], {})

    def test_save_combined_round_trip(self):
        combined = {
            "title": "Combined: topic",
            "summary": "A merged overview.",
            "keywords": [{"term": "neural", "score": 3}],
        }
        storage.save_combined(self.wid, combined)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["combined"]["title"], "Combined: topic")
        self.assertEqual(ws["combined"]["summary"], "A merged overview.")

    def test_save_combined_overwrites_previous(self):
        storage.save_combined(self.wid, {"title": "First"})
        storage.save_combined(self.wid, {"title": "Second"})
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["combined"]["title"], "Second")

    def test_save_combined_with_nested_data(self):
        combined = {
            "research_gaps_flat": ["Gap A", "Gap B"],
            "future_scope_flat": ["Direction X"],
            "stats": {"word_count": 500},
        }
        storage.save_combined(self.wid, combined)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["combined"]["research_gaps_flat"], ["Gap A", "Gap B"])
        self.assertEqual(ws["combined"]["stats"]["word_count"], 500)


# ─────────────────────────────────────────────────────────────────────────────
# Import app helpers — done after stubbing so Flask and heavy deps load cleanly
# ─────────────────────────────────────────────────────────────────────────────

# We need to stub the modules that app.py imports at the top level before
# importing the app module itself.
sys.modules.setdefault("extractors", MagicMock())
sys.modules.setdefault("literature_review", MagicMock())
sys.modules.setdefault("llm", MagicMock())

import app as flask_app

# ─────────────────────────────────────────────────────────────────────────────
# 8. app._merge_str_lists()
# ─────────────────────────────────────────────────────────────────────────────

class TestMergeStrLists(unittest.TestCase):
    """Tests for app._merge_str_lists()."""

    def test_deduplicates_exact_duplicates(self):
        result = flask_app._merge_str_lists(["apple", "banana"], ["apple", "cherry"])
        self.assertEqual(result.count("apple"), 1)

    def test_deduplication_is_case_insensitive_for_first_60_chars(self):
        # "Apple" and "apple" share the same lowercased key → deduplicated.
        result = flask_app._merge_str_lists(["Apple pie is great"], ["apple pie is great"])
        self.assertEqual(len(result), 1)

    def test_preserves_insertion_order(self):
        result = flask_app._merge_str_lists(["first", "second"], ["third"])
        self.assertEqual(result, ["first", "second", "third"])

    def test_handles_empty_lists(self):
        result = flask_app._merge_str_lists([], [], [])
        self.assertEqual(result, [])

    def test_handles_single_empty_arg(self):
        result = flask_app._merge_str_lists([], ["hello", "world"])
        self.assertEqual(result, ["hello", "world"])

    def test_handles_none_args(self):
        # The function does `for item in (lst or [])`, so None is safe.
        result = flask_app._merge_str_lists(None, ["item"])
        self.assertEqual(result, ["item"])

    def test_merges_multiple_lists(self):
        a = ["one", "two"]
        b = ["three", "four"]
        c = ["five"]
        result = flask_app._merge_str_lists(a, b, c)
        self.assertEqual(len(result), 5)

    def test_long_strings_deduplicated_by_first_60_chars(self):
        # Two strings that share the same first 60 chars should be treated as duplicates.
        base = "a" * 60
        s1 = base + "SUFFIX_ONE"
        s2 = base + "SUFFIX_TWO"
        result = flask_app._merge_str_lists([s1], [s2])
        # Only one of the two should appear.
        self.assertEqual(len(result), 1)

    def test_returns_list(self):
        result = flask_app._merge_str_lists(["x"])
        self.assertIsInstance(result, list)


# ─────────────────────────────────────────────────────────────────────────────
# 9. app._merge_analyses()
# ─────────────────────────────────────────────────────────────────────────────

class TestMergeAnalyses(unittest.TestCase):
    """Tests for app._merge_analyses()."""

    def _make_result(self, idx=0):
        return {
            "summary": f"Summary {idx}",
            "abstract": f"Abstract text for paper {idx} with enough content.",
            "research_gaps_flat": [f"Gap {idx}A", f"Gap {idx}B"],
            "limitations": [f"Limitation {idx}"],
            "future_scope_flat": [f"Future {idx}"],
            "contributions": [f"Contribution {idx}"],
            "methods": [f"Method {idx}"],
            "keywords": [{"term": f"keyword{idx}", "score": idx + 1}],
            "important_sentences": [f"Sentence {idx}"],
        }

    def test_returns_dict(self):
        results = [self._make_result(0), self._make_result(1)]
        merged = flask_app._merge_analyses(results, "test topic")
        self.assertIsInstance(merged, dict)

    def test_research_gaps_flat_key_present(self):
        results = [self._make_result(0), self._make_result(1)]
        merged = flask_app._merge_analyses(results, "topic")
        self.assertIn("research_gaps_flat", merged)

    def test_future_scope_flat_key_present(self):
        results = [self._make_result(0), self._make_result(1)]
        merged = flask_app._merge_analyses(results, "topic")
        self.assertIn("future_scope_flat", merged)

    def test_title_includes_topic(self):
        results = [self._make_result(0), self._make_result(1)]
        merged = flask_app._merge_analyses(results, "climate change")
        self.assertIn("climate change", merged["title"])

    def test_deduplicates_research_gaps(self):
        # Both results share the same gap; merged list should contain it only once.
        r1 = self._make_result(0)
        r2 = self._make_result(0)  # identical
        merged = flask_app._merge_analyses([r1, r2], "topic")
        # "Gap 0A" appears in both but should only be in merged once.
        self.assertEqual(merged["research_gaps_flat"].count("Gap 0A"), 1)

    def test_stats_key_present(self):
        results = [self._make_result(0)]
        merged = flask_app._merge_analyses(results, "topic")
        self.assertIn("stats", merged)

    def test_keywords_sorted_by_score_descending(self):
        r1 = self._make_result(0)
        r1["keywords"] = [{"term": "low", "score": 1}, {"term": "high", "score": 9}]
        r2 = self._make_result(1)
        r2["keywords"] = [{"term": "mid", "score": 5}]
        merged = flask_app._merge_analyses([r1, r2], "topic")
        scores = [kw["score"] for kw in merged["keywords"]]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_limits_gaps_to_six(self):
        r = self._make_result(0)
        r["research_gaps_flat"] = [f"Gap {i}" for i in range(20)]
        merged = flask_app._merge_analyses([r], "topic")
        self.assertLessEqual(len(merged["research_gaps_flat"]), 6)

    def test_summary_concatenates_individual_summaries(self):
        r1 = self._make_result(0)
        r2 = self._make_result(1)
        merged = flask_app._merge_analyses([r1, r2], "topic")
        self.assertIn("Summary 0", merged["summary"])
        self.assertIn("Summary 1", merged["summary"])


# ─────────────────────────────────────────────────────────────────────────────
# 10. Flask route tests via test_client()
# ─────────────────────────────────────────────────────────────────────────────

class TestFlaskRoutes(_StorageTestBase):
    """Integration tests for Flask API routes using the test client."""

    def setUp(self):
        super().setUp()
        # Point storage at our temp dir for route tests that touch workspace data.
        storage.BASE_DIR = self.tmpdir

        # Provide a fake API key so /health reports api_key_configured=True.
        os.environ["GEMINI_API_KEY"] = "fake-test-key-12345"

        flask_app.app.config["TESTING"] = True
        self.client = flask_app.app.test_client()

    def tearDown(self):
        os.environ.pop("GEMINI_API_KEY", None)
        super().tearDown()

    # ── GET /health ───────────────────────────────────────────────────────────

    def test_health_returns_200(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)

    def test_health_status_is_ok(self):
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "ok")

    def test_health_api_key_configured_true_when_env_set(self):
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertTrue(data["api_key_configured"])

    def test_health_api_key_configured_false_when_env_missing(self):
        os.environ.pop("GEMINI_API_KEY", None)
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertFalse(data["api_key_configured"])

    def test_health_has_llm_field(self):
        resp = self.client.get("/health")
        data = json.loads(resp.data)
        self.assertIn("llm", data)

    # ── POST /analyze/text with empty body → 400 ──────────────────────────────

    def test_analyze_text_empty_body_returns_400(self):
        resp = self.client.post(
            "/analyze/text",
            data=json.dumps({"text": ""}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_analyze_text_missing_text_key_returns_400(self):
        resp = self.client.post(
            "/analyze/text",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_analyze_text_whitespace_only_returns_400(self):
        resp = self.client.post(
            "/analyze/text",
            data=json.dumps({"text": "   "}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_analyze_text_valid_input_calls_analyze_text(self):
        fake_result = {"summary": "Mocked summary", "keywords": []}
        with patch("app.analyze_text", return_value=fake_result) as mock_analyze:
            resp = self.client.post(
                "/analyze/text",
                data=json.dumps({"text": "Some actual text to analyze."}),
                content_type="application/json",
            )
            self.assertEqual(resp.status_code, 200)
            mock_analyze.assert_called_once()
            data = json.loads(resp.data)
            self.assertEqual(data["summary"], "Mocked summary")

    # ── GET /api/workspaces → 200, returns list ───────────────────────────────

    def test_get_workspaces_returns_200(self):
        resp = self.client.get("/api/workspaces")
        self.assertEqual(resp.status_code, 200)

    def test_get_workspaces_returns_list(self):
        resp = self.client.get("/api/workspaces")
        data = json.loads(resp.data)
        self.assertIsInstance(data, list)

    def test_get_workspaces_empty_when_none_created(self):
        resp = self.client.get("/api/workspaces")
        data = json.loads(resp.data)
        self.assertEqual(data, [])

    def test_get_workspaces_includes_created_workspace(self):
        # Create a workspace directly via storage, then verify the route lists it.
        meta = storage.create_workspace("visible workspace")
        resp = self.client.get("/api/workspaces")
        data = json.loads(resp.data)
        ids = [w["id"] for w in data]
        self.assertIn(meta["id"], ids)

    # ── POST /api/workspaces → 201, returns id ────────────────────────────────

    def test_create_workspace_returns_201(self):
        resp = self.client.post(
            "/api/workspaces",
            data=json.dumps({"query": "test topic"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_create_workspace_response_has_id(self):
        resp = self.client.post(
            "/api/workspaces",
            data=json.dumps({"query": "test topic"}),
            content_type="application/json",
        )
        data = json.loads(resp.data)
        self.assertIn("id", data)

    def test_create_workspace_response_has_correct_query(self):
        resp = self.client.post(
            "/api/workspaces",
            data=json.dumps({"query": "climate change research"}),
            content_type="application/json",
        )
        data = json.loads(resp.data)
        self.assertEqual(data["query"], "climate change research")

    def test_create_workspace_missing_query_uses_untitled(self):
        # When no query is provided the route defaults to "Untitled".
        resp = self.client.post(
            "/api/workspaces",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertEqual(data["query"], "Untitled")

    def test_create_workspace_persists_to_disk(self):
        resp = self.client.post(
            "/api/workspaces",
            data=json.dumps({"query": "persisted workspace"}),
            content_type="application/json",
        )
        wid = json.loads(resp.data)["id"]
        ws = storage.load_workspace(wid)
        self.assertIsNotNone(ws)
        self.assertEqual(ws["metadata"]["query"], "persisted workspace")

    # ── GET /api/workspaces/<wid> ─────────────────────────────────────────────

    def test_get_workspace_existing_returns_200(self):
        meta = storage.create_workspace("get-by-id test")
        resp = self.client.get(f"/api/workspaces/{meta['id']}")
        self.assertEqual(resp.status_code, 200)

    def test_get_workspace_nonexistent_returns_404(self):
        resp = self.client.get("/api/workspaces/00000000")
        self.assertEqual(resp.status_code, 404)

    # ── POST /api/workspaces/<wid>/chat ───────────────────────────────────────

    def test_add_chat_message_returns_201(self):
        meta = storage.create_workspace("chat test")
        resp = self.client.post(
            f"/api/workspaces/{meta['id']}/chat",
            data=json.dumps({"role": "user", "content": "Hello AI!"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_add_empty_chat_message_returns_400(self):
        meta = storage.create_workspace("chat empty test")
        resp = self.client.post(
            f"/api/workspaces/{meta['id']}/chat",
            data=json.dumps({"role": "user", "content": ""}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)


# ─────────────────────────────────────────────────────────────────────────────
# Additional edge-case tests
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeStatsEdgeCases(unittest.TestCase):
    """Additional edge cases for compute_stats."""

    def test_numbers_counted_as_words(self):
        # \b\w+\b matches digit-only tokens too.
        stats = analyzer.compute_stats("There are 42 items in 2 groups.")
        self.assertEqual(stats["word_count"], 7)

    def test_avg_sentence_length_is_rounded_to_one_decimal(self):
        text = (
            "This is a moderately long sentence that should qualify for counting. "
            "Another sentence here to make the average non-trivial and realistic."
        )
        stats = analyzer.compute_stats(text)
        # The result must be a float with at most one decimal place.
        self.assertIsInstance(stats["avg_sentence_length"], float)
        rounded = round(stats["avg_sentence_length"], 1)
        self.assertEqual(stats["avg_sentence_length"], rounded)


class TestStoragePapers(_StorageTestBase):
    """Tests for storage.save_papers() and paper_count side effect."""

    def setUp(self):
        super().setUp()
        self.meta = storage.create_workspace("papers test")
        self.wid = self.meta["id"]

    def test_save_papers_updates_paper_count_in_metadata(self):
        papers = [{"title": "Paper 1"}, {"title": "Paper 2"}, {"title": "Paper 3"}]
        storage.save_papers(self.wid, papers)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["metadata"]["paper_count"], 3)

    def test_save_papers_round_trip(self):
        papers = [{"title": "Alpha", "abstract": "Abstract A"}]
        storage.save_papers(self.wid, papers)
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["papers"][0]["title"], "Alpha")

    def test_save_empty_papers_resets_count_to_zero(self):
        storage.save_papers(self.wid, [{"title": "Temp"}])
        storage.save_papers(self.wid, [])
        ws = storage.load_workspace(self.wid)
        self.assertEqual(ws["metadata"]["paper_count"], 0)


class TestStorageListWorkspaces(_StorageTestBase):
    """Tests for storage.list_workspaces()."""

    def test_empty_base_dir_returns_empty_list(self):
        # No workspaces created; BASE_DIR is empty.
        result = storage.list_workspaces()
        self.assertEqual(result, [])

    def test_lists_created_workspaces(self):
        storage.create_workspace("ws one")
        storage.create_workspace("ws two")
        result = storage.list_workspaces()
        self.assertEqual(len(result), 2)

    def test_sorted_by_last_opened_descending(self):
        import time
        storage.create_workspace("oldest")
        time.sleep(0.01)  # ensure distinct timestamps
        storage.create_workspace("newest")
        result = storage.list_workspaces()
        # Most recently created/opened should come first.
        self.assertEqual(result[0]["query"], "newest")

    def test_nonexistent_base_dir_returns_empty_list(self):
        storage.BASE_DIR = os.path.join(self.tmpdir, "nonexistent")
        result = storage.list_workspaces()
        self.assertEqual(result, [])


class TestStorageDeleteWorkspace(_StorageTestBase):
    """Tests for storage.delete_workspace()."""

    def test_delete_existing_workspace_returns_true(self):
        meta = storage.create_workspace("to delete")
        result = storage.delete_workspace(meta["id"])
        self.assertTrue(result)

    def test_delete_removes_folder_from_disk(self):
        meta = storage.create_workspace("to remove")
        wid = meta["id"]
        storage.delete_workspace(wid)
        ws_dir = os.path.join(self.tmpdir, f"workspace_{wid}")
        self.assertFalse(os.path.exists(ws_dir))

    def test_delete_nonexistent_workspace_returns_false(self):
        result = storage.delete_workspace("00000000")
        self.assertFalse(result)

    def test_load_after_delete_returns_none(self):
        meta = storage.create_workspace("ephemeral")
        storage.delete_workspace(meta["id"])
        ws = storage.load_workspace(meta["id"])
        self.assertIsNone(ws)


if __name__ == "__main__":
    unittest.main()
