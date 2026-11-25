@echo off
setlocal
REM Right-click > Run as administrator, after putting the new
REM singleuse-sticker-windows-*.zip (as it came, not unpacked) in this folder.
REM Stops the program, puts the new version in, starts it again and
REM deletes the zip; singleuse.env and logs\ stay. The work is done by
REM scripts\update.ps1.
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [ต้องเปิดแบบผู้ดูแลระบบ] คลิกขวาที่ไฟล์นี้ แล้วเลือก Run as administrator
  pause
  exit /b 1
)

REM Everything from here is one block on purpose: the update replaces this
REM very file, and cmd reads a running batch file as it goes, but a block
REM is read whole before it runs. (No ")" in the messages below.)
(
  echo กำลังอัปเดต Single-Use Sticker อย่าปิดหน้าต่างนี้จนกว่าจะเสร็จ
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1" -Root "%~dp0."
  if errorlevel 7 (
    echo.
    echo [อัปเดตแล้ว แต่หน้าเว็บยังไม่ตอบ] รออีกสักครู่แล้วเปิดหน้าโปรแกรมใหม่ ถ้ายังไม่ขึ้น ดูไฟล์ logs\server.log
  ) else if errorlevel 6 (
    echo.
    echo อัปเดตเรียบร้อย ดับเบิลคลิก 1-start.bat เพื่อเปิดโปรแกรม
  ) else if errorlevel 5 (
    echo.
    echo [อัปเดตไม่สำเร็จ] ใส่รุ่นใหม่ไม่ได้ จึงคืนรุ่นเดิมและเปิดกลับให้แล้ว ดูข้อความด้านบน
  ) else if errorlevel 4 (
    echo.
    echo [อัปเดตไม่สำเร็จ] หยุดโปรแกรมไม่ได้ ยังไม่ได้เปลี่ยนอะไร ลองรีสตาร์ทเครื่องแล้วทำใหม่
  ) else if errorlevel 3 (
    echo.
    echo [ไฟล์ zip ไม่ถูกต้อง] ต้องเป็นไฟล์ singleuse-sticker-windows-....zip ตามที่ได้มา ไม่ต้องแตก
  ) else if errorlevel 2 (
    echo.
    echo [ไม่พบไฟล์อัปเดต] วางไฟล์ singleuse-sticker-windows-....zip รุ่นใหม่ไว้ในโฟลเดอร์นี้ 1 ไฟล์ แล้วทำใหม่
  ) else if errorlevel 1 (
    echo.
    echo [อัปเดตไม่สำเร็จ] ดูข้อความด้านบน
  ) else (
    echo.
    echo อัปเดตเรียบร้อย โปรแกรมเปิดใหม่ด้วยรุ่นล่าสุดแล้ว
  )
  pause
  exit /b
)
