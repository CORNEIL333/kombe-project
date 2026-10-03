#!/usr/bin/env bash
set -euo pipefail

flutter --version
flutter pub get
flutter gen-l10n
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
python3 tool/audit_no_embedded_business_data.py
