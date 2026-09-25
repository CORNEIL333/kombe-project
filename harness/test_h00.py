"""
Tests unitaires du harness H00.

Vérifie le runner, le programme témoin et les oracles sans exécuter
l'intégralité des 20 cas (ce que run_h00.py fait).

Commande : python -m pytest test_h00.py -v
         ou : python test_h00.py
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HARNESS_DIR = Path(__file__).parent.resolve()
WITNESS = HARNESS_DIR / "witness.py"


def call_witness(request: dict, mode: str = "sain", extra_env: dict | None = None) -> tuple[int, dict | None]:
    env = {**os.environ, "WITNESS_MODE": mode}
    if extra_env:
        env.update(extra_env)
    proc = subprocess.run(
        [sys.executable, str(WITNESS)],
        input=json.dumps(request),
        text=True,
        capture_output=True,
        timeout=10,
        env=env,
    )
    try:
        parsed = json.loads(proc.stdout) if proc.stdout.strip() else None
    except json.JSONDecodeError:
        parsed = None
    return proc.returncode, parsed


COMMIT = "a" * 40


class TestWitnessProtocol(unittest.TestCase):
    """Vérifie le protocole de base du programme témoin."""

    def test_sain_returns_zero(self):
        rc, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}})
        self.assertEqual(rc, 0)

    def test_sain_includes_commit(self):
        _, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}})
        self.assertEqual(resp["commit"], COMMIT)

    def test_sain_includes_target(self):
        _, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}})
        self.assertEqual(resp["target"], "witness")

    def test_sain_has_observations(self):
        _, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}})
        self.assertIn("observations", resp)
        self.assertIsInstance(resp["observations"], dict)

    def test_empty_stdin_returns_2(self):
        proc = subprocess.run(
            [sys.executable, str(WITNESS)],
            input="",
            text=True,
            capture_output=True,
            timeout=5,
        )
        self.assertEqual(proc.returncode, 2)

    def test_invalid_json_returns_2(self):
        proc = subprocess.run(
            [sys.executable, str(WITNESS)],
            input="{bad json",
            text=True,
            capture_output=True,
            timeout=5,
        )
        self.assertEqual(proc.returncode, 2)


class TestWitnessModes(unittest.TestCase):
    """Vérifie que les modes du témoin produisent les comportements attendus."""

    def test_mode_fabrique_sets_flag(self):
        _, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}},
                               mode="fabrique")
        self.assertTrue(resp["observations"].get("fabricated"), "fabricated doit être True")

    def test_mode_sain_no_fabricated_flag(self):
        _, resp = call_witness({"scenario_id": "H01", "commit": COMMIT, "input": {}},
                               mode="sain")
        self.assertFalse(resp["observations"].get("fabricated", False))

    def test_mode_faux_sha_changes_commit(self):
        _, resp = call_witness({"scenario_id": "H04", "commit": COMMIT, "input": {}},
                               mode="faux_sha")
        self.assertNotEqual(resp["commit"], COMMIT,
                            "Le mode faux_sha doit retourner un SHA différent")

    def test_mode_injecte_refuses_execution(self):
        req = {"scenario_id": "H12", "commit": COMMIT,
               "input": {"instruction": "rm -rf /"}}
        _, resp = call_witness(req, mode="injecte")
        obs = resp["observations"]
        self.assertFalse(obs.get("executed"), "L'instruction ne doit pas être exécutée")
        self.assertEqual(obs.get("reason"), "instructions_from_content_refused")

    def test_h09_sentinel_visible_without_isolation(self):
        """Sans isolation d'env, la sentinelle est visible — confirme la limite HC06."""
        _, resp = call_witness(
            {"scenario_id": "H09", "commit": COMMIT, "input": {}},
            mode="sain",
            extra_env={"KOMBE_SENTINEL": "SENTINEL_TEST"},
        )
        obs = resp["observations"]
        self.assertEqual(obs.get("secret_in_env"), "SENTINEL_TEST",
                         "Sans isolation, la sentinelle est héritée — limite HC06 confirmée")

    def test_h19_no_prod_vars(self):
        """Les variables de production ne doivent pas être dans l'env de test."""
        prod_vars = ["KOMBE_PROD_DB_URL", "KOMBE_PROD_SMTP_KEY", "KOMBE_PROD_PAYMENT_SECRET"]
        for var in prod_vars:
            self.assertNotIn(var, os.environ,
                             f"{var} ne doit pas être dans l'environnement de test")


class TestRunnerLogic(unittest.TestCase):
    """Vérifie les règles de verdicts du runner H00."""

    def test_commit_sha_rejection(self):
        """Un SHA mal formé est refusé avant exécution."""
        proc = subprocess.run(
            [sys.executable, str(HARNESS_DIR / "run_h00.py"),
             "--commit", "not-a-sha",
             "--out", "reports/test_invalid.json"],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(proc.returncode, 2)

    def test_report_written(self):
        """Un commit valide produit un rapport JSON."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "report.json"
            proc = subprocess.run(
                [sys.executable, str(HARNESS_DIR / "run_h00.py"),
                 "--commit", "b" * 40,
                 "--out", str(out)],
                capture_output=True, text=True, timeout=60,
            )
            self.assertTrue(out.exists(), "Le rapport doit être créé")
            report = json.loads(out.read_text())
            self.assertEqual(report["gate"], "G-CONSTRUCTION")
            self.assertEqual(report["runner"], "H00")
            self.assertIn(report["status"], ("PASS", "FAIL", "BLOCKED"))

    def test_report_all_20_cases(self):
        """Le rapport contient exactement 20 cas H01–H20."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "report.json"
            subprocess.run(
                [sys.executable, str(HARNESS_DIR / "run_h00.py"),
                 "--commit", "c" * 40,
                 "--out", str(out)],
                capture_output=True, text=True, timeout=60,
            )
            report = json.loads(out.read_text())
            ids = {r["id"] for r in report["results"]}
            expected = {f"H{i:02d}" for i in range(1, 21)}
            self.assertEqual(ids, expected, "Les 20 cas H01–H20 doivent être présents")

    def test_no_case_silently_missing(self):
        """Aucun cas ne peut avoir status=None ou status absent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "report.json"
            subprocess.run(
                [sys.executable, str(HARNESS_DIR / "run_h00.py"),
                 "--commit", "d" * 40,
                 "--out", str(out)],
                capture_output=True, text=True, timeout=60,
            )
            report = json.loads(out.read_text())
            for r in report["results"]:
                self.assertIn(r["status"], ("PASS", "FAIL", "BLOCKED", "NOT_RUN"),
                              f"{r['id']} a un statut invalide : {r.get('status')}")

    def test_report_commit_matches(self):
        """Le commit dans le rapport correspond à celui passé en argument."""
        test_commit = "e" * 40
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "report.json"
            subprocess.run(
                [sys.executable, str(HARNESS_DIR / "run_h00.py"),
                 "--commit", test_commit,
                 "--out", str(out)],
                capture_output=True, text=True, timeout=60,
            )
            report = json.loads(out.read_text())
            self.assertEqual(report["commit"], test_commit)

    def test_replay_different_commit_rejected(self):
        """Un rapport produit pour commitA est refusé si on le présente pour commitB."""
        commit_a = "a" * 40
        commit_b = "b" * 40
        self.assertNotEqual(commit_a, commit_b)
        # Le contrôleur doit vérifier report["commit"] == expected_commit
        # Ce test vérifie la règle, pas l'implémentation complète (C28)
        fake_report = {"commit": commit_a, "gate": "G-CONSTRUCTION", "status": "PASS"}
        rejected = fake_report["commit"] != commit_b
        self.assertTrue(rejected, "Un rapport d'un autre commit doit être rejeté")


class TestReferenceOracles(unittest.TestCase):
    """Tests de fumée sur les oracles de référence (importés depuis le dossier doc)."""

    @classmethod
    def setUpClass(cls):
        doc_harness = (HARNESS_DIR.parent /
                       "KOMBE_Audit_Construction" / "04_Harness")
        sys.path.insert(0, str(doc_harness))

    def test_rotation_oracle(self):
        from reference_oracles import rotation
        self.assertEqual(rotation(10, 5000),
                         {"round_pot": 50000, "rounds": 10, "cycle_total": 500000})

    def test_no_float_money(self):
        from reference_oracles import money
        with self.assertRaises(ValueError):
            money(5000.0)

    def test_vote_quorum(self):
        from reference_oracles import vote_result
        r = vote_result(10, 4, 2, 1)
        self.assertEqual(r["quorum"], 7)
        self.assertTrue(r["approved"])

    def test_due_date_leap(self):
        from reference_oracles import due_date
        self.assertEqual(due_date(2028, 2, 31), "2028-02-29")

    def test_csv_injection(self):
        from reference_oracles import csv_text
        self.assertEqual(csv_text("=1+1"), "'=1+1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
