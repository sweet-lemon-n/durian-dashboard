#!/bin/bash
# ==============================================
# 榴莲温度看板 — 一键部署到服务器
# 用法: ./deploy.sh [服务器IP]  [--all]
#   --all  跳过交互，直接部署全部文件
# ==============================================

set -e

# 配置
SERVER_IP="${1:-124.221.92.98}"
SERVER_USER="ubuntu"
SERVER_DIR="/home/ubuntu/温度看板"
SSHPASS=""

# 检查 sshpass
if ! command -v sshpass &> /dev/null; then
  echo "❌ 缺少 sshpass，请先安装: brew install sshpass"
  exit 1
fi

# ---- 函数 ----

# 统一输入密码（只输入一次）
get_password() {
  if [ -n "$SSHPASS" ]; then return; fi
  echo -n "🔑 服务器密码: "
  read -s SSHPASS
  echo ""
  export SSHPASS
}

# 使用 sshpass 的 scp
do_scp() {
  sshpass -e scp -o StrictHostKeyChecking=no "$@"
}

# 使用 sshpass 的 ssh
do_ssh() {
  sshpass -e ssh -o StrictHostKeyChecking=no "$@"
}

# 要部署的文件/目录
FILES=(
  "server.js"
  "package.json"
  ".env.example"
  ".env"
  "deploy.sh"
)

DIRS=(
  "lib"
  "public"
)

ALL_ITEMS=("${FILES[@]}" "${DIRS[@]}")

# ---- 交互选择（除 --all 外） ----

SELECTED=()

if [ "$2" = "--all" ] || [ "$1" = "--all" ]; then
  SELECTED=("${ALL_ITEMS[@]}")
  echo "📦 模式: 全部部署"
else
  echo ""
  echo "📋 可选部署项:"
  echo ""
  idx=1
  for item in "${ALL_ITEMS[@]}"; do
    if [ -f "$item" ]; then
      echo "  [$idx] 📄 $item"
    elif [ -d "$item" ]; then
      echo "  [$idx] 📁 $item/"
    fi
    ((idx++))
  done
  echo "  [a] 🚀 全部"
  echo "  [q] ❌ 取消"
  echo ""

  read -p "👉 输入编号（多个用逗号分隔，如 1,3,5 或 a）: " choice

  if [ "$choice" = "q" ]; then
    echo "已取消"
    exit 0
  fi

  if [ "$choice" = "a" ]; then
    SELECTED=("${ALL_ITEMS[@]}")
  else
    IFS=',' read -ra NUMS <<< "$choice"
    for n in "${NUMS[@]}"; do
      n=$(echo "$n" | xargs)  # trim
      if [ "$n" -ge 1 ] 2>/dev/null && [ "$n" -le "${#ALL_ITEMS[@]}" ]; then
        SELECTED+=("${ALL_ITEMS[$((n-1))]}")
      fi
    done
  fi
fi

if [ ${#SELECTED[@]} -eq 0 ]; then
  echo "❌ 未选择任何项"
  exit 1
fi

echo ""
echo "将部署: ${SELECTED[*]}"
echo "目标: ${SERVER_USER}@${SERVER_IP}:${SERVER_DIR}"
echo ""

# ---- 获取密码 ----
get_password

# ---- 执行部署 ----

echo "🚀 开始部署..."
echo ""

# 分别处理文件和目录
for item in "${SELECTED[@]}"; do
  if [ -f "$item" ]; then
    echo "  📄 同步文件: $item"
    do_scp "$item" "${SERVER_USER}@${SERVER_IP}:${SERVER_DIR}/"
  fi
done

for item in "${SELECTED[@]}"; do
  if [ -d "$item" ]; then
    echo "  📁 同步目录: $item/"
    do_scp -r "$item/" "${SERVER_USER}@${SERVER_IP}:${SERVER_DIR}/${item}/"
  fi
done

# ---- 重启服务 ----
echo ""
echo "🔧 重启服务..."

do_ssh "${SERVER_USER}@${SERVER_IP}" << 'ENDSSH'
cd /home/ubuntu/温度看板

# 安装新增的依赖
npm install --production 2>&1 | tail -1

# 重启 pm2 服务
if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q durian-dashboard; then
  pm2 restart durian-dashboard
  echo "✅ pm2 服务已重启"
else
  pkill -f "node server.js" 2>/dev/null || true
  nohup node server.js > /tmp/durian-dashboard.log 2>&1 &
  sleep 1
  if pgrep -f "node server.js" > /dev/null; then
    echo "✅ 服务已在后台启动 (PID: $(pgrep -f 'node server.js'))"
  else
    echo "❌ 服务启动失败，查看日志: tail /tmp/durian-dashboard.log"
  fi
fi
ENDSSH

echo ""
echo "============================================"
echo "✅ 部署完成！"
echo "   看板地址: http://${SERVER_IP}:3000"
echo "   管理后台: http://${SERVER_IP}:3000/admin"
echo "============================================"
