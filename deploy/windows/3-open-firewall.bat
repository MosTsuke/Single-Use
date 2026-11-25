@echo off
setlocal
REM Right-click > Run as administrator: let other PCs on the same network
REM open the program (http://<this PC's IP>:<PORT>).
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [ต้องเปิดแบบผู้ดูแลระบบ] คลิกขวาที่ไฟล์นี้ แล้วเลือก Run as administrator
  pause
  exit /b 1
)

set "PORT=3002"
if exist "singleuse.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("singleuse.env") do (
    if /i "%%a"=="PORT" set "PORT=%%b"
  )
)

REM Only machines on the same local network (localsubnet), nothing beyond it.
netsh advfirewall firewall delete rule name="Single-Use Sticker" >nul 2>&1
netsh advfirewall firewall add rule name="Single-Use Sticker" dir=in action=allow protocol=TCP localport=%PORT% remoteip=localsubnet profile=any
if errorlevel 1 (
  echo [เปิด firewall ไม่สำเร็จ] ดูข้อความด้านบน
  pause
  exit /b 1
)
echo.
echo เปิดให้เครื่องอื่นในวงแลนเดียวกันเข้าได้แล้ว ที่ port %PORT%
echo ให้เครื่องอื่นเปิด http://^<IP ด้านล่าง^>:%PORT%   ^(จดไว้ใช้ตั้งค่า client\Single-Use.bat^)
ipconfig | findstr /C:"IPv4"
pause
