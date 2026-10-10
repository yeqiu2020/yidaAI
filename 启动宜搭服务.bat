@echo off
chcp 65001 >nul 2>&1

rem ============================================================
rem  启动宜搭服务
rem  v2: 改为"自动定位脚本所在目录"，不再写死绝对路径。
rem      原实现 cd /d "d:\宜搭AI助手直播\宜搭AI助手V2.0.31" 是复制项目时
rem      残留的硬编码路径，双击后会去启动【另一个项目】的服务，
rem      当前项目的页面自然打不开。
rem ============================================================

cd /d "%~dp0"

echo ============================================================
echo   正在启动宜搭服务
echo   项目目录: %CD%
echo ============================================================
echo.

if not exist ".agents\skills\server-manager\scripts\server_manager.js" (
  echo [错误] 未找到服务管理器脚本，请确认本 bat 位于宜搭项目根目录：
  echo        .agents\skills\server-manager\scripts\server_manager.js
  echo.
  pause
  exit /b 1
)

node .agents\skills\server-manager\scripts\server_manager.js start

echo.
echo 服务已在后台运行。按任意键关闭本窗口（不影响服务）。
pause >nul
