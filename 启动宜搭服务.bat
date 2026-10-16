@echo off
chcp 65001 >nul 2>&1
rem ============================================================
rem  宜搭服务常驻启动器（推荐方式）
rem  ------------------------------------------------------------
rem  为什么需要它：
rem    在 WorkBuddy Agent 宿主里执行启动命令，后台进程会随
rem    「命令结束 / 会话关闭」被整棵进程树回收，服务起不来或
rem    很快消失。本脚本由你**在真实终端中双击/运行**，进程树
rem    不受 Agent 宿主管辖，服务即可长期常驻。
rem
rem  菜单：
rem    1 启动（常驻，关闭本窗口即停止服务）
rem    2 后台启动（关窗口也不停，推荐日常使用）
rem    3 停止
rem    4 查看状态
rem    5 健康检查
rem ============================================================

cd /d "%~dp0"

:menu
cls
echo ============================================================
echo   宜搭服务管理  -  %CD%
echo ============================================================
echo.
echo    [1] 启动服务（前台常驻，关闭窗口即停止）
echo    [2] 后台启动（关窗口也不停，推荐）
echo    [3] 停止服务
echo    [4] 查看状态
echo    [5] 健康检查
echo    [0] 退出
echo.
set /p choice=请选择 [1-5,0]:

if "%choice%"=="1" goto start_fg
if "%choice%"=="2" goto start_bg
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto status
if "%choice%"=="5" goto health
if "%choice%"=="0" goto end
goto menu

:start_fg
echo.
echo [启动] 前台常驻模式...
echo        关闭本窗口将停止服务。如需长期后台运行请用菜单 [2]。
echo.
node ".workbuddy-ai\run\persistent-launcher.js" start
echo.
echo 服务已停止。
pause
goto menu

:start_bg
echo.
echo [启动] 后台模式...
if not exist ".workbuddy-ai\run" mkdir ".workbuddy-ai\run"
rem 调用独立辅助脚本，避免 start+cmd /c+重定向+嵌套引号的解析陷阱
start "宜搭服务" /min cmd /c "%~dp0.workbuddy-ai\run\start-bg.cmd"
echo.
echo 已派发后台启动，等待就绪...
timeout /t 8 /nobreak >nul
node ".workbuddy-ai\run\healthcheck.js"
echo.
pause
goto menu

:stop
echo.
node ".workbuddy-ai\run\persistent-launcher.js" stop
echo.
pause
goto menu

:status
echo.
node ".workbuddy-ai\run\persistent-launcher.js" status
echo.
pause
goto menu

:health
echo.
node ".workbuddy-ai\run\healthcheck.js"
echo.
pause
goto menu

:end
exit /b 0
