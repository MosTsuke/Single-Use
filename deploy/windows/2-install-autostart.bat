@echo off
setlocal
REM Right-click > Run as administrator: start the program by itself every
REM time the PC boots (no login needed), and again if it ever stops.
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [ต้องเปิดแบบผู้ดูแลระบบ] คลิกขวาที่ไฟล์นี้ แล้วเลือก Run as administrator
  pause
  exit /b 1
)
if not exist "singleuse.env" (
  echo [ยังไม่มีไฟล์ singleuse.env] ดับเบิลคลิก 1-start.bat ก่อนเพื่อตั้งค่า
  pause
  exit /b 1
)
REM Only the DB_PASSWORD line counts (comments may mention the placeholder).
findstr /R /C:"^DB_PASSWORD=.*CHANGE_ME" "singleuse.env" >nul && (
  echo [ยังไม่ได้ใส่รหัสผ่าน] แก้ DB_PASSWORD ในไฟล์ singleuse.env ก่อน
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-autostart.ps1" -Root "%~dp0."
if errorlevel 1 (
  echo [ตั้งไม่สำเร็จ] ดูข้อความด้านบน
  pause
  exit /b 1
)
echo.
echo ตั้งเรียบร้อย: โปรแกรมจะเปิดเองทุกครั้งที่เปิดเครื่อง ไม่ต้อง login
echo และจะเปิดใหม่เองภายใน 1 นาทีถ้าหยุดทำงาน
echo สั่งเปิดแล้ว รอประมาณ 15 วินาที แล้วเปิด http://localhost:3002
echo ถ้ามีปัญหา ดูไฟล์ logs\server.log
pause
