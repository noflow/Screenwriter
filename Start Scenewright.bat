@echo off
setlocal
cd /d "%~dp0"

rem Rebuild first so the bundled Port Alder registry follows the current game files.
where py.exe >nul 2>&1
if not errorlevel 1 (
  set "SCENEWRIGHT_PYTHON=py.exe"
  set "SCENEWRIGHT_PY_ARGS=-3"
  goto build_app
)
where python.exe >nul 2>&1
if not errorlevel 1 (
  set "SCENEWRIGHT_PYTHON=python.exe"
  set "SCENEWRIGHT_PY_ARGS="
  goto build_app
)

echo Scenewright needs Python, but neither py.exe nor python.exe was found.
echo Install Python from python.org and enable "Add Python to PATH".
pause
exit /b 1

:build_app
if defined SCENEWRIGHT_PY_ARGS (
  "%SCENEWRIGHT_PYTHON%" %SCENEWRIGHT_PY_ARGS% "%~dp0build.py"
) else (
  "%SCENEWRIGHT_PYTHON%" "%~dp0build.py"
)
if errorlevel 1 (
  echo Scenewright could not update its files.
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
    goto start_server
  )
)

echo Scenewright could not find a free local port between 8765 and 8774.
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
