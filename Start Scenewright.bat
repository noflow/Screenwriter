@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scenewright.html" (
  echo Scenewright could not start because scenewright.html is missing.
  echo Run build.py, then try this launcher again.
  pause
  exit /b 1
)

rem Reuse any existing Scenewright server before looking for a new free port.
for /L %%P in (8765,1,8774) do (
  call :is_scenewright %%P
  if not errorlevel 1 (
    set "SCENEWRIGHT_PORT=%%P"
    goto open_app
  )
)

rem No existing server was found, so choose the first free dedicated port.
for /L %%P in (8765,1,8774) do (
  call :is_listening %%P
  if errorlevel 1 (
    set "SCENEWRIGHT_PORT=%%P"
    goto find_python
  )
)

echo Scenewright could not find a free local port between 8765 and 8774.
pause
exit /b 1

:find_python
where py.exe >nul 2>&1
if not errorlevel 1 (
  set "SCENEWRIGHT_PYTHON=py.exe"
  set "SCENEWRIGHT_PY_ARGS=-3"
  goto start_server
)
where python.exe >nul 2>&1
if not errorlevel 1 (
  set "SCENEWRIGHT_PYTHON=python.exe"
  set "SCENEWRIGHT_PY_ARGS="
  goto start_server
)

echo Scenewright needs Python, but neither py.exe nor python.exe was found.
echo Install Python from python.org and enable "Add Python to PATH".
pause
exit /b 1

:start_server
if defined SCENEWRIGHT_PY_ARGS (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%SCENEWRIGHT_PYTHON%' -ArgumentList @('%SCENEWRIGHT_PY_ARGS%','-m','http.server','%SCENEWRIGHT_PORT%','--bind','127.0.0.1') -WorkingDirectory '%~dp0' -WindowStyle Hidden"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%SCENEWRIGHT_PYTHON%' -ArgumentList @('-m','http.server','%SCENEWRIGHT_PORT%','--bind','127.0.0.1') -WorkingDirectory '%~dp0' -WindowStyle Hidden"
)

rem Wait for the server to answer before opening the browser.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%SCENEWRIGHT_PORT%/scenewright.html'; for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $url;if($r.Content -match '<title>Scenewright'){exit 0}}catch{};Start-Sleep -Milliseconds 200};exit 1"
if errorlevel 1 (
  echo Scenewright's local server did not start correctly.
  echo Check that Python is allowed through Windows Security, then try again.
  pause
  exit /b 1
)

:open_app
start "" "http://127.0.0.1:%SCENEWRIGHT_PORT%/scenewright.html"
exit /b 0

:is_listening
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:is_scenewright
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:%1/scenewright.html';if($r.Content -match '<title>Scenewright'){exit 0}}catch{};exit 1" >nul 2>&1
exit /b %errorlevel%
