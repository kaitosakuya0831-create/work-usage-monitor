@echo off
cd /d "%~dp0.."
py -3 windows\update_from_github.py --check
pause
