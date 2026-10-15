@echo off
rem ===== เปิดโปรแกรม Single-Use แบบพิมพ์ออกเครื่องทันที (kiosk printing) =====
rem แก้ URL ให้เป็นที่อยู่จริงของโปรแกรม
set "APP_URL=https://CHANGE-ME.vercel.app/print"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

rem ใช้โปรไฟล์แยก เพื่อให้ตัวเลือก --kiosk-printing มีผลเสมอ แม้เปิด Chrome ปกติค้างไว้
rem (ข้อมูลของโปรแกรมจะอยู่ในโปรไฟล์นี้ ให้เปิดจากไฟล์นี้ทุกครั้ง)
start "" "%CHROME%" --user-data-dir="%LOCALAPPDATA%\SingleUseKiosk" --kiosk-printing --app="%APP_URL%"
