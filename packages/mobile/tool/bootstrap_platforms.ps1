$ErrorActionPreference = "Stop"

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Error "BLOCKED: Flutter SDK is not installed or not on PATH."
  exit 2
}

flutter --version
flutter create . --platforms=android,ios --org com.kombe --project-name kombe_mobile

Write-Host ""
Write-Host "Platform shells generated. Review git diff before accepting."
Write-Host "Do not allow flutter create to replace authored application files without review."
