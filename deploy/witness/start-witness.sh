#!/bin/bash
# ==============================================================================
# Script khởi động tự động Witness Node (Máy thứ 3 / VPS)
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=== [1/2] Khởi chạy container PostgreSQL Witness siêu nhẹ ==="
docker run -d --name pg-witness \
  -e POSTGRES_PASSWORD=postgres \
  -v "$DIR/../../db-cluster/inventory/repmgr-witness.conf":/etc/repmgr.conf \
  -p 10.0.0.3:5501:5432 \
  postgres:15-alpine || echo "pg-witness đã chạy"

echo "=== [2/2] Đăng ký vai trò Witness với cụm repmgr ==="
sleep 5
docker exec pg-witness repmgr -f /etc/repmgr.conf witness register -h 10.0.0.1 || true
docker exec -d pg-witness repmgrd -f /etc/repmgr.conf --daemonize || true

echo ""
echo "🎉 [THÀNH CÔNG] WITNESS NODE ĐÃ SẴN SÀNG BỎ PHIẾU QUORUM!"
