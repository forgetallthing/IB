# IB 笔记库（Interview Bank）

面向面试复习场景的笔记管理平台：Markdown 编辑笔记、标签/难度/可见性体系、AI 辅助分析、多用户权限管理。

## 功能特性

- **笔记管理**：Vditor Markdown 编辑器（标题与正文，均支持粘贴/拖拽/选择图片上传）、全站 Markdown 渲染、列表默认折叠答案、多条件勾选筛选（标签 / 难度 / 可见性，均支持多选且本地记忆）
- **每日回想**：间隔重复学习系统——按出现次数加权随机抽题（越陌生越优先），对照回忆后自评反馈（没记住清零重推 / 模糊 +1 / 记住了 +2 / 完全掌握不再推送）；点击自评选项才计一次完整回想；支持手动档位（1-4 档重置出现次数并恢复自动调节，0 档完全掌握锁定）
- **数据看板**：统计卡（今日回想/累计回想/连续打卡/完全掌握）、GitHub 风格回想热力图（53 周，四档色阶，今天固定最右）、近 7 天趋势、推送频率分布、薄弱标签 Top 5、自评反馈分布、我的笔记统计；PC/Pad 一屏锁定不滚动
- **图片上传**：MongoDB GridFS 存储，标题/正文统一走 `/api/images`，小程序端渲染时自动补全绝对地址
- **标签体系**：自定义标签（颜色、描述、排序），支持启用/停用，可随笔记归档
- **AI 辅助**：基于 Coze 智能体自动生成内容摘要、建议标签与难度（未配置凭证时功能提示不可用）
- **多用户**：JWT 登录（scrypt 密码哈希）；管理员可管理用户（创建/禁用/重置密码），普通用户可在「系统设置」修改自己的用户名密码
- **权限分层**：用户管理 / 标签管理 / 导入导出仅管理员可见；个人工作台与数据看板所有用户可用
- **多端**：Web（响应式）+ 微信小程序（Taro），数据互通
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
│   ├── src/modules/        # auth / users / questions / tags / import-export / ai / images
│   ├── src/services/       # imageStore（GridFS 图片存取）
│   └── src/models/         # question / tag / user / quizState（回想权重状态）/ quizLog（回想日志）
├── docker/nginx.conf       # nginx 配置（HTTPS + SPA 回退 + /api 反代）
├── Dockerfile              # 多阶段构建（build → backend → web）
├── docker-compose.yml      # 三容器编排
├── deploy.bat              # 本地一键打包（Windows）
├── deploy/                 # 服务器自动部署监听（zip-watch.sh + systemd 服务）
├── ecosystem.config.cjs    # 裸机 pm2 部署配置
└── miniprogram/            # Taro 4 + React 微信小程序端（笔记浏览/新建/编辑）
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

## 小程序（miniprogram）

Taro 4 + React + TypeScript 微信小程序端。功能：笔记列表（点击进详情）、笔记详情/编辑（view/edit 双模式，编辑权限仅创建者与管理员可见按钮）、「新建」tab（常驻编辑器）、登录、我的。

### 微信开发者工具调试

```bash
cd miniprogram
npm install

npm run dev:weapp     # 开发模式（watch 增量编译，产物输出 dist/）
npm run build:weapp   # 完整生产构建（产物输出 dist/）
```

- 微信开发者工具「导入项目」目录选择 **`miniprogram/dist`**，AppID 填自己的（或用测试号）
- 日常改代码：保持 `dev:weapp` watch 运行，开发者工具自动刷新
- 若改动涉及结构性配置（`app.config.ts` 的 tabBar / 页面注册）或删除过页面，watch 增量可能产生不一致产物，症状为白屏或 `ENOENT: dist/pages/xxx` 报错。处理：**停掉 watch → 重新 `npm run dev:weapp` → 开发者工具清缓存重新编译**（顽固时关闭项目重新导入）

### Trae 手机预览（trae.mobile.volcapp.com 链接）

`https://trae.mobile.volcapp.com/preview/?ws=ws://localhost:1861` 是 Trae 内置技能 `TRAE-generate-mini-app` 的预览服务生成的链接，**固定监听 1861 端口**。电脑重启或 IDE 关闭后服务会停，用以下命令重新启动（`%USERPROFILE%` 即 `C:\Users\你的用户名`）：

```bash
node "%USERPROFILE%\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\preview-server.js" "D:\Workspace2017\test\IB\miniprogram"
```

首次运行时脚本会自动把最新副本更新到 `miniprogram/.pai/skill-update/`（工具缓存，已被 git 忽略），之后也可以直接用该副本启动。看到输出 `[TraePreviewUrl]: https://trae.mobile.volcapp.com/preview/?ws=ws://localhost:1861` 即启动成功，浏览器直接访问该链接（**链接固定不变**，端口写死 1861）。

> ⚠️ **切勿删除 `miniprogram/.pai/pai-preview-server.lock` 锁文件**——它用于复用端口，删掉后端口会漂移，原链接将永久失效。

### 浏览器 H5 预览（可选，仅供开发参考）

```bash
cd miniprogram
npm run dev:h5        # http://localhost:10086
```

手机同局域网访问 `http://<电脑局域网IP>:10086`。注意：H5 端 Markdown 渲染不走 towxml（weapp 专用组件），最终效果以微信开发者工具为准。

### 小程序结构备注

- `pages/editor/index.tsx`（详情/编辑，带 id）与 `pages/create/index.tsx`（新建 tab）都是**薄壳**，真正逻辑在 `pages/editor/EditorView.tsx`。页面文件之间禁止互相 import，否则 Taro 会给每个页面模块注入 Page 注册副作用，导致 `Please do not register multiple Pages` 崩溃
- Markdown 渲染使用 towxml 组件（`src/components/towxml`，light 主题）；正文中 http(s) 链接点击后复制到剪贴板（小程序无法直接调起浏览器），站内路径直接导航

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

# Coze 智能体 API（可选，不配置则「AI 分析」功能不可用）
echo "COZE_API_TOKEN=你的个人访问令牌" >> .env
echo "COZE_BOT_ID=你的智能体ID" >> .env

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
| `WECHAT_APPID` / `WECHAT_SECRET` | 微信小程序登录凭证（不配置则微信登录不可用） | 空 |
| `COZE_API_TOKEN` / `COZE_BOT_ID` | Coze 智能体 API 凭证，用于每日刷题「AI 分析」（不配置则该功能返回 501） | 空 |
| `COZE_API_BASE` | Coze API 地址，海外版改为 `https://api.coze.com` | `https://api.coze.cn` |
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

## 部署方案（zip + FTPS + 自动监听）

当前生产环境采用的流程：服务器无法直连 GitHub，通过 SFTP 传包 + 服务器端监听自动部署。

### 日常更新（三步）

```
1. 双击 deploy.bat                     # 本地打包已提交代码为 ib.zip
2. Xftp 上传 ib.zip 到服务器 /web/      # 覆盖旧包
3. 完成                                # 服务器 5 秒内自动检测并部署
```

> 重要：`deploy.bat` 只打包 **git 已提交** 的代码（`git archive HEAD`）。手动改过的文件必须先 commit，否则不会进包。

### 服务器端组件（一次性安装）

服务器项目位于 `/web/IB`，包含两个脚本：

**update.sh**（部署动作：解压 + 重建容器）：

```bash
cat > /web/IB/update.sh <<'EOF'
#!/bin/bash
set -e
cd /web/IB
if [ -f /web/ib.zip ]; then
  unzip -o /web/ib.zip -d /web/IB
fi
docker compose up -d --build
docker image prune -f
docker compose ps
EOF
chmod +x /web/IB/update.sh
```

**zip-watch.sh 监听服务**（检测到新包自动执行 update.sh，仓库 `deploy/` 目录里有同样内容）：

```bash
# 脚本由仓库 zip 自动带上，只需安装 systemd 服务：
cp /web/IB/deploy/ib-deploy.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ib-deploy      # 开机自启 + 立即运行
journalctl -u ib-deploy -f            # 查看监听日志
```

正常状态是**完全安静**（每 5 秒检查一次 zip，无变化不输出）；上传新包后 5 秒内出现 `detected new package, deploying → deploy OK`。

### 注意事项

- `.env`、`docker/certs/` 不在 git 仓库中，解压覆盖**不会**影响它们
- `.gitattributes` 强制 `*.sh`/`*.service` 使用 LF 换行，避免 Windows CRLF 导致 Linux 上脚本报错（`$'\r': command not found`）；若从其他途径上传脚本后报此错，执行 `sed -i 's/\r$//' 脚本路径` 修复
- 部署失败时监听服务不会对同一个包反复重试，修复后上传新包即重新触发

### Docker 首次部署 / HTTPS 配置

首次在服务器安装及 SSL 证书配置见下文「Docker 部署（推荐）」与「HTTPS 配置」章节。

## 默认账号

首次启动自动创建：`admin` / `ADMIN_SEED_PASSWORD` 指定的密码（未设置时为 `admin123456`，**生产环境务必修改**）。
