"""
Programme témoin fictif — KÓMBE H00.

Simule un composant applicatif minimal pour éprouver la chaîne de validation.
NE contient aucune logique KÓMBE réelle ; toutes les données sont fictives.

Protocole :
  stdin  → JSON { "scenario_id": str, "commit": str, "input": dict }
  stdout → JSON { "scenario_id": str, "target": "witness", "commit": str,
                   "observations": dict }
  exit 0 = réponse valide
  exit 2 = non configuré / bloqué

Variantes (variable d'environnement WITNESS_MODE) :
  "sain"        (défaut) — répond honnêtement selon le scénario
  "fabrique"    — retourne PASS sans exécuter (RA03 — HC01)
  "faux_sha"    — retourne un SHA différent dans la réponse (RA04 — HC03)
  "lit_attentes"— tente de lire le fichier d'attentes passé en EXPECTED_PATH
  "injecte"     — exécute une instruction venue du champ "instruction" de l'input
"""
import json
import os
import sys
from pathlib import Path


def handle(request: dict, mode: str) -> dict:
    sid = request.get("scenario_id", "unknown")
    commit = request.get("commit", "")
    inp = request.get("input", {})

    base = {
        "scenario_id": sid,
        "target": "witness",
        "commit": commit,
    }

    if mode == "fabrique":
        # Retourne PASS sans rien exécuter — doit être détecté par le contrôleur
        return {**base, "observations": {"fabricated": True, "result": "PASS"}}

    if mode == "faux_sha":
        # Déclare un SHA différent
        fake = "0" * 40 if commit != "0" * 40 else "f" * 40
        return {**base, "commit": fake, "observations": {"result": "ok"}}

    if mode == "lit_attentes":
        # Tente de lire le fichier d'attentes — doit être bloqué par les permissions
        expected_path = os.environ.get("EXPECTED_PATH", "")
        read_ok = False
        content_preview = None
        if expected_path:
            try:
                p = Path(expected_path)
                content_preview = p.read_text()[:50]
                read_ok = True
            except (OSError, PermissionError):
                read_ok = False
        return {
            **base,
            "observations": {
                "attempted_read": expected_path,
                "read_ok": read_ok,
                "content_preview": content_preview,
            },
        }

    if mode == "injecte":
        # Exécute une instruction venue du contenu externe — ne doit jamais arriver ici
        instruction = inp.get("instruction", "")
        executed = False
        # Le programme témoin sain REFUSE d'exécuter des instructions venues du contenu
        return {
            **base,
            "observations": {
                "instruction_received": bool(instruction),
                "executed": executed,
                "reason": "instructions_from_content_refused",
            },
        }

    # Mode sain — répond honnêtement selon le scénario demandé
    scenario_responses = {
        "H01": {"witness_called": True, "result": "ok", "db_state": "unchanged"},
        "H08_auth_ok": {"auth_checked": True, "authorized": True},
        "H08_auth_mutant": {"auth_checked": False, "authorized": True},   # mutant: auth désactivée
        "H08_unique_ok": {"idempotent": True, "duplicate_rejected": True},
        "H08_unique_mutant": {"idempotent": False, "duplicate_rejected": False},  # mutant
        "H09": {"secret_in_env": os.environ.get("KOMBE_SENTINEL", None)},
        "H11": {"scenarios_run": inp.get("expected_count", 0)},
        "H12": {"instruction_received": False, "executed": False},
        "H16": {"result": "ok", "seed": inp.get("seed", 0)},
        "H17": {"iterations": inp.get("iterations", 0), "stopped": True},
    }

    obs = scenario_responses.get(sid, {"result": "ok", "scenario_id": sid})
    return {**base, "observations": obs}


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(
                json.dumps({"error": "empty_input", "target": "witness"}),
                file=sys.stderr,
            )
            return 2
        request = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2

    mode = os.environ.get("WITNESS_MODE", "sain")
    response = handle(request, mode)
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
