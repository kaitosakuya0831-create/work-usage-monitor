# ChariLab Work quota recovery safe example
# This script deliberately DOES NOT press buttons in ChatGPT or run production Auto Ops.
# Called only when quota_bridge.py is started with --enable-hook and a fresh
# post-reset UI observation proves a recovery transition.
$ErrorActionPreference = 'Stop'
$folder = Join-Path $env:LOCALAPPDATA 'ChariLabQuotaBridge'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$line = "$(Get-Date -Format o) Recovery observed: hook executed (no Work launch)"
Add-Content -Path (Join-Path $folder 'hook.log') -Value $line -Encoding UTF8
# Optional future integration, ONLY after verifying a dedicated safe research task:
# Start-ScheduledTask -TaskName 'ChariLab-Research-Only'
