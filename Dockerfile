# ---------- 阶段 1：构建前后端 ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install

COPY . .
RUN npm run build

# ---------- 阶段 2：后端（pm2-runtime 托管） ----------
FROM node:20-alpine AS backend
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
RUN npm install --omit=dev --workspace @ib/backend

RUN npm install -g pm2@5

COPY backend/dist backend/dist

EXPOSE 3000
CMD ["pm2-runtime", "backend/dist/index.js", "--name", "ib-backend"]

# ---------- 阶段 3：前端（nginx 托管静态文件 + 反向代理） ----------
FROM nginx:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
