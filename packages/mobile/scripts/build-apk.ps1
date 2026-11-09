# KÓMBE — construit l'APK Android branché sur l'API de production (Windows).
# Prérequis : Flutter (stable) + Android SDK (Android Studio) ; `flutter doctor` vert.
# Usage : powershell -ExecutionPolicy Bypass -File packages\mobile\scripts\build-apk.ps1 [URL_API]
param([string]$Api = "https://kombe.vercel.app/v1")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
flutter pub get
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
flutter build apk --release "--dart-define=KOMBE_API_BASE_URL=$Api"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
Write-Host "APK prêt : $(Get-Location)\build\app\outputs\flutter-apk\app-release.apk"
