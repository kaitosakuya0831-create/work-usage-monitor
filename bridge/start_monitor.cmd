@echo off
cd /d "%~dp0"
py -3 quota_bridge.py --serve
pause
