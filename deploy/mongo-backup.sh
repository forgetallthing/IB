#!/bin/bash
# 每日自动备份服务器 MongoDB（mongodump 归档 + gzip），保留最近 31 天（一个月）
# 由 systemd 定时器 ib-backup.timer 触发（ib-backup.service），日志: journalctl -u ib-backup
# 恢复方式: docker compose exec -T mongo mongorestore --archive --gzip < 备份文件

cd /web/IB || exit 1

# 凭证来自服务器 .env（与 docker-compose.yml 的 mongo 容器一致）；缺失时按无认证尝试
MONGO_USER=""
MONGO_PASSWORD=""
if [ -f /web/IB/.env ]; then
  MONGO_USER=$(grep -E '^MONGO_USER=' /web/IB/.env | cut -d= -f2- | tr -d '\r')
  MONGO_PASSWORD=$(grep -E '^MONGO_PASSWORD=' /web/IB/.env | cut -d= -f2- | tr -d '\r')
fi

BACKUP_DIR=/web/IB/backups
KEEP_DAYS=31
mkdir -p "$BACKUP_DIR"

FILE="$BACKUP_DIR/interview_bank_$(date '+%Y%m%d_%H%M%S').archive.gz"

AUTH_ARGS=()
if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASSWORD" ]; then
  AUTH_ARGS=(-u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin)
fi

if docker compose exec -T mongo mongodump "${AUTH_ARGS[@]}" --db interview_bank --archive --gzip > "$FILE.tmp"; then
  mv "$FILE.tmp" "$FILE"
  echo "$(date '+%F %T') 备份成功: $FILE ($(du -h "$FILE" | awk '{print $1}'))"
  # 清理过期备份
  find "$BACKUP_DIR" -name 'interview_bank_*.archive.gz' -mtime +"$KEEP_DAYS" -print -delete
else
  rm -f "$FILE.tmp"
  echo "$(date '+%F %T') 备份失败，请检查 mongo 容器与 .env 凭证" >&2
  exit 1
fi
