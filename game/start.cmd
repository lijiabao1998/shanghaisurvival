@echo off
setlocal
set "GODOT_EXE=%~dp0.tools\Godot_v4.6.3-stable_win64.exe"
if not exist "%GODOT_EXE%" (
  echo Godot 4.6.3 is missing from game\.tools. See game\README.md.
  pause
  exit /b 1
)
if not exist "%~dp0.tools\profile" mkdir "%~dp0.tools\profile"
set "APPDATA=%~dp0.tools\profile"
"%GODOT_EXE%" --path "%~dp0"
endlocal
