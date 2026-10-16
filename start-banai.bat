@echo off
rem BanAI local launcher: starts the backend (:8000) and the frontend (:5173),
rem then opens the app in the default browser. Close the two server windows to stop.
setlocal
chcp 65001 >nul
title BanAI launcher
set "ROOT=%~dp0"
set "APP_URL=http://localhost:5173"
set "HEALTH_URL=http://127.0.0.1:8000/api/health"

where uv >nul 2>nul || (echo [BanAI] uv is not installed. See https://docs.astral.sh/uv/ & pause & exit /b 1)
where npm >nul 2>nul || (echo [BanAI] Node.js 22+ is not installed. See https://nodejs.org & pause & exit /b 1)

rem Already running: just open the browser.
curl -s -o nul "%APP_URL%" && curl -s -o nul "%HEALTH_URL%" && (start "" "%APP_URL%" & exit /b 0)

if not exist "%ROOT%backend\.env" copy "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul
if not exist "%ROOT%frontend\.env" copy "%ROOT%frontend\.env.example" "%ROOT%frontend\.env" >nul

echo [BanAI] Backend: syncing the Python virtual environment...
pushd "%ROOT%backend"
uv sync || (popd & pause & exit /b 1)
popd

if not exist "%ROOT%frontend\node_modules" (
  echo [BanAI] Frontend: installing npm packages...
  pushd "%ROOT%frontend"
  call npm ci || (popd & pause & exit /b 1)
  popd
)

start "BanAI backend :8000" /D "%ROOT%backend" cmd /k uv run uvicorn app.main:app --reload --port 8000
start "BanAI frontend :5173" /D "%ROOT%frontend" cmd /k npm run dev

echo [BanAI] Waiting for the servers to start...
set /a TRIES=0
:wait
set /a TRIES+=1
if %TRIES% gtr 90 (echo [BanAI] Servers did not start within 90 seconds. Check the server windows. & pause & exit /b 1)
rem ping, not timeout: timeout fails when the script runs without a console.
ping -n 2 127.0.0.1 >nul
curl -s -o nul "%HEALTH_URL%" || goto wait
curl -s -o nul "%APP_URL%" || goto wait

start "" "%APP_URL%"
echo [BanAI] Running at %APP_URL%. Close the two server windows to stop.
ping -n 6 127.0.0.1 >nul
