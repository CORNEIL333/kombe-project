#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
manifest = root / 'lib/app/router/screen_manifest.dart'
text = manifest.read_text(encoding='utf-8')
items = re.findall(r"'([a-z0-9_]+)'", text)
expected = 47
if len(items) != expected:
    raise SystemExit(f'FAIL — screen manifest has {len(items)} entries, expected {expected}')
if len(set(items)) != len(items):
    raise SystemExit('FAIL — duplicate entries in screen manifest')
print(f'PASS — screen manifest contains {len(items)} unique screens')
