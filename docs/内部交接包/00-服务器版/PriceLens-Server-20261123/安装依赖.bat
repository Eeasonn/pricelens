@echo off
chcp 65001 >nul
echo PriceLens 服务器当前为零第三方依赖（Python 3.10+ 标准库即可运行）。
echo 若未来版本提示缺依赖：把 wheels 文件夹与本脚本放一起后重新运行本脚本即可离线安装。
if exist "%~dp0wheels" (
  pip install --no-index --find-links "%~dp0wheels" -r "%~dp0requirements.txt"
)
pause
