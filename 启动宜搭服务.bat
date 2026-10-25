@echo off
rem ============================================================
rem  Yida service manager - thin ASCII shell only.
rem  Chinese UI lives in .workbuddy-ai\run\service-menu.js because
rem  a .bat containing UTF-8 Chinese (or LF endings) makes cmd.exe
rem  fail silently - see AGENTS.md 6.2 (2026-10-17 incident).
rem ============================================================
title Yida Service Manager
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH. Please install Node.js first.
  pause
  exit /b 1
)

node ".workbuddy-ai\run\service-menu.js"
if errorlevel 1 pause
exit /b 0
