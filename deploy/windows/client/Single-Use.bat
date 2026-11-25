@echo off
rem ===== เปิดโปรแกรม Single-Use แบบพิมพ์ออกเครื่องทันที (kiosk printing) =====
rem ที่อยู่ของโปรแกรมบนเครื่องแม่:
rem   - ใช้บนเครื่องแม่เอง: ปล่อยเป็น localhost ได้เลย
rem   - ใช้บนเครื่องอื่นในแลน: เปลี่ยน localhost เป็น IP ของเครื่องแม่ เช่น http://192.168.1.10:3002/print
rem     (ดู IP ได้จากหน้าต่างของ 3-open-firewall.bat บนเครื่องแม่)
set "APP_URL=http://localhost:3002/print"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

rem ใช้โปรไฟล์แยก เพื่อให้ตัวเลือก --kiosk-printing มีผลเสมอ แม้เปิด Chrome ปกติค้างไว้
rem (ข้อมูลอยู่ที่เครื่องแม่ — โปรไฟล์นี้เก็บแค่ค่าตั้งเครื่องพิมพ์ของเครื่องนี้ เช่น เลื่อนตำแหน่ง ให้เปิดจากไฟล์นี้ทุกครั้ง)
start "" "%CHROME%" --user-data-dir="%LOCALAPPDATA%\SingleUseKiosk" --kiosk-printing --app="%APP_URL%"
