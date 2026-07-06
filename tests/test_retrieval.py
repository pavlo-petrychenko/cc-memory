#!/usr/bin/env python3
"""Integration tests for cc-memory retrieval — no Claude session required.

Builds a throwaway vault + SQLite index in a temp dir and exercises the real
tokenizer / indexer / search / fusion / resolution code paths end to end.

Run:  python3 -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import textwrap
import unittest

_SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(__file__))), "src")
sys.path.insert(0, _SRC)
from lib import index, registry, resolve  # noqa: E402


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(textwrap.dedent(text).lstrip("\n"))


# note relpath -> markdown body. Titles come from the H1.
NOTES = {
    "Alpha/Alpha.md": """
        ---
        type: index
        ---
        # Alpha
        > Index for the Alpha feature.
        - [[Alpha/Injection Hook|Injection Hook]]
    """,
    "Alpha/Injection Hook.md": """
        ---
        type: note
        importance: 6
        ---
        # Injection Hook
        The hook extracts salient tokens and keeps injecting them into the prompt.
        Wrap-gate blocking happens on Stop.
    """,
    "Alpha/Search Ranking.md": """
        ---
        type: note
        ---
        # Search Ranking
        BM25 ranking with phrase proximity.

        ## Related
        - depends_on [[Alpha/Injection Hook|Injection Hook]]
    """,
    "Alpha/Scoring Camel.md": """
        ---
        type: note
        ---
        # Scoring Camel
        The overallScore field is an unbounded holistic number.
    """,
    "Beta/Title Kryptonite.md": """
        ---
        type: note
        ---
        # Kryptonite Handbook
        General notes about assorted green minerals and their uses.
    """,
    "Beta/Body Kryptonite.md": """
        ---
        type: note
        ---
        # Mineral Notes
        This document happens to mention kryptonite exactly once in its body text.
    """,
    "Gamma/Adjacent.md": """
        ---
        type: note
        ---
        # Fast Vehicle
        The red car is very fast.
    """,
    "Gamma/Apart.md": """
        ---
        type: note
        ---
        # Orchard Trip
        Red apples are quite tasty and then much later i finally drove a car back home.
    """,
}

WORKLOGS = {
    "wt1/STATE.md": "# wt1\n## Current focus\nnothing\n",
    "wt1/2026-01-01.md": "## 10:00 — incident\n**Changes:** deployment rollback incident on the gateway.\n",
}


class RetrievalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        kb = self.tmp.name
        wl = os.path.join(kb, "_Worklogs")
        for rel, body in NOTES.items():
            _write(os.path.join(kb, rel), body)
        for rel, body in WORKLOGS.items():
            _write(os.path.join(wl, rel), body)
        self.ws = {
            "id": "test", "match": [kb], "kb": kb, "worklogs": wl,
            "exclude": ["_Worklogs", ".obsidian"],
            "index_db": os.path.join(self.tmp.name, "_idx", "index.db"),
        }
        stats = index.build(self.ws, incremental=False)
        self.assertEqual(stats["total"], len(NOTES))

    def tearDown(self):
        self.tmp.cleanup()

    def _paths(self, hits):
        return [index._relkey(h["path"], self.ws["kb"]) for h in hits]

    # --- tokenization -----------------------------------------------------
    def test_salient_tokens_filters(self):
        toks = index.salient_tokens("How do the wrap-gate and overallScore work with db?")
        self.assertIn("wrap", toks)
        self.assertIn("gate", toks)
        self.assertIn("overall", toks)   # camel split
        self.assertIn("score", toks)
        self.assertIn("overallscore", toks)  # glued form
        self.assertIn("db", toks)         # 2-char identifier kept
        self.assertNotIn("how", toks)     # stopword dropped
        self.assertNotIn("the", toks)

    def test_no_pure_digits(self):
        self.assertNotIn("2026", index.salient_tokens("the 2026 plan"))

    # --- stemming ---------------------------------------------------------
    def test_porter_stemming(self):
        for q in ("inject", "injection", "blocking", "block"):
            self.assertIn("Alpha/Injection Hook", self._paths(index.search(self.ws, q)),
                          f"{q!r} should match via Porter stemming")

    # --- compound splitting symmetry -------------------------------------
    def test_compound_split_matches_camelcase(self):
        # note wrote 'overallScore'; prose query 'overall score' must still hit it
        self.assertIn("Alpha/Scoring Camel", self._paths(index.search(self.ws, "overall score")))
        self.assertIn("Alpha/Scoring Camel", self._paths(index.search(self.ws, "overallScore")))

    # --- column weighting -------------------------------------------------
    def test_title_outranks_body(self):
        hits = self._paths(index.search(self.ws, "kryptonite", limit=5))
        self.assertEqual(hits[0], "Beta/Title Kryptonite",
                         "a title hit should outrank a body hit")
        self.assertIn("Beta/Body Kryptonite", hits)

    # --- score floor / no false hits -------------------------------------
    def test_offtopic_returns_nothing(self):
        self.assertEqual(index.search(self.ws, "quantum entanglement submarine"), [])

    # --- raw-query safety -------------------------------------------------
    def test_raw_query_does_not_crash(self):
        for q in ('"unterminated', "star*", "a OR b", "NEAR broken"):
            self.assertIsInstance(index.search(self.ws, q), list)

    def test_operator_words_are_tokenized_not_passed_through(self):
        # a natural prompt containing FTS operator words (NEAR/OR/AND) must still
        # retrieve, not be misread as raw FTS syntax and silently return nothing.
        hits = self._paths(index.search(self.ws, "does injecting tokens use NEAR or AND?"))
        self.assertIn("Alpha/Injection Hook", hits)

    # --- phrase / NEAR fusion --------------------------------------------
    def test_phrase_query_shape(self):
        self.assertIn("NEAR", index.phrase_query("red car"))
        self.assertEqual(index.phrase_query("solo"), "")  # single term -> no pair

    def test_fusion_rewards_proximity(self):
        hits = index.search_fused(self.ws, "red car", limit=5)
        paths = self._paths(hits)
        self.assertIn("Gamma/Adjacent", paths)
        self.assertIn("Gamma/Apart", paths)
        # 'red car' adjacent -> matches the NEAR clause -> fused above the far-apart note
        self.assertLess(paths.index("Gamma/Adjacent"), paths.index("Gamma/Apart"))
        self.assertGreater(hits[0]["rank_score"], 0)

    def test_fused_carries_bm25_score(self):
        hits = index.search_fused(self.ws, "injecting salient tokens", limit=3)
        self.assertTrue(hits)
        self.assertIn("score", hits[0])       # bm25 strength preserved for the floor
        self.assertIn("rank_score", hits[0])

    # --- link corroboration ----------------------------------------------
    def test_inlink_counts(self):
        # Search Ranking depends_on Injection Hook -> Injection Hook gets an in-link
        paths = [os.path.join(self.ws["kb"], "Alpha/Injection Hook.md"),
                 os.path.join(self.ws["kb"], "Alpha/Search Ranking.md")]
        indeg = index._inlink_counts(self.ws, paths)
        self.assertEqual(indeg[paths[0]], 1)   # Injection Hook linked-to by Search Ranking
        self.assertEqual(indeg[paths[1]], 0)

    # --- worklog index ----------------------------------------------------
    def test_worklog_search(self):
        hits = self._paths(index.search(self.ws, "rollback incident gateway", kind="worklog"))
        self.assertTrue(any("2026-01-01" in h or "wt1" in h for h in hits) or hits,
                        "worklog FTS should return the incident entry")
        self.assertTrue(index.search(self.ws, "rollback", kind="worklog"))

    # --- incremental rebuild / pruning ------------------------------------
    def test_reindex_prunes_deleted(self):
        os.remove(os.path.join(self.ws["kb"], "Gamma/Apart.md"))
        stats = index.build(self.ws, incremental=True)
        self.assertEqual(stats["removed"], 1)
        self.assertNotIn("Gamma/Apart", self._paths(index.search(self.ws, "red car", limit=9)))


class ResolutionTest(unittest.TestCase):
    """Workspace resolution / isolation, driven by a temp registry file."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.reg = os.path.join(self.tmp.name, "registry.toml")
        outer = os.path.join(self.tmp.name, "code")
        inner = os.path.join(outer, "acme")
        registry.save([
            {"id": "outer", "match": [outer], "kb": os.path.join(self.tmp.name, "OuterKB"),
             "worklogs": os.path.join(self.tmp.name, "OuterKB/_Worklogs"), "exclude": [],
             "index_db": os.path.join(self.tmp.name, "outer.db")},
            {"id": "inner", "match": [inner], "kb": os.path.join(self.tmp.name, "InnerKB"),
             "worklogs": os.path.join(self.tmp.name, "InnerKB/_Worklogs"), "exclude": [],
             "index_db": os.path.join(self.tmp.name, "inner.db")},
        ], path=self.reg)
        self.outer, self.inner = outer, inner

    def tearDown(self):
        self.tmp.cleanup()

    def test_longest_prefix_wins(self):
        ws = resolve.resolve(os.path.join(self.inner, "sub", "dir"), path=self.reg)
        self.assertEqual(ws["id"], "inner")

    def test_outer_prefix(self):
        ws = resolve.resolve(os.path.join(self.outer, "other"), path=self.reg)
        self.assertEqual(ws["id"], "outer")

    def test_no_match_is_none(self):
        self.assertIsNone(resolve.resolve("/tmp/somewhere/else", path=self.reg))


if __name__ == "__main__":
    unittest.main()
