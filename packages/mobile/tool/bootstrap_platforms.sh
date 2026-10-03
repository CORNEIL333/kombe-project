#!/usr/bin/env bash
set -euo pipefail

if ! command -v flutter >/dev/null 2>&1; then
  echo "BLOCKED: Flutter SDK is not installed or not on PATH." >&2
  exit 2
fi

flutter --version
flutter create . \
  --platforms=android,ios \
  --org com.kombe \
  --project-name kombe_mobile

echo
echo "Platform shells generated. Review git diff before accepting."
echo "Do not allow flutter create to replace the authored lib/, test/, pubspec.yaml,"
echo "analysis_options.yaml or l10n.yaml without review."
