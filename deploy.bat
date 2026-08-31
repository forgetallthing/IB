@echo off
chcp 65001 >nul
cd /d %~dp0

rem 只打包 git 已提交的内容（自动排除 node_modules / dist / .env 等）
git archive --format=zip -o ib.zip HEAD
if errorlevel 1 (
  echo 打包失败，请检查 git 状态
  pause
  exit /b 1
)

echo.
echo 已生成: %~dp0ib.zip
echo 下一步:
echo   1. 用 Xftp 上传 ib.zip 到服务器 /web/ 覆盖旧包
echo   2. 服务器执行:  bash /web/IB/update.sh
echo.
pause
