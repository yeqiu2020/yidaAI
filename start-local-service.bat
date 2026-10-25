@echo off
rem User double-click entry. AI sessions use ensure-service.js.
cd /d "%~dp0"
echo [%date% %time%] launcher start >> "%~dp0service-start.log"
node ".agents\skills\server-manager\scripts\server_manager.js" start >> "%~dp0service-start.log" 2>&1
set "YIDA_START_EXIT=%ERRORLEVEL%"
echo [%date% %time%] launcher exit=%YIDA_START_EXIT% >> "%~dp0service-start.log"
if not "%YIDA_START_EXIT%"=="0" exit /b %YIDA_START_EXIT%
node ".workbuddy-ai\run\ensure-service.js" status >> "%~dp0service-start.log" 2>&1
exit /b %ERRORLEVEL%
