@echo off
setlocal
REM Right-click > Run as administrator: stop the program (e.g. before
REM running it by hand). The autostart setting stays; run
REM 2-install-autostart.bat to start it again.
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [ต้องเปิดแบบผู้ดูแลระบบ] คลิกขวาที่ไฟล์นี้ แล้วเลือก Run as administrator
  pause
  exit /b 1
)

schtasks /end /tn "SingleUseSticker" >nul 2>&1
REM Also stop our own node.exe (only the one in this folder), in case it
REM outlived the task or was started by hand.
REM CIM rather than Get-Process: it also shows the path of the task's node.exe (runs as SYSTEM).
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '%~dp0node\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo หยุดโปรแกรมแล้ว
pause
