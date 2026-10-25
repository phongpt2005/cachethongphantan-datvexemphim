#!/bin/bash
# ==============================================================================
# Script khởi động tự động toàn diện cho NODE 1 (Master)
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=== [1/4] Khởi động toàn bộ container Node 1 ==="
docker compose up -d --build

echo "=== [2/4] Chờ cơ sở dữ liệu Master khởi động (15s)... ==="
sleep 15

echo "=== [3/4] Tạo Physical Replication Slots cho Inventory và Booking ==="
docker exec pg-inv-master psql -U postgres -c "SELECT pg_create_physical_replication_slot('inv_replica_slot');" || true
docker exec pg-book-master psql -U postgres -c "SELECT pg_create_physical_replication_slot('book_replica_slot');" || true

echo "=== [4/4] Đăng ký Master và kích hoạt Auto-Failover daemon (repmgrd) ==="
chmod +x start-repmgrd.sh
bash start-repmgrd.sh master pg-inv-master
bash start-repmgrd.sh master pg-book-master

echo ""
echo "🎉 [THÀNH CÔNG] NODE 1 (MASTER) ĐÃ SẴN SÀNG PHỤC VỤ!"
echo "   - Frontend Load Balancer: http://10.0.0.1:80 (hoặc http://localhost:80)"
echo "   - API Gateway Node 1:     http://10.0.0.1:3000"
echo "   - Deep Health Check:      http://10.0.0.1:3000/health/deep"
