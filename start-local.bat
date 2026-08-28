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

set "PORT=3000"
set "MONGO_URI=mongodb://127.0.0.1:27017/interview_bank"
set "JWT_SECRET=local-dev-secret"
set "DEEPSEEK_API_KEY=replace-me"
set "DEEPSEEK_BASE_URL=https://api.deepseek.com"
set "ADMIN_SEED_USERNAME=admin"
set "ADMIN_SEED_PASSWORD=admin123456"
set "ADMIN_SEED_EMAIL=admin@example.com"
set "VITE_API_BASE_URL=http://localhost:3000/api"

start "IB Backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "IB Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend: http://localhost:3000/api/health
echo Frontend: http://localhost:5173
echo.
echo Make sure MongoDB is already running on 127.0.0.1:27017.
pause