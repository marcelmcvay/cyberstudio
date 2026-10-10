@echo off
setlocal
set "MRMAK_LAUNCH_ROOT=%~dp0"
if exist "%LOCALAPPDATA%\CyberStudio\CyberStudio.exe" (
  start "" "%LOCALAPPDATA%\CyberStudio\CyberStudio.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
if exist "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\CyberStudio.exe" (
  start "" "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\CyberStudio.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
echo Install CyberStudio from this project's GitHub Releases.
echo Or build with: powershell -NoProfile -ExecutionPolicy Bypass -File Setup.ps1 -Mode Desktop
echo See docs\getting-started.md for agent-guided setup.
pause
