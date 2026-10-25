#!/bin/bash
# ==============================================================================
# STEP 1: Hỗ trợ sinh cặp khóa (Keypair) và cấu hình nhanh WireGuard VPN
# Cách dùng: 
#   ./setup-wireguard.sh install          (Cài đặt wireguard & tools)
#   ./setup-wireguard.sh genkey           (Sinh private/public key cho máy hiện tại)
#   ./setup-wireguard.sh up               (Bật interface wg0)
#   ./setup-wireguard.sh status           (Kiểm tra wg show & ping các node)
# ==============================================================================
set -e

ACTION=${1:-status}

case "$ACTION" in
  install)
    echo "=== Cài đặt WireGuard và WireGuard Tools ==="
    sudo apt update
    sudo apt install -y wireguard wireguard-tools iptables
    echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
    sudo sysctl -p
    echo "✅ Cài đặt WireGuard hoàn tất."
    ;;

  genkey)
    echo "=== Sinh cặp khóa WireGuard ==="
    mkdir -p ~/.wireguard
    chmod 700 ~/.wireguard
    wg genkey | tee ~/.wireguard/privatekey | wg pubkey > ~/.wireguard/publickey
    echo ""
    echo "🔑 Private Key (Giữ bí mật, điền vào wg0.conf của máy này):"
    cat ~/.wireguard/privatekey
    echo ""
    echo "🌐 Public Key (Gửi cho các node khác để thêm vào mục [Peer]):"
    cat ~/.wireguard/publickey
    echo ""
    ;;

  up)
    echo "=== Khởi động Interface wg0 ==="
    sudo wg-quick up wg0 || echo "wg0 có thể đã đang chạy."
    sudo systemctl enable wg-quick@wg0
    sudo wg show
    ;;

  down)
    echo "=== Tắt Interface wg0 ==="
    sudo wg-quick down wg0
    ;;

  status)
    echo "=== Trạng thái kết nối WireGuard ==="
    sudo wg show || echo "Chưa bật wg0"
    echo ""
    echo "=== Ping kiểm tra thông mạng 3 Node ==="
    for ip in 10.0.0.1 10.0.0.2 10.0.0.3; do
      echo -n "Ping tới $ip: "
      ping -c 2 -W 2 "$ip" > /dev/null 2>&1 && echo "✅ THÀNH CÔNG" || echo "❌ KHÔNG PHẢN HỒI"
    done
    ;;

  *)
    echo "Cách dùng: $0 {install|genkey|up|down|status}"
    exit 1
    ;;
esac
