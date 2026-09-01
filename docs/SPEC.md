# 面试题仓库 Technical Spec

## 1. 范围说明

本技术方案对应一个内部自用的面试题仓库系统，采用 Vue 3 + Node.js + MongoDB，并通过 Docker Compose 部署。

### 1.1 目标

- 支持账号登录和权限控制。
- 支持题目的创建、编辑、浏览、搜索、筛选和删除。
- 支持纯文本内容展示。
- 支持 AI 辅助生成标签、摘要和难度建议。
- 支持导入、导出和 Docker 部署。
- 支持 PC、Pad 和手机端响应式适配。

### 1.2 非目标

- 不做公开注册。
- 不做审核流和内容版本历史。
- 不做后端在线判题服务。
- 不做多语言执行沙箱。
- 不做复杂推荐系统。

## 2. 技术选型

### 2.1 前端

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- Element Plus 或同类组件库
- 文本展示组件
- 轻量级代码展示与运行区域

### 2.2 后端

- Node.js
- TypeScript
- Fastify 或 Express
- MongoDB Driver 或 Mongoose
- Zod 或同类校验库
- JWT 登录认证
- Multer 或同类上传库，用于导入文件

### 2.3 数据库

- MongoDB
- 建议为关键字段建立索引：标题、标签、难度、创建人、可见性、更新时间

### 2.4 部署

- Docker
- Docker Compose
- Nginx 反向代理前端和后端
- MongoDB 持久化卷

## 3. 总体架构

```mermaid
flowchart LR
  Browser[Browser / Mobile / Pad] --> Web[Vue 3 Frontend]
  Web --> Api[Node.js API]
  Api --> Mongo[(MongoDB)]
  Api --> AI[DeepSeek API]
  Web --> LocalRunner[Browser-side JS demo runner]
```

### 3.1 模块划分

- Auth 模块：登录、退出、会话管理。
- User 模块：管理员创建成员、停用账号、重置密码。
- Question 模块：题目增删改查。
- Search 模块：关键词搜索和筛选。
- AI 模块：调用 DeepSeek 做摘要、标签和难度建议。
- Import/Export 模块：导入导出题库。
- UI 模块：响应式布局和答案折叠交互。

## 4. 数据模型

### 4.1 User

```ts
{
  _id: string;
  username: string;
  email?: string;
  openId?: string;          // 微信小程序 openid，微信登录账号唯一标识（稀疏唯一索引）
  passwordHash: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
```

#### 约束

- username 唯一。
- email 可选但如使用则唯一。
- password 仅保存 hash。

### 4.2 Question

```ts
{
  _id: string;
  title: string;
  content: string;
  answer: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'private';
  source?: string;
  aiSummary?: string;
  aiSuggestedTags?: string[];
  aiSuggestedDifficulty?: 'easy' | 'medium' | 'hard';
  createdAt: Date;
  updatedAt: Date;
}
```

#### 约束

- 标题必填。
- 题干和答案使用纯文本。
- 私有题目仅创建者和 admin 可见。
- 不保留版本历史。
- 删除采用硬删除，不提供回收站。

### 4.3 ImportExportJob

如后续需要异步导入导出，可增加任务表；第一版也可以同步完成并跳过该模型。

## 5. 权限设计

### 5.1 角色权限矩阵

| 操作 | admin | member |
| --- | --- | --- |
| 登录 | Yes | Yes |
| 创建账号 | Yes | No |
| 查看公开题目 | Yes | Yes |
| 查看私有题目 | Yes | 仅自己创建的私有题目 |
| 创建题目 | Yes | Yes |
| 编辑自己创建的题目 | Yes | Yes |
| 编辑他人题目 | Yes | No |
| 删除自己创建的题目 | Yes | Yes |
| 删除他人题目 | Yes | No |
| 导入导出 | Yes | Yes |
| AI 辅助 | Yes | Yes |

### 5.2 鉴权方式

- 使用 JWT 作为登录态。
- 前端在请求头中携带 access token。
- 后端通过中间件解析用户身份和角色。
- 管理员接口必须额外校验 role。

## 6. API 设计

### 6.1 Auth

#### POST /api/auth/login

请求：

```json
{
  "username": "alice",
  "password": "123456"
}
```

响应：

```json
{
  "token": "jwt-token",
  "user": {
    "id": "...",
    "username": "alice",
    "role": "member"
  }
}
```

#### POST /api/auth/wechat-login

微信小程序登录（新增，不影响现有 Web 端）。

请求：

```json
{
  "code": "wx.login 获取的临时 code",
  "username": "可选，用于绑定已有账号",
  "password": "可选，与 username 成对出现"
}
```

处理逻辑：

1. 服务端未配置 `WECHAT_APPID`/`WECHAT_SECRET` 时返回 501，提示使用账号密码登录。
2. 以 code 调用微信 `jscode2session` 换取 openid。
3. openid 已绑定用户 → 直接签发 JWT 登录。
4. 未绑定但传入账号密码 → 校验通过后将 openid 绑定到该账号并登录。
5. 其余情况自动创建成员账号（username 形如 `wx_xxxxxxxx`，随机密码）并登录。

响应结构与 `/api/auth/login` 一致（`token` + `user`）。

#### POST /api/auth/logout

- 前端清理 token 即可。
- 如后续引入 refresh token，再扩展服务端失效逻辑。

#### GET /api/auth/me

- 返回当前登录用户信息。

### 6.2 Users

#### POST /api/users

- 仅 admin 可用。
- 创建成员账号。

#### GET /api/users

- 仅 admin 可用。
- 用于成员列表和停用管理。

#### PATCH /api/users/:id/status

- 仅 admin 可用。
- active / disabled 切换。

### 6.3 Questions

#### GET /api/questions

查询参数：

- q：关键词。
- tags：标签列表。
- difficulty：难度。
- creatorId：创建人。
- visibility：可见性。
- page：页码。
- pageSize：每页数量。

#### POST /api/questions

- 创建题目。
- 支持同时提交 AI 建议字段，但不强制。

#### GET /api/questions/:id

- 返回题目详情。
- 按可见性和权限做访问控制。

#### PUT /api/questions/:id

- 更新题目。
- 校验编辑权限。

#### DELETE /api/questions/:id

- 硬删除。
- 仅可删除有权限的题目。

### 6.4 AI

#### POST /api/ai/analyze

请求：

```json
{
  "title": "什么是闭包",
  "content": "...",
  "answer": "..."
}
```

响应：

```json
{
  "summary": "...",
  "suggestedTags": ["JS", "作用域"],
  "suggestedDifficulty": "medium"
}
```

### 6.5 Import/Export

#### GET /api/questions/export

- 支持 JSON 导出。
- 可选 CSV 导出。

#### POST /api/questions/import

- 支持 JSON 导入。
- 如果采用 CSV，需要字段映射。
- 导入前做 schema 校验。
- 导入结果返回成功条数和失败条数。

## 7. 搜索与筛选实现

### 7.1 查询能力

- title 和 content 的全文检索。
- tags 精确匹配。
- difficulty 精确匹配。
- creatorId 精确匹配。
- visibility 精确匹配。

### 7.2 索引建议

- title text index。
- content text index。
- tags index。
- difficulty index。
- creatorId index。
- visibility index。
- updatedAt index。

### 7.3 排序

默认按更新时间倒序，必要时可按创建时间倒序。

## 8. 前端页面

### 8.1 页面结构

- 登录页。
- 题目列表页。
- 题目详情页。
- 题目编辑页。
- 管理员用户管理页。
- 导入导出页。

### 8.2 列表交互

- 顶部搜索区放关键词、标签、难度、创建人。
- 列表卡片展示题目标题、标签、难度、创建人和更新时间。
- 默认折叠答案。
- 点击独立按钮展开或收起答案。
- 私有题目明确打标。

### 8.3 响应式策略

- PC：左侧筛选，右侧列表/详情。
- Pad：筛选折叠为抽屉或上方区域。
- 手机：单列卡片，筛选入口折叠为弹出层。

## 9. 文本内容与安全

### 9.1 文本展示

- 后端存普通文本原文。
- 前端统一渲染。
- 渲染前做 XSS 清洗。

### 9.2 输入校验

- 所有写接口做参数校验。
- 文本长度限制。
- 标签数量限制。
- 文件导入做格式和大小限制。

## 10. AI 集成

### 10.1 目标

- 为录题提供标签、摘要、难度建议。
- 不作为保存题目的前置条件。

### 10.2 供应商

- 第一版对接 DeepSeek API。
- API Key 放在环境变量中。

### 10.3 失败处理

- AI 请求失败不阻塞题目保存。
- 前端提示“建议获取失败，可稍后重试”。
- 后端记录错误日志和耗时。

## 11. 浏览器本地 JS 运行

- 仅支持前端本地运行示例代码。
- 不发送到后端执行。
- 仅作为展示或学习辅助，不作为判题系统。
- 运行区域应隔离页面上下文，避免污染主应用状态。

建议实现为：

- 代码编辑区使用轻量编辑器。
- 结果在 iframe 或受控沙箱中展示。
- 超时和错误需要前端捕获。

## 12. Docker 部署

### 12.1 服务划分

- web：前端静态资源。
- api：Node.js 后端服务。
- mongo：数据库。
- nginx：统一入口和反向代理。

### 12.2 环境变量

- MONGO_URI
- JWT_SECRET
- DEEPSEEK_API_KEY
- DEEPSEEK_BASE_URL
- ADMIN_SEED_USERNAME
- ADMIN_SEED_PASSWORD
- WECHAT_APPID（可选，小程序微信登录）
- WECHAT_SECRET（可选，小程序微信登录）

### 12.3 启动顺序

1. MongoDB 启动并完成初始化。
2. 后端执行建表或初始化脚本。
3. 后端创建默认管理员账号。
4. 前端与 Nginx 对外提供访问。

## 13. 目录建议

```text
project/
  frontend/
  backend/
  docker/
  docs/
```

## 14. 非功能需求

- 可用性：适合小团队稳定使用。
- 性能：列表查询和搜索需在可接受时间内返回。
- 可维护性：模块边界清晰，方便后续扩展题单、收藏和历史记录。
- 可部署性：docker-compose 一键启动。

## 15. 测试建议

- 登录和权限测试。
- 题目增删改查测试。
- 搜索与筛选测试。
- 导入导出测试。
- AI 失败降级测试。
- 移动端响应式测试。
- 文本展示与转义测试。

## 16. 后续可扩展项

- 收藏题目。
- 题单。
- 编辑历史。
- 回收站。
- 更细粒度权限。
- 多 AI 供应商支持。

## 17. 微信小程序端（Taro）

### 17.1 定位与原则

- 与浏览器版共用同一套后端 API 与 MongoDB 数据，小程序是独立的第二客户端。
- 浏览器版零改动：后端仅做增量扩展（`POST /api/auth/wechat-login`、User.openId 字段、WECHAT_* 环境变量）。
- 代码位于独立目录 `miniprogram/`，独立构建与发布，不参与 Web 前端的 Docker 构建。

### 17.2 技术选型

- Taro 4.1.9（webpack5 编译）+ React 18 + TypeScript。
- 样式：CSS Modules（`*.module.scss`）+ 全局主题变量（`src/styles/theme.scss`，与 Web 端一致的青绿色系 `#0d9488`）。
- 状态管理：zustand（`store/auth.ts` 登录态、`store/ui.ts` 跨 tab 通信）。
- Markdown 渲染：自研轻量转换器 `utils/markdown.ts`（标题/加粗/行内代码/围栏代码块/引用/列表/表格/链接图片）输出 HTML，经 RichText 组件渲染，无外部依赖。
- 工具库：classnames、dayjs（模板预置）。

### 17.3 架构

```mermaid
flowchart LR
  MP[微信小程序 Taro] -->|Taro.request + JWT| Api[Node.js API]
  Web[Vue3 Web 前端] --> Api
  Api --> Mongo[(MongoDB)]
  Api --> WX[微信 jscode2session]
  Api --> AI[DeepSeek API]
```

### 17.4 请求封装与数据源切换

- `services/api.ts` 统一封装：
  - `weapp` 环境：Taro.request 携带 `Authorization: Bearer <token>`，GET 查询串手动拼接（数组重复 key，与 Fastify 解析一致）；401 统一清理登录态并跳转登录页。
  - 非 `weapp`（H5 预览）：动态加载 `src/data/<mockName>.ts` 的 mock 实现，mock 状态存于内存 `src/data/db.ts`，字段结构与真实后端一致。
- API 基地址：`config/index.ts`，开发 `http://localhost:3000`，生产 `https://ib.ipromiseyourlife.com`。
- 微信真机联调要求：在小程序后台配置 request 合法域名（生产域名 HTTPS）。

### 17.5 微信登录流程

1. 小程序端 `Taro.login()` 获取临时 code。
2. `POST /api/auth/wechat-login` 提交 code（可选携带 username/password 用于绑定）。
3. 后端以 code 调用微信 `jscode2session` 获取 openid。
4. 按「已绑定 → 直接登录 / 有账号密码 → 绑定后登录 / 其余 → 自动建号（wx_ 前缀，member 角色）」三段策略处理。
5. 签发与 Web 端一致的 JWT；token 持久化于小程序本地存储（key: `ib_mp_token`）。

### 17.6 页面结构

| 页面 | 路径 | 类型 | 说明 |
| --- | --- | --- | --- |
| 笔记中心 | pages/notes | tabBar | 搜索、多选筛选（本地缓存 `ib_mp_question_filters`）、折叠展开、下拉刷新、分页 |
| 标签 | pages/tags | tabBar | 标签云浏览、点击跳转笔记筛选；管理员入口 |
| 我的 | pages/mine | tabBar | 用户信息、设置/管理入口、未登录引导 |
| 登录 | pages/login | 二级 | 微信一键登录 + 账号密码登录 |
| 笔记编辑 | pages/editor | 二级 | 新增/编辑/删除、标签难度可见性、AI 建议一键应用 |
| 系统设置 | pages/settings | 二级 | 用户名/密码修改、退出登录、管理员入口 |
| 用户管理 | pages/users | 二级(admin) | 创建账号、停用/启用、重置密码 |
| 标签管理 | pages/tags-manage | 二级(admin) | 新建/编辑/删除、上移下移排序、色板选色 |

- 权限与 Web 端一致：管理员可维护所有笔记，成员仅自己创建的；前端展示与后端 403 双重约束。
- 导入导出在小程序端仅展示引导提示，实际操作在网页端。

### 17.7 部署与发布

- 小程序构建产物独立（`npm run build:weapp`），通过微信开发者平台上传发布；服务端无需为小程序增加容器。
- 后端部署需在 `.env` 中按需补充 `WECHAT_APPID`、`WECHAT_SECRET`（保留 `.env` 不被部署覆盖的既有约定）。
- H5 预览使用 mock 数据，不依赖后端；微信登录仅真机/微信开发者工具可用。
