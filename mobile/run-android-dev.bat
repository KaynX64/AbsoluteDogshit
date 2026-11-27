@echo off
setlocal
where.exe node.exe >nul 2>&1
if errorlevel 1 (
    echo Install Node.js 22 or later and add it to PATH.
    exit /b 1
)
node "%~dp0run-android-dev.mjs" %*
exit /b %errorlevel%
