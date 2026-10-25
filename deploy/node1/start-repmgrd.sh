#!/bin/bash
# Cách dùng: ./start-repmgrd.sh <master|standby|witness> <container_name>

NODE_ROLE=$1
CONTAINER=$2

if [ -z "$NODE_ROLE" ] || [ -z "$CONTAINER" ]; then
    echo "Lỗi: Cần truyền đủ tham số!"
    echo "Ví dụ: ./start-repmgrd.sh master pg-inv-master"
    exit 1
fi

echo "=== Đăng ký repmgr cho $CONTAINER (Vai trò: $NODE_ROLE) ==="

if [ "$NODE_ROLE" = "master" ]; then
    docker exec $CONTAINER bash -c "
        repmgr -f /etc/repmgr.conf master register --force 2>/dev/null || true
        echo '✅ Đăng ký thành công vai trò MASTER'
    "
elif [ "$NODE_ROLE" = "standby" ]; then
    docker exec $CONTAINER bash -c "
        repmgr -f /etc/repmgr.conf standby register --force 2>/dev/null || true
        echo '✅ Đăng ký thành công vai trò STANDBY'
    "
elif [ "$NODE_ROLE" = "witness" ]; then
    docker exec $CONTAINER bash -c "
        repmgr -f /etc/repmgr.conf witness register --force 2>/dev/null || true
        echo '✅ Đăng ký thành công vai trò WITNESS'
    "
fi

# Khởi chạy tiến trình nền repmgrd để tự động giám sát và promote
docker exec -d $CONTAINER bash -c "
    mkdir -p /var/log/repmgr
    repmgrd -f /etc/repmgr.conf --daemonize --pid-file /tmp/repmgrd.pid
    echo '🔥 Tiến trình repmgrd đã chạy nền — AUTO FAILOVER ĐÃ SẴN SÀNG!'
"

sleep 2
echo "=== Trạng thái cụm hiện tại ==="
docker exec $CONTAINER repmgr -f /etc/repmgr.conf cluster show
