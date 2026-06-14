#!/bin/bash
# ==============================================
# 榴莲温度看板 — 一键部署（git 方式）
# 用法: ./deploy.sh [commit message]
# ==============================================

set -e

SERVER_IP="${DEPLOY_SERVER:-124.221.92.98}"

echo "🍈 榴莲温度看板 — 部署"

# ---- 1. Git 提交（如果有改动） ----
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  COMMIT_MSG="${1:-更新 $(date '+%Y-%m-%d %H:%M')}"
  echo ""
  echo "📝 提交: $COMMIT_MSG"
  git add -A
  git commit -m "$COMMIT_MSG"
else
  echo "📝 无本地改动，跳过提交"
fi

# ---- 2. 推送到 GitHub ----
echo ""
echo "🚀 推送到 GitHub..."
git push

# ---- 3. 提示服务器操作 ----
echo ""
echo "============================================"
echo "✅ 已推送到 GitHub"
echo ""
echo "👉 在服务器终端运行："
echo "   cd /home/ubuntu/温度看板 && git pull && pm2 restart durian-dashboard"
echo ""
echo "   看板: http://${SERVER_IP}:3000"
echo "============================================"
