#!/usr/bin/env python3
"""
verifier_coordination.py — contrôle exécutable du protocole multi-harnais KÓMBE.

Rejoue les invariants de coordination (aucun effet de bord sur le dépôt) :
  * tout harnais cité (owner, signature) existe dans REGISTRE_HARNESS.json ;
  * un lot in_progress/in_review/done a un owner connu ;
  * un lot 'done' a une evidence_ref réelle (fichier PREUVES existant OU SHA résolvable) ;
  * séparation auteur/relecteur (H06) : reviewer != owner quand présent ;
  * pas de deux lots in_progress aux fichiers qui se recouvrent ;
  * messages handoff/*.json conformes au schéma (required, action, SHA, signature).

Codes de sortie alignés sur 04_Harness : 0 conforme, 1 violation, 2 non exécutable
(fichiers de coordination absents/illisibles). Aucune dépendance externe : le
schéma JSON est validé par des règles minimales intégrées, pas par une lib.
"""
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
REGISTRE = HERE / "REGISTRE_HARNESS.json"
ETATS = HERE / "ETATS_LOTS.json"
MESSAGES_SCHEMA = HERE / "MESSAGES.schema.json"
HANDOFF = HERE / "handoff"

SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")
STATUTS = {"todo", "in_progress", "in_review", "blocked", "done", "deferred"}
ACTIONS = {"claim", "release", "handoff", "block", "pass", "review", "escalate"}
OWNER_REQUIRED = {"in_progress", "in_review", "done"}
MSG_REQUIRED = {
    "message_id", "from_harness_id", "lot", "action",
    "commit_sha", "base_head_sha", "signature",
}

violations: list[str] = []
notes: list[str] = []


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def git_available() -> bool:
    try:
        r = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
                           capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def sha_resolves(sha: str, use_git: bool) -> bool | None:
    """True=commit existe, False=introuvable, None=git indisponible (non exécutable)."""
    if not use_git:
        return None
    try:
        r = subprocess.run(["git", "-C", str(REPO_ROOT), "cat-file", "-e", f"{sha}^{{commit}}"],
                           capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return None


def check_evidence_ref(ref: str, use_git: bool, lot: str) -> None:
    if SHA_RE.match(ref):
        res = sha_resolves(ref, use_git)
        if res is False:
            violations.append(f"{lot}: evidence_ref SHA introuvable '{ref}'")
        elif res is None:
            notes.append(f"{lot}: preuve SHA '{ref}' non résolue (git indisponible)")
        return
    # Sinon chemin relatif (ex. docs/PREUVES_C08.md)
    if not (REPO_ROOT / ref).exists():
        violations.append(f"{lot}: evidence_ref fichier manquant '{ref}'")


def check_board(board: dict, known: dict, use_git: bool) -> None:
    lots = board.get("lots", [])
    ids = [l.get("lot") for l in lots]
    in_progress = []
    for l in lots:
        lot = l.get("lot", "?")
        status = l.get("status")
        if status not in STATUTS:
            violations.append(f"{lot}: statut inconnu '{status}'")
            continue
        owner = l.get("owner_harness_id")
        if status in OWNER_REQUIRED:
            if not owner:
                violations.append(f"{lot}: status={status} exige owner_harness_id")
            elif owner not in known:
                violations.append(f"{lot}: owner '{owner}' absent du registre")
        if status == "done":
            ref = l.get("evidence_ref")
            if not ref:
                violations.append(f"{lot}: done sans evidence_ref (preuve obligatoire)")
            else:
                check_evidence_ref(ref, use_git, lot)
        if status == "in_review":
            rev = l.get("reviewer_id")
            if rev is not None and rev == owner:
                violations.append(f"{lot}: reviewer == owner (H06 : séparation requise)")
            if rev is not None and rev not in known:
                violations.append(f"{lot}: reviewer '{rev}' absent du registre")
        if status == "in_progress":
            in_progress.append((lot, set(l.get("files", []))))

    # Recouvrement de fichiers entre deux lots in_progress
    for i in range(len(in_progress)):
        for j in range(i + 1, len(in_progress)):
            (la, fa), (lb, fb) = in_progress[i], in_progress[j]
            for ga in fa:
                for gb in fb:
                    if ga == gb or fnmatch.fnmatch(ga, gb) or fnmatch.fnmatch(gb, ga):
                        violations.append(
                            f"conflit in_progress {la}/{lb} sur fichier '{ga}'")
                        break

    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        violations.append(f"lots dupliqués dans le tableau : {sorted(dup)}")


def check_messages(known: dict, board_ids: set, use_git: bool) -> None:
    if not HANDOFF.exists():
        notes.append("dossier handoff/ absent : messages non contrôlés")
        return
    for p in sorted(HANDOFF.glob("*.json")):
        if p.name.upper().startswith("TEMPLATE"):
            continue
        try:
            m = load_json(p)
        except json.JSONDecodeError as e:
            violations.append(f"handoff/{p.name}: JSON invalide ({e})")
            continue
        missing = MSG_REQUIRED - set(m)
        if missing:
            violations.append(f"handoff/{p.name}: champs requis absents {sorted(missing)}")
            continue
        if m["action"] not in ACTIONS:
            violations.append(f"handoff/{p.name}: action inconnue '{m['action']}'")
        for k in ("commit_sha", "base_head_sha"):
            if not SHA_RE.match(m[k]):
                violations.append(f"handoff/{p.name}: {k} non-SHA '{m[k]}'")
            elif sha_resolves(m[k], use_git) is False:
                violations.append(f"handoff/{p.name}: {k} introuvable '{m[k]}'")
        frm = m["from_harness_id"]
        if frm not in known:
            violations.append(f"handoff/{p.name}: from_harness_id '{frm}' inconnu")
        elif m["signature"] != known[frm].get("identity_key"):
            violations.append(
                f"handoff/{p.name}: signature != identity_key de '{frm}' (H06)")
        if m["action"] in ("block", "escalate") and not m.get("reason"):
            violations.append(f"handoff/{p.name}: action {m['action']} sans reason")
        if m["action"] in ("handoff", "review", "pass") and not m.get("evidence"):
            violations.append(f"handoff/{p.name}: action {m['action']} sans evidence")
        if m["lot"] not in board_ids:
            notes.append(f"handoff/{p.name}: lot {m['lot']} absent du tableau")


def main() -> int:
    if not REGISTRE.exists() or not ETATS.exists() or not MESSAGES_SCHEMA.exists():
        print(json.dumps({
            "target": "kombe.coordination", "status": "BLOCKED",
            "reason": "fichiers de coordination absents (REGISTRE/ETATS/MESSAGES.schema)",
            "exitCode": 2}, ensure_ascii=False, indent=2))
        return 2
    try:
        registre = load_json(REGISTRE)
        board = load_json(ETATS)
    except json.JSONDecodeError as e:
        print(json.dumps({
            "target": "kombe.coordination", "status": "BLOCKED",
            "reason": f"registre/tableau JSON illisible: {e}", "exitCode": 2},
            ensure_ascii=False, indent=2))
        return 2

    known = {h["harness_id"]: h for h in registre.get("harnesses", [])}
    use_git = git_available()
    if not use_git:
        notes.append("git indisponible : résolution SHA sautée (sub-checks non exécutables)")

    check_board(board, known, use_git)
    check_messages(known, {l.get("lot") for l in board.get("lots", [])}, use_git)

    status = "FAIL" if violations else "PASS"
    code = 1 if violations else 0
    print(json.dumps({
        "target": "kombe.coordination", "status": status,
        "counts": {"violations": len(violations), "notes": len(notes)},
        "violations": violations, "notes": notes,
        "exitCode": code}, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
