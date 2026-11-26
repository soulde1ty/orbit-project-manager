@echo off
setlocal
cd /d "%~dp0"
set "ORBIT_NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined ORBIT_NODE set "ORBIT_NODE=%%N"
if not defined ORBIT_NODE for /f "delims=" %%P in ('powershell -NoProfile -Command "Get-AppxPackage -Name '*CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1 -ExpandProperty InstallLocation"') do set "ORBIT_NODE=%%P\dependencies\node\bin\node.exe"
if not defined ORBIT_NODE (
  echo Install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "%ORBIT_NODE%" (
  echo Node.js was not found. Install Node.js 22.12 or newer.
  pause
  exit /b 1
)
"%ORBIT_NODE%" scripts\launch.mjs
if errorlevel 1 pause
