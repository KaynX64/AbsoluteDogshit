@echo off
call "%~dp0run-android-dev.bat" --cert-only %*
exit /b %errorlevel%
