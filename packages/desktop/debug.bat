@echo off
REM Debug launcher for Grünerator - enables WebView2 DevTools
REM Place this file next to Grünerator.exe and run it

set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--auto-open-devtools-for-tabs

REM Try to find the exe in the same directory
if exist "%~dp0Grünerator.exe" (
    start "" "%~dp0Grünerator.exe"
) else if exist "%~dp0gruenerator.exe" (
    start "" "%~dp0gruenerator.exe"
) else (
    echo Could not find Grünerator.exe in %~dp0
    echo Please place this file next to the .exe
    pause
)
