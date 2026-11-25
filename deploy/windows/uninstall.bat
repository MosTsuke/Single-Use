@echo off
setlocal
REM Right-click > Run as administrator: stop the program and remove what
REM the install scripts added to Windows (the task and the firewall rule).
REM The database is NOT touched - see README-TH.txt to remove it too.
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [ต้องเปิดแบบผู้ดูแลระบบ] คลิกขวาที่ไฟล์นี้ แล้วเลือก Run as administrator
  pause
  exit /b 1
)

schtasks /end /tn "SingleUseSticker" >nul 2>&1
REM CIM rather than Get-Process: it also shows the path of the task's node.exe (runs as SYSTEM).
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '%~dp0node\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
schtasks /delete /tn "SingleUseSticker" /f >nul 2>&1 && echo - ลบการเปิดเองตอนเปิดเครื่องแล้ว || echo - ไม่มีการตั้งเปิดเองตอนเปิดเครื่อง
netsh advfirewall firewall delete rule name="Single-Use Sticker" >nul 2>&1 && echo - ลบ firewall rule แล้ว || echo - ไม่มี firewall rule
echo.
echo ถอนโปรแกรมเรียบร้อย ลบโฟลเดอร์นี้ทิ้งได้
echo ฐานข้อมูล SingleUseSticker ยังอยู่ใน SQL Server ครบ ^(ไม่ได้ลบ^) ถ้าต้องการลบด้วย ดูวิธีใน README-TH.txt
pause
