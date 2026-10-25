#!/bin/bash
# ==============================================================================
# STEP 0: Đồng bộ giờ vật lý bằng Chrony NTP Daemon
# Chạy script này trên CẢ 2 MÁY VẬT LÝ VÀ WITNESS NODE (Ubuntu/Debian)
# ==============================================================================
set -e

echo "=== [1/4] Cập nhật repo và cài đặt Chrony ==="
sudo apt update
sudo apt install -y chrony curl

echo "=== [2/4] Cấu hình Pool NTP chuẩn quốc tế và sai số tối thiểu ==="
sudo tee /etc/chrony/chrony.conf > /dev/null <<EOF
# Máy chủ NTP chuẩn quốc tế có độ trễ cực thấp
server time.google.com iburst minpoll 4 maxpoll 4
server time.cloudflare.com iburst minpoll 4 maxpoll 4
server 0.asia.pool.ntp.org iburst
server 1.asia.pool.ntp.org iburst

# Cho phép bước nhảy đồng hồ tối đa 0.1s trong 3 lần cập nhật đầu tiên
makestep 0.1 3

# Lưu trữ trôi dạt tần số đồng hồ
driftfile /var/lib/chrony/chrony.drift

# Ghi log thống kê
logdir /var/log/chrony
maxupdateskew 100.0
rtcsync
EOF

echo "=== [3/4] Khởi động lại và bật chrony daemon ==="
sudo systemctl restart chrony
sudo systemctl enable chrony

echo "=== [4/4] Kiểm tra trạng thái đồng bộ giờ ==="
sleep 2
chronyc tracking
echo "--- Danh sách nguồn NTP đang kết nối: ---"
chronyc sources -v

echo ""
echo "✅ Hoàn tất cấu hình Chrony NTP! Độ lệch đồng hồ hệ thống đã được kiểm soát."
