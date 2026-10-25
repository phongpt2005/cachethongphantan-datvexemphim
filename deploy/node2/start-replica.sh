#!/bin/bash
# ==============================================================================
# Script khởi động tự động toàn diện cho NODE 2 (Replica)
# Lưu ý: Chạy script này SAU KHI Node 1 (Master) đã sẵn sàng!
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=== [1/4] Khởi động các container Node 2 (Tự động clone dữ liệu qua VPN) ==="
docker compose up -d --build

echo "=== [2/4] Chờ Replica đồng bộ xong từ Master (15s)... ==="
sleep 15

echo "=== [3/4] Ghép cụm RabbitMQ Cluster với Node 1 ==="
docker exec rabbitmq-node2 rabbitmqctl stop_app || true
docker exec rabbitmq-node2 rabbitmqctl reset || true
docker exec rabbitmq-node2 rabbitmqctl join_cluster rabbit@rabbit-node1 || true
docker exec rabbitmq-node2 rabbitmqctl start_app || true
docker exec rabbitmq-node2 rabbitmqctl set_policy quorum-policy "^booking\." '{"queue-type":"quorum"}' --apply-to queues || true

echo "=== [4/4] Đăng ký vai trò Standby và kích hoạt Auto-Failover daemon (repmgrd) ==="
chmod +x start-repmgrd.sh
bash start-repmgrd.sh standby pg-inv-replica
bash start-repmgrd.sh standby pg-book-replica

echo ""
echo "🎉 [THÀNH CÔNG] NODE 2 (REPLICA) ĐÃ HOÀN TẤT GHÉP CỤM VÀ SẴN SÀNG!"
echo "   - API Gateway Node 2: http://10.0.0.2:3000"
echo "   - Deep Health Check:  http://10.0.0.2:3000/health/deep"
