@echo off
setlocal
cd /d %~dp0

echo Starting interview question bank...

where docker >nul 2>nul
if errorlevel 1 (
	echo Docker was not found on PATH. Please install Docker Desktop first.
	pause
	exit /b 1
)

docker compose up --build
if errorlevel 1 (
	echo.
	echo docker compose failed. Check the messages above.
	pause
	exit /b 1
)

echo.
echo Project started successfully.
pause
