@echo off
rem ============================================================
rem  Yida local service launcher  (ASCII ONLY - see AGENTS.md 6.2)
rem  ------------------------------------------------------------
rem  MUST be started via explorer.exe or by double click.
rem  Do NOT run "server_manager.js start" directly from inside an
rem  AI host command: the host sandbox wraps the whole process tree
rem  in a Job Object and kills it when the command exits.
rem
rem  One-command entry for AI:
rem      node .workbuddy-ai/run/ensure-service.js
rem ============================================================
cd /d "%~dp0"

echo [%date% %time%] launcher start >> "%~dp0service-start.log"
node ".agents\skills\server-manager\scripts\server_manager.js" start >> "%~dp0service-start.log" 2>&1
echo [%date% %time%] launcher exit=%ERRORLEVEL% >> "%~dp0service-start.log"

rem verify immediately after start (started != actually running)
node ".workbuddy-ai\run\ensure-service.js" status >> "%~dp0service-start.log" 2>&1

exit /b 0
