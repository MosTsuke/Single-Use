@echo off
setlocal EnableExtensions
REM ==================================================================
REM  Runs the program: node\node.exe app\server.js with the settings in
REM  singleuse.env (copied to app\.env.local, where the server reads
REM  them). Used by 1-start.bat and by the SingleUseSticker task.
REM    run-server.cmd        output in this window
REM    run-server.cmd log    output appended to logs\server.log
REM  Exits non-zero when it stops, so the task starts it again.
REM ==================================================================
chcp 65001 >nul 2>&1
cd /d "%~dp0.."

if not exist "singleuse.env" (
  echo [ยังไม่มีไฟล์ singleuse.env] ดับเบิลคลิก 1-start.bat ก่อน
  exit /b 2
)
findstr /C:"CHANGE_ME" "singleuse.env" >nul && (
  echo [ยังไม่ได้ใส่รหัสผ่าน] แก้ DB_PASSWORD ในไฟล์ singleuse.env ก่อน
  exit /b 2
)

set "PORT=3002"
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("singleuse.env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
)
REM Listen on every network card, so other PCs can reach it (firewall allowing).
set "HOSTNAME=0.0.0.0"
set "NODE_ENV=production"
set "NEXT_TELEMETRY_DISABLED=1"
copy /Y "singleuse.env" "app\.env.local" >nul

if /i "%~1"=="log" (
  if not exist "logs" mkdir "logs"
  echo ==== %date% %time% starting on port %PORT% >> "logs\server.log"
  "node\node.exe" "app\server.js" >> "logs\server.log" 2>&1
) else (
  "node\node.exe" "app\server.js"
)
exit /b %errorlevel%
