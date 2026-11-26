@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 python——请先安装 Python 3.10+（勾选 Add to PATH），或运行 安装依赖.bat 查看说明。
  pause
  exit /b 1
)
start "" http://localhost:8321
python -X utf8 server.py
pause
