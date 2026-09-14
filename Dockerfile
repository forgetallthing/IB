# ---------- 阶段 1：构建前后端 ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY frontend/scripts frontend/scripts
RUN npm install

COPY . .
RUN npm run build

# ---------- 阶段 2：后端（pm2-runtime 托管） ----------
# 用 debian-slim 而非 alpine：glibc 兼容 mongo:7 里的 mongodump 二进制（整库备份功能依赖）
FROM node:20-slim AS backend
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
RUN npm install --omit=dev --workspace @ib/backend

RUN npm install -g pm2@5

# 安装 MongoDB Database Tools（mongodump），供「整库备份」接口在容器内直接调用。
# 勿改回从 mongo:7 复制单文件：该二进制动态链接 ubuntu(jammy) 的共享库，slim 镜像
# 缺库时动态链接器直接以退出码 127 失败；官方 deb 与 bookworm 匹配，apt 自动补齐依赖
ADD https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.18.0.deb /tmp/mongodb-database-tools.deb
RUN apt-get update \
 && apt-get install -y --no-install-recommends /tmp/mongodb-database-tools.deb \
 && rm -f /tmp/mongodb-database-tools.deb \
 && rm -rf /var/lib/apt/lists/* \
 && mongodump --version

COPY --from=build /app/backend/dist backend/dist

EXPOSE 3000
CMD ["pm2-runtime", "backend/dist/index.js", "--name", "ib-backend"]

# ---------- 阶段 3：前端（nginx 托管静态文件 + 反向代理） ----------
FROM nginx:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
