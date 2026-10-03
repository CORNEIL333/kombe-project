#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "lib"

FORBIDDEN_FILE_PARTS = (
    "fixture",
    "seed_data",
    "demo_data",
    "fake_business",
    "mock_business",
)

# References from design screenshots or previous demo iterations must never
# become runtime data. This is intentionally conservative.
FORBIDDEN_RUNTIME_LITERALS = (
    "Les Étoiles de Yaoundé",
    "Solidarité Bamiléké",
    "Vision Entrepreneurs",
    "Amina Ngué",
    "Paul Moukouri",
    "Marie Abena",
    "Paul Abega",
)

offenders = []
for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    low = str(path).lower()
    if any(part in low for part in FORBIDDEN_FILE_PARTS):
        offenders.append(f"forbidden file name: {path}")
    if path.suffix in {".dart", ".arb", ".json", ".yaml", ".yml"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        for literal in FORBIDDEN_RUNTIME_LITERALS:
            if literal in text:
                offenders.append(f"forbidden runtime literal {literal!r}: {path}")

if offenders:
    print("FAIL — embedded business/demo data detected")
    for item in offenders:
        print("-", item)
    sys.exit(1)

print("PASS — no embedded business/demo data detected in lib/")
