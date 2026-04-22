@echo off
setlocal enabledelayedexpansion

REM UOGA Hunt Tools: one-command publish helper for Windows cmd.exe
REM - Stages all changes
REM - Creates a commit (asks for message)
REM - Pushes to origin/main
REM - Prints a cache-busting URL you can paste into Wix iframe src

cd /d "%~dp0" >nul 2>&1

where git >nul 2>&1
if errorlevel 1 (
  echo git not found on PATH.
  exit /b 1
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%B
if not "!BRANCH!"=="main" (
  echo You are on branch "!BRANCH!" (expected "main").
  echo Aborting to avoid pushing the wrong branch.
  exit /b 2
)

REM Detect any changes (tracked/untracked) before staging.
git status --porcelain > "%TEMP%\\uoga_git_status.txt"
for %%A in ("%TEMP%\\uoga_git_status.txt") do if %%~zA==0 (
  for /f "delims=" %%H in ('git rev-parse --short HEAD') do set HASH=%%H
  echo Nothing to commit.
  echo Cache-bust URL: https://tools.uoga.org/?v=!HASH!
  del "%TEMP%\\uoga_git_status.txt" >nul 2>&1
  exit /b 0
)
del "%TEMP%\\uoga_git_status.txt" >nul 2>&1

git add -A

set MSG=
set /p MSG=Commit message (enter for auto): 
if "!MSG!"=="" (
  for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set TS=%%T
  set MSG=Update !TS!
)

git commit -m "!MSG!"
if errorlevel 1 (
  echo Commit failed. Check the output above.
  exit /b 3
)

git push origin main
if errorlevel 1 (
  echo Push failed. Check the output above.
  exit /b 4
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do set HASH=%%H
echo.
echo Pushed !HASH! to origin/main.
echo Cache-bust URL: https://tools.uoga.org/?v=!HASH!
exit /b 0

