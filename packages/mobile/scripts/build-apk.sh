#!/usr/bin/env bash
# KÓMBE — construit l'APK Android branché sur l'API de production.
# Prérequis : Flutter (stable) + Android SDK (Android Studio) ; `flutter doctor` vert.
# Usage : bash packages/mobile/scripts/build-apk.sh [URL_API]
set -euo pipefail
cd "$(dirname "$0")/.."
API="${1:-https://kombe.vercel.app/v1}"
flutter pub get
flutter build apk --release --dart-define=KOMBE_API_BASE_URL="$API"
echo
echo "APK prêt : $(pwd)/build/app/outputs/flutter-apk/app-release.apk"
