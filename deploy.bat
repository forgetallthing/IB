@echo off
cd /d %~dp0

git archive --format=zip -o ib.zip HEAD
if errorlevel 1 (
  echo Package FAILED. Check git status.
  pause
  exit /b 1
)

echo.
echo Created: %~dp0ib.zip
echo Next steps:
echo   1. Upload ib.zip to server /web/ via Xftp (overwrite old one)
echo   2. Run on server:  bash /web/IB/update.sh
echo.
pause
