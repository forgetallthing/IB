@echo off
setlocal
cd /d %~dp0

echo Starting local development environment...

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Please install Node.js first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found on PATH. Please install Node.js first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing workspace dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

rem 数据库/AI/种子账号等配置统一在 backend\.env 中设置（不会被 git 提交），此处不再硬编码覆盖
set "PORT=3000"
set "VITE_API_BASE_URL=http://localhost:3000/api"

start "IB Backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "IB Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend: http://localhost:3000/api/health
echo Frontend: http://localhost:5173
echo.
echo Database and other settings come from backend\.env (MONGO_URI etc.).
pause