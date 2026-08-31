# 一键打包部署包
# 用法: 在项目根目录执行  .\deploy.ps1
# 生成 ib.zip 后用 Xftp 上传到服务器 /root/ 覆盖旧包，
# 然后在服务器执行:  bash /root/IB/update.sh

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 只打包 git 已提交的内容（自动排除 node_modules / dist / .env 等）
git archive --format=zip -o ib.zip HEAD

Write-Host ""
Write-Host "已生成: $PSScriptRoot\ib.zip" -ForegroundColor Green
Write-Host "下一步:"
Write-Host "  1. Xftp 上传 ib.zip 到服务器 /root/ 覆盖旧包"
Write-Host "  2. 服务器执行:  bash /root/IB/update.sh"
