# IB 笔记库（Interview Bank）

面向面试复习场景的笔记管理平台：Markdown 编辑笔记、标签/难度/可见性体系、AI 辅助分析、多用户权限管理。

## 功能特性

- **笔记管理**：Vditor Markdown 编辑器（标题与正文）、全站 Markdown 渲染、列表默认折叠答案、多条件勾选筛选（标签 / 难度 / 可见性，均支持多选）
- **标签体系**：自定义标签（颜色、描述、排序），支持启用/停用，可随笔记归档
- **AI 辅助**：基于 DeepSeek 自动生成内容摘要、建议标签与难度
- **多用户**：JWT 登录；管理员可管理用户（创建/禁用/重置密码），普通用户可在「系统设置」修改自己的用户名密码
- **权限分层**：用户管理 / 标签管理 / 导入导出仅管理员可见；个人工作台所有用户可用
- **数据导入导出**：JSON 格式，管理员操作
- **提示体验**：全局右上角 Toast 通知、自定义确认弹窗

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Vue Router + Pinia + Vditor + marked |
| 后端 | Node.js + Fastify + TypeScript + Mongoose |
| 数据库 | MongoDB |
| 部署 | Docker Compose（nginx + pm2-runtime + mongo）或裸机 pm2 |

## 项目结构

```
IB/
├── frontend/               # Vue 3 前端
│   ├── src/views/          # 页面（列表/编辑/详情/登录/设置）
│   ├── src/components/     # 确认弹窗、Toast、筛选勾选组
│   ├── src/composables/    # useConfirm / useToast
│   ├── public/vditor/      # Vditor 静态资源（postinstall 自动复制）
│   └── scripts/copy-vditor.mjs
├── backend/                # Fastify 后端
│   └── src/modules/        # auth / users / questions / tags / import-export / ai
├── docker/nginx.conf       # nginx 配置（HTTPS + SPA 回退 + /api 反代）
├── Dockerfile              # 多阶段构建（build → backend → web）
├── docker-compose.yml      # 三容器编排
└── ecosystem.config.cjs    # 裸机 pm2 部署配置
```

## 本地开发

要求：Node.js 20+、npm、本机 MongoDB（或使用内存库）。

```bash
npm install          # workspaces 同时安装前后端依赖
npm run dev          # 前端 http://localhost:5173，后端 http://localhost:3000
```

前端通过 Vite 代理访问 `/api`；编辑器静态资源在 `npm install` 时自动就位。

后端不依赖本地 MongoDB 的开发模式（数据不持久化）：

```bash
cd backend && npm run dev:mem
```

常用命令（根目录执行）：

```bash
npm run build        # 构建前后端
npm run typecheck    # TypeScript 检查
npm run lint
```

## Docker 部署（推荐）

```bash
git clone https://github.com/forgetallthing/IB.git
cd IB

# 生成环境配置
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "ADMIN_SEED_PASSWORD=你的管理员密码" >> .env
echo "MONGO_USER=ibadmin" >> .env
echo "MONGO_PASSWORD=强密码" >> .env
echo "MONGO_PORT=28117" >> .env

docker compose up -d --build
```

- 网站访问：`http://服务器IP`（配置 SSL 后为 `https://你的域名`）
- 健康检查：`curl http://127.0.0.1/api/health`
- MongoDB 对外暴露在 `MONGO_PORT` 指定端口（root 账号认证，`authSource=admin`），方便本地客户端直连

### HTTPS 配置

将证书放至 `docker/certs/cert.pem` 和 `docker/certs/cert.key`，`docker/nginx.conf` 中的 `server_name` 改为你的域名，然后：

```bash
docker compose up -d --force-recreate web
```

nginx 配置与证书均为卷挂载，后续修改只需 `docker compose restart web`。

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥（生产必改） | 无/占位符 |
| `ADMIN_SEED_USERNAME` | 首次启动创建的管理员用户名 | `admin` |
| `ADMIN_SEED_PASSWORD` | 管理员初始密码（生产必改） | `admin123456` |
| `MONGO_USER` / `MONGO_PASSWORD` | MongoDB root 认证 | `ibadmin` / 占位符 |
| `MONGO_PORT` | MongoDB 对外暴露端口 | `28117` |
| `PORT` | 后端服务端口（容器内） | `3000` |
| `VITE_API_BASE_URL` | 前端 API 地址（同源部署可不设） | `/api` |

## 裸机 pm2 部署（可选）

```bash
npm install && npm run build
# 编辑 ecosystem.config.cjs 中的 env（JWT_SECRET 等）
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

前端静态文件可用 `pm2 serve frontend/dist 8080 --spa` 或 nginx 托管（`/api` 反代到 3000 端口）。

## 日常更新

```bash
git pull && npm install && npm run build   # 裸机
# 或
git pull && docker compose up -d --build   # Docker
```

## 默认账号

首次启动自动创建：`admin` / `ADMIN_SEED_PASSWORD` 指定的密码（未设置时为 `admin123456`，**生产环境务必修改**）。
