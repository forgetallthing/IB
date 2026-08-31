#!/bin/bash
# 监听 /web/ib.zip 变动，自动执行部署
# 由 systemd 服务 ib-deploy 常驻运行，日志: journalctl -u ib-deploy -f

ZIP=/web/ib.zip
LAST=""

while true; do
  if [ -f "$ZIP" ]; then
    SUM=$(md5sum "$ZIP" | awk '{print $1}')
    if [ "$SUM" != "$LAST" ]; then
      echo "==== $(date '+%F %T') 检测到新包，开始部署 ===="
      # 先记住当前包指纹，部署失败也不会对同一个包反复重试
      LAST=$SUM
      if bash /web/IB/update.sh; then
        echo "==== $(date '+%F %T') 部署成功 ===="
      else
        echo "==== $(date '+%F %T') 部署失败，请检查上方日志 ===="
      fi
    fi
  fi
  sleep 5
done
