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

# 从 mongo:7 官方镜像提取 mongodump，供「整库备份」接口在容器内直接调用
COPY --from=mongo:7 /usr/bin/mongodump /usr/local/bin/mongodump

COPY --from=build /app/backend/dist backend/dist

EXPOSE 3000
CMD ["pm2-runtime", "backend/dist/index.js", "--name", "ib-backend"]

# ---------- 阶段 3：前端（nginx 托管静态文件 + 反向代理） ----------
FROM nginx:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
