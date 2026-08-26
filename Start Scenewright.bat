@echo off
setlocal
cd /d "%~dp0"

netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if not errorlevel 1 (
  start "" "http://localhost:8000/scenewright.html"
  exit /b 0
)

start "Scenewright server" cmd /k "cd /d ""%~dp0"" && py -3 -m http.server 8000"
timeout /t 1 /nobreak >nul
start "" "http://localhost:8000/scenewright.html"
