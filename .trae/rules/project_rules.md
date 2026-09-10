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
- 笔记类型 `type: 'qa'（回想，默认）| 'article'（文章）`：每日回想抽题池仅取 qa；`GET /api/questions` 支持 type 筛选；type 改回 qa 时自动清空 seriesId/order
- Series 为创建者私有域：增删改与成员文章调整（添加/移出/排序）仅创建者或 admin；一篇笔记最多属于一个系列（seriesId + order）；删除系列 = 解绑文章而非删除文章
- 系列枚举与目录按笔记可见性过滤：他人仅可见「含至少一篇可见文章」的系列与其中可见文章
- 系列排序：`Series.order` 升序（新系列追加末尾），`PATCH /api/series/reorder` 全量提交新顺序（共享目录，登录即可拖）；文章目录排序走 `PATCH /api/series/:id/reorder`（仅创建者/admin）
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
- 页面状态保活（KeepAlive）：列表页/系列页/每日回想三个有状态页面在 App.vue `keepAliveNames` 中保活，对应组件必须用 `defineOptions` 声明同名 name；新增保活页面时同步维护 App.vue 的 `keptScrollPaths`（滚动位置按路径记忆恢复）
- 保活回访的数据刷新走脏标记：编辑页保存后置 `stores/dataDirty.ts` 的 `questionListDirty`，列表页 onActivated 消费后刷新；系列页 onActivated 静默刷新列表与已展开目录；登录/登出时 App.vue 清空保活缓存防串号
- Vditor 资源必须本地加载（public/vditor，postinstall 复制），禁用 CDN
- 详情页 Markdown 渲染分两步（标题立即、正文延时 350ms）并用 session 缓存，避免卡顿
- v-html 渲染 Markdown 前需 sanitize（已知待办：引入 DOMPurify）
- 编辑页把已入系列的文章切回「回想」时，必须先弹 `useConfirm` 确认（提示将移出系列），取消则保持原类型
- 系列笔记页（/series）为目录树：系列行点击折叠/展开（默认折叠）、展开显示文章目录、点文章行进详情；系列行与文章行同级拖拽排序；管理操作仅对自己创建的系列显示；添加文章弹层仅列「自己创建、article 类型、未入任何系列」的笔记
- 详情页文章类型不显示自评反馈按钮，显示所属系列徽标（点击跳转系列笔记页）

## 小程序约束（miniprogram/）

- 页面模块之间禁止互相 import（会重复注册 Page() 导致崩溃），共享逻辑放纯组件
- tabBar 页面 100vh 包含 tabBar 高度，勿把 100vh 当容器高度用
- 原生 Textarea 不参与 flex 空间分配，用 View 包裹 + 固定高度方案
- Markdown 图片 URL 需用 API_BASE 补全绝对路径
- 编辑器页面结构：editor 与 create 都是薄壳，真正逻辑在 EditorView.tsx

## 操作规范

- 改后端后：`npm run typecheck -w @ib/backend` + `npm test -w @ib/backend -- --run`（26 个测试须全过）
- 改前端后：`npm run typecheck -w @ib/frontend` + `npm run build -w @ib/frontend`
- 数据库变更：先只读检查 → mongodump 备份到 `.backup-*`（不入 git）→ 再修改 → 验证计数；服务器库连接串在 `backend/.env` 的 MONGO_URI
- 本地 mongodump/mongo 工具在 `D:\software\mongo\bin`（shell 版本 4.2）
- 服务器 DB 直连：`D:\software\mongo\bin\mongo.exe "mongodb://...@123.56.158.39:28117/interview_bank?authSource=admin" 脚本.js`
