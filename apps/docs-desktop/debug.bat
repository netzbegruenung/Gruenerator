@echo off
REM Debug launcher for Grünerator Docs - enables WebView2 DevTools
REM Place this file next to "Grünerator Docs.exe" and run it

set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--auto-open-devtools-for-tabs

REM Try to find the exe in the same directory
if exist "%~dp0Grünerator Docs.exe" (
    start "" "%~dp0Grünerator Docs.exe"
) else if exist "%~dp0gruenerator-docs.exe" (
    start "" "%~dp0gruenerator-docs.exe"
) else (
    echo Could not find "Grünerator Docs.exe" in %~dp0
    echo Please place this file next to the .exe
    pause
)
