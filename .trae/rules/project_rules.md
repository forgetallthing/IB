# IB 笔记库（Interview Bank）— AI 项目规则

面试复习笔记平台：Vue 3 + TS + Vite 前端（frontend/）、Fastify + TS + Mongoose 后端（backend/）、MongoDB、Taro 4 + React 微信小程序（miniprogram/）、Docker Compose 部署（nginx + pm2 + mongo）。

## UI / UX 硬约束

- 主色为青绿 teal（#0d9488 → #0f766e），配冷色调阴影；禁止高饱和大色块背景
- 系统默认 `confirm()` 一律替换为自定义确认弹窗（`frontend/src/composables/useConfirm.ts`）
- 所有通知用右上角 toast（`useToast.ts`），不用行内提示文字
- 保存成功后停留在当前页，不自动跳转列表
- 所有外部 http(s) 链接新标签页打开：`target="_blank"` + `rel="noopener noreferrer"`
- 组件用自定义样式，避免系统默认外观与黑色 hover 背景；按钮紧凑、间距一致
- 数据看板为锁定视口布局，细节约束见各页面既有实现，改动时保持不出现页面滚动条

## 后端约束

- 密码必须 scrypt 哈希（随机盐 + timingSafeEqual）；旧 SHA-256 在登录时透明升级，勿回退
- JWT_SECRET 禁止默认值 'replace-me' 上生产（启动时校验）
- 管理功能（用户管理/标签管理/整库备份）仅管理员：前端隐藏 tab 之外，后端必须再做 JWT + 角色校验
- 导入导出已改为整库备份 `GET /api/backup/export`（spawn mongodump --archive --gzip，仅管理员），导入功能暂未实现
- `GET /api/questions` 可见性过滤：前端路由守卫强制游客先登录（产品上游客看不到任何内容）；API 层兜底过滤——未登录仅 public，登录用户 public + 自己的，admin 全部
- 敏感接口（如登录）用 @fastify/rate-limit 限流，`global: false` 按路由启用；app.ts 已设 `trustProxy: true`
- 聚合操作符须兼容本地 MongoDB 4.2：禁用 4.4+ 的 `$first`/`$last` 数组操作符，用 `$arrayElemAt: [expr, 0]` 代替；测试用内存库是 7.x，测不出此差异
- 图片存 GridFS（`/api/images`），清理走引用扫描 GC（dry-run 先行）
- 新增路由时注意：Question 模型缺索引、搜索 q 未做正则转义，属已知改进项，勿在无关改动中顺手重构

## 部署约束

- `deploy.bat` 只打包 git 已提交代码（git archive HEAD）→ 改动必须先 commit 再打包上传
- `*.sh` / `*.service` 必须 LF 换行（.gitattributes 已强制），否则 Linux 上脚本报错
- 服务器 `.env` 与 `docker/certs/` 永不被解压覆盖；本地 `backend/.env` 不入库
- 部署流程：上传 ib.zip 到服务器 /web/ → 监听服务 5 秒内自动 build 部署
- MongoDB 对外端口 28117，生产需安全组限制来源 IP
- Dockerfile backend 阶段为 node:20-slim（glibc 兼容）并从 mongo:7 复制 mongodump，勿改回 alpine
- 本地 mongodump 备份目录（`.backup*/`）已在 .gitignore，绝不能提交

## 前端约束

- 列表筛选状态持久化到 localStorage（key: `ib_question_filters`），进入页面恢复
- Vditor 资源必须本地加载（public/vditor，postinstall 复制），禁用 CDN
- 详情页 Markdown 渲染分两步（标题立即、正文延时 350ms）并用 session 缓存，避免卡顿
- v-html 渲染 Markdown 前需 sanitize（已知待办：引入 DOMPurify）

## 小程序约束（miniprogram/）

- 页面模块之间禁止互相 import（会重复注册 Page() 导致崩溃），共享逻辑放纯组件
- tabBar 页面 100vh 包含 tabBar 高度，勿把 100vh 当容器高度用
- 原生 Textarea 不参与 flex 空间分配，用 View 包裹 + 固定高度方案
- Markdown 图片 URL 需用 API_BASE 补全绝对路径
- 编辑器页面结构：editor 与 create 都是薄壳，真正逻辑在 EditorView.tsx

## 操作规范

- 改后端后：`npm run typecheck -w @ib/backend` + `npm test -w @ib/backend -- --run`（13 个测试须全过）
- 改前端后：`npm run typecheck -w @ib/frontend` + `npm run build -w @ib/frontend`
- 数据库变更：先只读检查 → mongodump 备份到 `.backup-*`（不入 git）→ 再修改 → 验证计数；服务器库连接串在 `backend/.env` 的 MONGO_URI
- 本地 mongodump/mongo 工具在 `D:\software\mongo\bin`（shell 版本 4.2）
- 服务器 DB 直连：`D:\software\mongo\bin\mongo.exe "mongodb://...@123.56.158.39:28117/interview_bank?authSource=admin" 脚本.js`
