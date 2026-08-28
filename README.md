# 面试题仓库

## Docker 一键启动

1. 确保已安装 Docker Desktop。
2. 双击 `start.bat`，或在根目录执行 `docker compose up --build`。
3. 前端访问 `http://localhost:8080`。
4. 后端健康检查 `http://localhost:3000/api/health`。

## 本地开发启动

1. 确保已安装 Node.js、npm，并且本机 MongoDB 已经在 `127.0.0.1:27017` 运行。
2. 双击 `start-local.bat`。
3. 前端访问 `http://localhost:5173`。
4. 后端健康检查 `http://localhost:3000/api/health`。

## 默认账号

- 用户名：`admin`
- 密码：`admin123456`

## 停止

- 双击 `stop.bat`
