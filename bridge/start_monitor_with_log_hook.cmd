@echo off
rem Explicit opt-in: only runs the bundled log-only PowerShell after recovery.
cd /d "%~dp0"
py -3 quota_bridge.py --serve --enable-hook
pause
