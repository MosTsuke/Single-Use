@echo off
setlocal
REM Double-click: first time, creates singleuse.env and opens it to fill in;
REM after that, runs the program in this window (close it to stop).
chcp 65001 >nul
cd /d "%~dp0"

if not exist "singleuse.env" (
  copy "singleuse.env.example" "singleuse.env" >nul
  echo ==================================================
  echo สร้างไฟล์ singleuse.env แล้ว และเปิดใน Notepad ให้
  echo ใส่รหัสผ่านของ login singleuse_app แทนคำว่า CHANGE_ME แล้วกดบันทึก
  echo จากนั้นดับเบิลคลิกไฟล์นี้อีกครั้ง
  echo ==================================================
  start "" notepad "singleuse.env"
  pause
  exit /b 0
)

schtasks /query /tn "SingleUseSticker" >nul 2>&1 && (
  echo ตั้งให้โปรแกรมเปิดเองตอนเปิดเครื่องไว้แล้ว ^(task SingleUseSticker^)
  echo ตอนนี้น่าจะทำงานอยู่แล้ว ลองเปิด http://localhost:3002
  echo ถ้าจะรันเองในหน้าต่างนี้แทน ให้คลิกขวา stop.bat ^> Run as administrator ก่อน
  pause
  exit /b 0
)

echo ==================================================
echo กำลังเปิด Single-Use Sticker
echo รอจนขึ้นบรรทัด "พร้อมใช้งาน" แล้วเปิด Chrome ไปที่ http://localhost:3002
echo ปิดหน้าต่างนี้ = หยุดโปรแกรม
echo ==================================================
call "%~dp0scripts\run-server.cmd"
echo.
echo โปรแกรมหยุดทำงาน ดูข้อความด้านบน
pause
