@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js and npm are required. Install Node.js, then run npm install in this folder.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm install in this folder first.
  pause
  exit /b 1
)
echo.
echo Shanghai prototype: http://127.0.0.1:5173/
echo Keep this window open while playing. Press Ctrl+C to stop.
echo.
call npm run dev -- --port 5173 --strictPort
echo.
echo The local server stopped.
pause
