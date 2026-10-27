# -*- coding: utf-8 -*-
"""
Bộ sinh sơ đồ kiến trúc phân tán chuẩn kỹ thuật (Engineering Diagrams - Draw.io / Visio Style)
- Tông màu tự nhiên, tối giản chuẩn bản vẽ kỹ thuật doanh nghiệp / đồ án kỹ sư.
- Không sử dụng màu kẹo pastel AI (loại bỏ hoàn toàn các mảng màu hồng, tím, xanh neon, vàng rực).
- Hầu hết các khối hộp dùng nền trắng (#ffffff) viền nét đơn (#334155, #64748b), chỉ dùng màu nhấn đậm (deep blue #1e40af, dark red #991b1b, forest green #166534) cho viền và tiêu đề để phân biệt vai trò.
- Loại bỏ toàn bộ emoji AI (✅, ❌, ⏳, ⚠️). Thay bằng ký hiệu kỹ thuật chuẩn ([OK], [LỖI], [CHỜ], [THÀNH CÔNG]).
- Không có hộp chú thích xám ở góc trên phải.
- Xuất file PNG vào thư mục diagrams/ của repo (thư mục này CHỈ chứa ảnh .png).
"""

import os
import subprocess
import time
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(TOOLS_DIR)), "diagrams")
EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

os.makedirs(OUTPUT_IMAGE_DIR, exist_ok=True)
os.makedirs(TOOLS_DIR, exist_ok=True)

HTML_SHELL = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #ffffff;
    color: #0f172a;
    font-family: Arial, Helvetica, sans-serif;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .header {
    width: 100%;
    max-width: 1520px;
    border-bottom: 2px solid #1e293b;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .header h1 {
    font-size: 19px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.2px;
    margin-bottom: 2px;
  }
  .header p {
    font-size: 12.5px;
    color: #475569;
  }
  .canvas {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    padding: 10px;
    width: 100%;
    max-width: 1520px;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
</style>
</head>
<body>
<div class="header">
  <h1>__TITLE__</h1>
  <p>__SUBTITLE__</p>
</div>
<div class="canvas">
__SVG__
</div>
</body>
</html>
"""

# ==============================================================================
# SƠ ĐỒ 1: TỔNG THỂ KIẾN TRÚC HỆ THỐNG PHÂN TÁN 2 MÁY VẬT LÝ
# ==============================================================================
svg_01 = """
<svg viewBox="0 0 1480 840" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="m-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
    </marker>
    <marker id="m-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e40af" />
    </marker>
    <marker id="m-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#166534" />
    </marker>
  </defs>

  <!-- Client Layer -->
  <rect x="540" y="10" width="400" height="50" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">CLIENTS / TRÌNH DUYỆT / KỊCH BẢN KIỂM THỬ</text>
  <text x="740" y="48" fill="#475569" font-size="11" text-anchor="middle">Một địa chỉ duy nhất: http://192.168.43.13:8090 (trong suốt)</text>

  <!-- Line Client -> Nginx LB -->
  <line x1="740" y1="60" x2="740" y2="95" stroke="#1e293b" stroke-width="1.5" marker-end="url(#m-arr)" />
  <text x="750" y="82" fill="#1e293b" font-size="11" font-weight="bold">HTTP :8090</text>

  <!-- Frontend LB -->
  <rect x="420" y="95" width="640" height="70" fill="#ffffff" stroke="#1e40af" stroke-width="2" />
  <text x="740" y="118" fill="#1e40af" font-size="13" font-weight="bold" text-anchor="middle">FRONTEND LOAD BALANCER (Nginx) — chạy trên NODE 3</text>
  <text x="740" y="136" fill="#0f172a" font-size="11" text-anchor="middle">Cơ chế bảo vệ: Rate Limiting 200 req/s (burst=100) — Máy lỗi (timeout / 503) tự bị né</text>
  <text x="740" y="153" fill="#475569" font-size="11" text-anchor="middle">Thuật toán phân phối: round-robin | Máy 1 (192.168.43.11:3000) | Máy 2 (192.168.43.12:3100)</text>

  <!-- mạng LAN Banner -->
  <rect x="20" y="185" width="1440" height="30" fill="#ffffff" stroke="#1e40af" stroke-dasharray="6,3" stroke-width="1.2" />
  <text x="740" y="205" fill="#1e40af" font-size="11.5" font-weight="bold" text-anchor="middle">MẠNG LAN NỘI BỘ (WI-FI / HOTSPOT 192.168.43.0/24) — KẾT NỐI 3 MÁY TRONG CÙNG PHÒNG</text>

  <!-- Routing Lines to Gateways -->
  <path d="M 590 165 L 590 185 L 280 185 L 280 235" fill="none" stroke="#1e40af" stroke-width="1.5" marker-end="url(#m-blue)" />
  <path d="M 890 165 L 890 185 L 1200 185 L 1200 235" fill="none" stroke="#1e40af" stroke-width="1.5" marker-end="url(#m-blue)" />

  <!-- ==================== NODE 1 ==================== -->
  <rect x="20" y="235" width="560" height="585" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="20" y="235" width="560" height="30" fill="#1e293b" />
  <text x="35" y="255" fill="#ffffff" font-size="12" font-weight="bold">MÁY VẬT LÝ 1 — PRIMARY NODE (IP: 192.168.43.11)</text>

  <!-- Node 1: API Gateway -->
  <rect x="40" y="280" width="520" height="45" fill="#ffffff" stroke="#334155" stroke-width="1.2" />
  <text x="300" y="300" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">api-gateway #1 (:3000)</text>
  <text x="300" y="316" fill="#475569" font-size="10.5" text-anchor="middle">NestJS REST Facade | Circuit Breaker (CLOSED / OPEN) | Retry Exponential Backoff</text>

  <!-- Node 1: Booking LB & Inventory -->
  <rect x="40" y="340" width="250" height="50" fill="#ffffff" stroke="#475569" />
  <text x="165" y="362" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">booking-lb #1 (Nginx :50051)</text>
  <text x="165" y="378" fill="#475569" font-size="10" text-anchor="middle">gRPC Round-Robin -> N instance</text>

  <rect x="310" y="340" width="250" height="50" fill="#ffffff" stroke="#475569" />
  <text x="435" y="362" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">inventory-service #1 (:50052)</text>
  <text x="435" y="378" fill="#475569" font-size="10" text-anchor="middle">Kiểm soát đồng thời: Pessimistic &amp; Optimistic</text>

  <!-- Node 1: Booking Instances -->
  <rect x="40" y="405" width="120" height="40" fill="#ffffff" stroke="#64748b" />
  <text x="100" y="425" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">booking-svc #1a</text>
  <text x="100" y="438" fill="#475569" font-size="9" text-anchor="middle">Port 50051</text>

  <rect x="170" y="405" width="120" height="40" fill="#ffffff" stroke="#64748b" />
  <text x="230" y="425" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">booking-svc #1b</text>
  <text x="230" y="438" fill="#475569" font-size="9" text-anchor="middle">Port 50051</text>

  <!-- Node 1: RabbitMQ -->
  <rect x="310" y="405" width="250" height="40" fill="#ffffff" stroke="#1e293b" />
  <text x="435" y="425" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">RabbitMQ #1 (Raft — nút 1/3)</text>
  <text x="435" y="438" fill="#475569" font-size="9.5" text-anchor="middle">Quorum Queue 'booking.confirmed' (Raft)</text>

  <!-- Node 1: Notification & Redis -->
  <rect x="40" y="460" width="250" height="40" fill="#ffffff" stroke="#475569" />
  <text x="165" y="480" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">notification-service #1</text>
  <text x="165" y="493" fill="#475569" font-size="9" text-anchor="middle">Worker xử lý gửi email hoá đơn</text>

  <rect x="310" y="460" width="250" height="40" fill="#ffffff" stroke="#1e40af" stroke-width="1.5" />
  <text x="435" y="480" fill="#1e40af" font-size="11" font-weight="bold" text-anchor="middle">Redis #1 (MASTER :6379)</text>
  <text x="435" y="493" fill="#475569" font-size="9" text-anchor="middle">Nhận ghi và phát lệnh xoá cache (DEL)</text>

  <!-- Node 1: Databases -->
  <rect x="40" y="515" width="250" height="75" fill="#ffffff" stroke="#1e40af" stroke-width="1.8" />
  <text x="165" y="538" fill="#1e40af" font-size="11.5" font-weight="bold" text-anchor="middle">booking_db (Master :5502)</text>
  <text x="165" y="556" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">PRIMARY (READ / WRITE)</text>
  <text x="165" y="574" fill="#475569" font-size="9.5" text-anchor="middle">repmgrd node_id=1 (priority=100)</text>

  <rect x="310" y="515" width="250" height="75" fill="#ffffff" stroke="#1e40af" stroke-width="1.8" />
  <text x="435" y="538" fill="#1e40af" font-size="11.5" font-weight="bold" text-anchor="middle">inventory_db (Master :5501)</text>
  <text x="435" y="556" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">PRIMARY (READ / WRITE)</text>
  <text x="435" y="574" fill="#475569" font-size="9.5" text-anchor="middle">repmgrd node_id=1 (priority=100)</text>

  <rect x="40" y="605" width="520" height="35" fill="#ffffff" stroke="#94a3b8" />
  <text x="300" y="627" fill="#0f172a" font-size="10.5" text-anchor="middle">Vai trò: Ghi vé | Phát WAL sang Máy 2 | Mất quorum (chỉ thấy 1/3) → tự chặn ghi</text>


  <!-- ==================== NODE 3: WITNESS ==================== -->
  <rect x="610" y="380" width="260" height="190" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,2" />
  <rect x="610" y="380" width="260" height="28" fill="#334155" />
  <text x="740" y="399" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">NODE 3: TRỌNG TÀI (WITNESS)</text>
  <text x="740" y="425" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">Witness ×2 + RabbitMQ #3 (IP: 192.168.43.13)</text>
  <text x="740" y="445" fill="#475569" font-size="10" text-anchor="middle">Laptop thứ ba, cùng mạng LAN</text>
  <text x="740" y="463" fill="#0f172a" font-size="10.5" text-anchor="middle">• Bỏ phiếu đa số 2/3 + phủ quyết</text>
  <text x="740" y="508" fill="#991b1b" font-size="10.5" font-weight="bold" text-anchor="middle">CHỐNG NÃO CHIA CẮT (SPLIT-BRAIN)</text>
  <text x="740" y="527" fill="#475569" font-size="9.5" text-anchor="middle">Không chứa dữ liệu · priority 0 (không làm Master)</text>


  <!-- ==================== NODE 2 ==================== -->
  <rect x="900" y="235" width="560" height="585" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="900" y="235" width="560" height="30" fill="#1e293b" />
  <text x="915" y="255" fill="#ffffff" font-size="12" font-weight="bold">MÁY VẬT LÝ 2 — SECONDARY NODE (IP: 192.168.43.12)</text>

  <!-- Node 2: API Gateway -->
  <rect x="920" y="280" width="520" height="45" fill="#ffffff" stroke="#334155" stroke-width="1.2" />
  <text x="1180" y="300" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">api-gateway #2 (:3000)</text>
  <text x="1180" y="316" fill="#475569" font-size="10.5" text-anchor="middle">NestJS REST Facade | Circuit Breaker (CLOSED / OPEN) | Retry Exponential Backoff</text>

  <!-- Node 2: Booking LB & Inventory -->
  <rect x="920" y="340" width="250" height="50" fill="#ffffff" stroke="#475569" />
  <text x="1045" y="362" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">booking-lb #2 (Nginx :50051)</text>
  <text x="1045" y="378" fill="#475569" font-size="10" text-anchor="middle">gRPC Pass -> booking-service #2</text>

  <rect x="1190" y="340" width="250" height="50" fill="#ffffff" stroke="#475569" />
  <text x="1315" y="362" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">inventory-service #2 (:50052)</text>
  <text x="1315" y="378" fill="#475569" font-size="10" text-anchor="middle">Đọc Standby local, Ghi → Primary hiện tại (pg-router)</text>

  <!-- Node 2: Booking Instance -->
  <rect x="920" y="405" width="250" height="40" fill="#ffffff" stroke="#64748b" />
  <text x="1045" y="425" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">booking-service #2a</text>
  <text x="1045" y="438" fill="#475569" font-size="9" text-anchor="middle">gRPC Port 50051</text>

  <!-- Node 2: RabbitMQ -->
  <rect x="1190" y="405" width="250" height="40" fill="#ffffff" stroke="#1e293b" />
  <text x="1315" y="425" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">RabbitMQ #2 (Raft — nút 2/3)</text>
  <text x="1315" y="438" fill="#475569" font-size="9.5" text-anchor="middle">Quorum Queue 'booking.confirmed' (Raft)</text>

  <!-- Node 2: Notification & Redis -->
  <rect x="920" y="460" width="250" height="40" fill="#ffffff" stroke="#475569" />
  <text x="1045" y="480" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">notification-service #2</text>
  <text x="1045" y="493" fill="#475569" font-size="9" text-anchor="middle">Tiêu thụ bù nếu worker máy 1 bị sập</text>

  <rect x="1190" y="460" width="250" height="40" fill="#ffffff" stroke="#475569" stroke-width="1.5" />
  <text x="1315" y="480" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">Redis #2 (REPLICA :6379)</text>
  <text x="1315" y="493" fill="#475569" font-size="9" text-anchor="middle">replicaof 192.168.43.11 6379 (Phục vụ đọc RAM tại chỗ)</text>

  <!-- Node 2: Databases -->
  <rect x="920" y="515" width="250" height="75" fill="#ffffff" stroke="#475569" stroke-width="1.5" />
  <text x="1045" y="538" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">booking_db (Standby :5502)</text>
  <text x="1045" y="556" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">STANDBY (READ-ONLY)</text>
  <text x="1045" y="574" fill="#475569" font-size="9.5" text-anchor="middle">repmgrd node_id=2 (priority=90)</text>

  <rect x="1190" y="515" width="250" height="75" fill="#ffffff" stroke="#475569" stroke-width="1.5" />
  <text x="1315" y="538" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">inventory_db (Standby :5501)</text>
  <text x="1315" y="556" fill="#0f172a" font-size="10.5" font-weight="bold" text-anchor="middle">STANDBY (READ-ONLY)</text>
  <text x="1315" y="574" fill="#475569" font-size="9.5" text-anchor="middle">repmgrd node_id=2 (priority=90)</text>

  <rect x="920" y="605" width="520" height="35" fill="#ffffff" stroke="#94a3b8" />
  <text x="1180" y="627" fill="#0f172a" font-size="10.5" text-anchor="middle">Vai trò: Phục vụ đọc | Nhận WAL | Tự lên Primary khi đủ 2/3 phiếu (cùng Node 3)</text>

  <!-- Cross-node Synchronization Lines -->
  <line x1="560" y1="550" x2="920" y2="550" stroke="#166534" stroke-width="1.8" stroke-dasharray="5,3" marker-end="url(#m-green)" />
  <rect x="650" y="538" width="180" height="20" fill="#ffffff" stroke="#166534" />
  <text x="740" y="552" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">WAL Streaming ×2 (mỗi CSDL)</text>

  <path d="M 560 480 L 905 480 L 905 452 L 1180 452 L 1180 480 L 1188 480" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#m-arr)" />
  <rect x="650" y="470" width="180" height="20" fill="#ffffff" stroke="#1e293b" />
  <text x="740" y="484" fill="#0f172a" font-size="10" font-weight="bold" text-anchor="middle">Redis DEL Replication Stream</text>

  <!-- Bottom Explanatory Row -->
  <rect x="20" y="740" width="1440" height="85" fill="#ffffff" stroke="#cbd5e1" />
  <text x="40" y="763" fill="#0f172a" font-size="11.5" font-weight="bold">ĐẶC TÍNH CỐT LÕI CỦA HỆ THỐNG PHÂN TÁN ĐÃ HIỆN THỰC HOÁ:</text>
  <text x="40" y="783" fill="#334155" font-size="11">1. Tính trong suốt (Transparency): Client chỉ gọi 1 địa chỉ (Frontend LB trên Node 3), Nginx tự điều phối và né máy lỗi.</text>
  <text x="40" y="801" fill="#334155" font-size="11">2. Sẵn sàng cao + chống split-brain: Máy 1 sập → Máy 2 + Node 3 (2/3 phiếu) tự failover ~20 s; máy bị cô lập tự chặn ghi, nối lại tự về Standby.</text>
  <text x="40" y="819" fill="#334155" font-size="11">3. Mở rộng & chịu lỗi: Đọc tại chỗ ở mỗi máy, ghi về Primary; RabbitMQ quorum queue 3 nút chịu được chết 1 nút.</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 2: AUTO-FAILOVER KHI MASTER SẬP & CƠ CHẾ QUORUM CHỐNG SPLIT-BRAIN
# ==============================================================================
svg_02 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <!-- Formula Banner -->
  <rect x="350" y="10" width="780" height="40" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="12.5" font-weight="bold" text-anchor="middle">ĐỒNG THUẬN QUORUM 3 NODES: Quorum = ⌊N/2⌋ + 1 = ⌊3/2⌋ + 1 = 2 PHIẾU BẦU</text>

  <!-- Left: Network Partition (Split-brain prevention) -->
  <rect x="20" y="65" width="710" height="735" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <rect x="20" y="65" width="710" height="30" fill="#334155" />
  <text x="35" y="85" fill="#ffffff" font-size="12" font-weight="bold">TÌNH HUỐNG 1: ĐỨT MẠNG LAN (MÁY 1 VẪN SỐNG) — CHỐNG 2 MASTER (SPLIT-BRAIN)</text>

  <rect x="40" y="110" width="670" height="65" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="130" fill="#0f172a" font-size="11.5" font-weight="bold">1. Sự cố: Mạng mạng LAN giữa Máy 1 và Máy 2 bị ngắt đoạn</text>
  <text x="55" y="148" fill="#475569" font-size="11">• Máy 1 vẫn hoạt động bình thường, database master vẫn nhận ghi từ Client kết nối tới Máy 1.</text>
  <text x="55" y="164" fill="#475569" font-size="11">• Máy 2 bị mất tín hiệu ping tới 192.168.43.11:5501 (timeout sau 4 lần thử = 15 giây).</text>

  <rect x="40" y="190" width="670" height="130" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="212" fill="#0f172a" font-size="11.5" font-weight="bold">2. repmgrd trên Máy 2 kích hoạt quy trình hỏi Trọng tài (Witness):</text>
  <text x="70" y="232" fill="#0f172a" font-size="11">• Máy 2 KHÔNG ĐƯỢC TỰ Ý PROMOTE! Nó gửi truy vấn tới Witness: "Máy 1 còn sống không?"</text>
  <text x="70" y="252" fill="#0f172a" font-size="11">• Witness Node 3 (192.168.43.13) vẫn ping được Máy 1 bình thường và phản hồi: "Máy 1 VẪN SỐNG!"</text>
  <text x="70" y="272" fill="#991b1b" font-size="11.5" font-weight="bold">• Đếm phiếu của Máy 2: Chỉ có 1 phiếu (chính nó) &lt; 2 phiếu -&gt; THIẾU QUORUM!</text>
  <text x="70" y="292" fill="#166534" font-size="11">• Đếm phiếu của Máy 1: Máy 1 (1 phiếu) + Witness (1 phiếu) = 2/3 phiếu -&gt; ĐỦ QUORUM!</text>
  <text x="70" y="310" fill="#0f172a" font-size="11" font-weight="bold">-&gt; Quyết định: Máy 2 TỪ CHỐI THĂNG CẤP. Giữ nguyên chế độ Standby Read-Only.</text>

  <!-- Topology 1 -->
  <rect x="60" y="335" width="180" height="110" fill="#ffffff" stroke="#166534" stroke-width="1.5" />
  <text x="150" y="360" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">MÁY 1 (Primary)</text>
  <text x="150" y="380" fill="#0f172a" font-size="11" text-anchor="middle">Vẫn hoạt động</text>
  <text x="150" y="405" fill="#166534" font-size="11" font-weight="bold" text-anchor="middle">2/3 Phiếu Quorum</text>
  <text x="150" y="425" fill="#0f172a" font-size="10.5" text-anchor="middle">DUY TRÌ MASTER</text>

  <line x1="240" y1="390" x2="490" y2="390" stroke="#991b1b" stroke-width="2" stroke-dasharray="4,4" />
  <text x="365" y="383" fill="#991b1b" font-size="10.5" font-weight="bold" text-anchor="middle">ĐỨT KẾT NỐI MẠNG</text>

  <rect x="500" y="335" width="190" height="110" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <text x="595" y="360" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">MÁY 2 (Standby)</text>
  <text x="595" y="380" fill="#0f172a" font-size="11" text-anchor="middle">Mất kết nối tới Máy 1</text>
  <text x="595" y="405" fill="#991b1b" font-size="11" font-weight="bold" text-anchor="middle">1/3 Phiếu (Thiếu Quorum)</text>
  <text x="595" y="425" fill="#475569" font-size="10.5" font-weight="bold" text-anchor="middle">TỪ CHỐI THĂNG CẤP</text>

  <rect x="280" y="455" width="170" height="60" fill="#ffffff" stroke="#1e293b" stroke-dasharray="3,2" />
  <text x="365" y="475" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">WITNESS NODE 3</text>
  <text x="365" y="492" fill="#475569" font-size="10" text-anchor="middle">Trạng thái Máy 1: Bình thường</text>
  <text x="365" y="506" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">Bỏ phiếu cho Máy 1</text>

  <rect x="40" y="535" width="670" height="240" fill="#ffffff" stroke="#cbd5e1" />
  <text x="55" y="560" fill="#0f172a" font-size="12" font-weight="bold">3. Kết quả bảo toàn hệ thống:</text>
  <text x="70" y="585" fill="#0f172a" font-size="11">• Triệt tiêu hoàn toàn rủi ro Split-Brain: Không bao giờ xảy ra tình trạng 2 Master cùng ghi.</text>
  <text x="70" y="605" fill="#0f172a" font-size="11">• Dữ liệu vé xem phim không bị xung đột, không bị ghi đè, không làm hỏng cơ sở dữ liệu.</text>
  <text x="70" y="625" fill="#166534" font-size="11" font-weight="bold">• Khi có mạng trở lại: Máy 2 tiếp tục nhận Replay WAL từ Máy 1 bình thường mà không cần merge tay.</text>


  <!-- Right: Node 1 Crashes -->
  <rect x="750" y="65" width="710" height="735" fill="#ffffff" stroke="#166534" stroke-width="1.8" />
  <rect x="750" y="65" width="710" height="30" fill="#166534" />
  <text x="765" y="85" fill="#ffffff" font-size="12" font-weight="bold">TÌNH HUỐNG 2: MÁY CHỦ 1 SẬP HOÀN TOÀN — TỰ ĐỘNG THĂNG CẤP MÁY 2 (AUTO-FAILOVER)</text>

  <rect x="770" y="110" width="670" height="65" fill="#ffffff" stroke="#991b1b" />
  <text x="785" y="130" fill="#991b1b" font-size="11.5" font-weight="bold">1. Sự cố: Máy 1 bị sập nguồn / hỏng phần cứng / kernel panic</text>
  <text x="785" y="148" fill="#475569" font-size="11">• Cả Máy 2 và Witness Node 3 đều mất kết nối tới Máy 1 (timeout ping 15s).</text>
  <text x="785" y="164" fill="#475569" font-size="11">• Cụm chỉ còn 2 thành viên hoạt động: Máy 2 và Witness Node 3.</text>

  <rect x="770" y="190" width="670" height="130" fill="#ffffff" stroke="#64748b" />
  <text x="785" y="212" fill="#0f172a" font-size="11.5" font-weight="bold">2. Quy trình bỏ phiếu đồng thuận và tự thăng cấp:</text>
  <text x="800" y="232" fill="#0f172a" font-size="11">• Máy 2 hỏi Witness Node 3: "Có phát hiện tín hiệu Máy 1 không?"</text>
  <text x="800" y="252" fill="#0f172a" font-size="11">• Witness Node 3 kiểm tra độc lập và xác nhận: "Máy 1 đã mất tín hiệu hoàn toàn!"</text>
  <text x="800" y="272" fill="#166534" font-size="11.5" font-weight="bold">• Đếm phiếu Quorum: Máy 2 (1 phiếu) + Witness (1 phiếu) = 2/3 phiếu -&gt; ĐỦ ĐA SỐ!</text>
  <text x="800" y="292" fill="#166534" font-size="11.5" font-weight="bold">• repmgrd trên Máy 2 tự chạy lệnh nội bộ: repmgr standby promote -f /etc/repmgr.conf</text>
  <text x="800" y="310" fill="#166534" font-size="11" font-weight="bold">-&gt; Database PostgreSQL Máy 2 chuyển sang PRIMARY (READ/WRITE) trong &lt; 20 giây!</text>

  <!-- Topology 2 -->
  <rect x="790" y="335" width="180" height="110" fill="#ffffff" stroke="#991b1b" stroke-dasharray="4,4" />
  <text x="880" y="360" fill="#991b1b" font-size="12" font-weight="bold" text-anchor="middle">MÁY 1 (Sập nguồn)</text>
  <text x="880" y="380" fill="#475569" font-size="11" text-anchor="middle">Mất kết nối / Offline</text>
  <text x="880" y="405" fill="#991b1b" font-size="11" font-weight="bold" text-anchor="middle">0 Phiếu</text>
  <text x="880" y="425" fill="#475569" font-size="10.5" text-anchor="middle">KHÔNG HOẠT ĐỘNG</text>

  <rect x="1010" y="455" width="180" height="60" fill="#ffffff" stroke="#1e293b" stroke-dasharray="3,2" />
  <text x="1100" y="475" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">WITNESS NODE 3</text>
  <text x="1100" y="492" fill="#475569" font-size="10" text-anchor="middle">Xác nhận Máy 1 không phản hồi</text>
  <text x="1100" y="506" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">Bỏ phiếu cho Máy 2</text>

  <rect x="1230" y="335" width="190" height="110" fill="#ffffff" stroke="#166534" stroke-width="1.8" />
  <text x="1325" y="360" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">MÁY 2 (Thăng cấp)</text>
  <text x="1325" y="380" fill="#0f172a" font-size="11" text-anchor="middle">Tự động Promote</text>
  <text x="1325" y="405" fill="#166534" font-size="11" font-weight="bold" text-anchor="middle">2/3 Phiếu (Đủ Quorum)</text>
  <text x="1325" y="425" fill="#166534" font-size="11" font-weight="bold" text-anchor="middle">PRIMARY MỚI</text>

  <rect x="770" y="535" width="670" height="240" fill="#ffffff" stroke="#cbd5e1" />
  <text x="785" y="560" fill="#0f172a" font-size="12" font-weight="bold">3. Dòng chảy dịch vụ tiếp tục mà không gián đoạn:</text>
  <text x="800" y="585" fill="#0f172a" font-size="11">• Nginx Frontend LB tự phát hiện Máy 1 timeout -&gt; Chuyển toàn bộ request sang Máy 2.</text>
  <text x="800" y="605" fill="#0f172a" font-size="11">• inventory-service và booking-service trên Máy 2 ghi thẳng vào Database local (đã thành Primary).</text>
  <text x="800" y="625" fill="#166534" font-size="11" font-weight="bold">• Khách hàng tiếp tục đặt vé bình thường mà không cần kỹ sư gõ bất kỳ câu lệnh nào!</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 3: XỬ LÝ KHI DB MASTER BỊ NGHẼN / QUÁ TẢI (READ/WRITE SPLIT + CACHE)
# ==============================================================================
svg_03 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <!-- Header Problem -->
  <rect x="250" y="10" width="980" height="50" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">BÀI TOÁN: XỬ LÝ KHI DB MASTER BỊ QUÁ TẢI / GIẢM HIỆU NĂNG DO QUÁ NHIỀU REQUEST</text>
  <text x="740" y="48" fill="#475569" font-size="11" text-anchor="middle">Giải pháp: Tách luồng Read/Write Splitting sang DB Standby + Bộ nhớ đệm Redis Cache-Aside tại RAM</text>

  <!-- Left: Cache Tier -->
  <rect x="20" y="75" width="710" height="725" fill="#ffffff" stroke="#1e40af" stroke-width="1.8" />
  <rect x="20" y="75" width="710" height="30" fill="#1e40af" />
  <text x="35" y="95" fill="#ffffff" font-size="12" font-weight="bold">LỚP 1: BỘ NHỚ ĐỆM RAM (REDIS CACHE-ASIDE) — GIẢM 85-90% TẢI CHO DATABASE</text>

  <rect x="40" y="120" width="670" height="80" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="142" fill="#0f172a" font-size="11.5" font-weight="bold">1. Khách gửi yêu cầu: GET /movies/1 (Xem danh sách ghế của rạp)</text>
  <text x="55" y="162" fill="#475569" font-size="11">• Trong rạp chiếu phim, 85% hành vi người dùng là XEM LỊCH &amp; XEM GHẾ (Read-Heavy).</text>
  <text x="55" y="180" fill="#475569" font-size="11">• inventory-service kiểm tra cache: const cached = await this.redisRead.get('seats:1')</text>

  <rect x="40" y="215" width="320" height="135" fill="#ffffff" stroke="#166534" stroke-width="1.5" />
  <text x="200" y="240" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">[CACHE HIT] (85% LƯỢT GỌI)</text>
  <text x="200" y="265" fill="#0f172a" font-size="11" text-anchor="middle">Dữ liệu ghế đã có sẵn trong Redis RAM</text>
  <text x="200" y="288" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">PHẢN HỒI: &lt; 1 ms</text>
  <text x="200" y="310" fill="#475569" font-size="10.5" text-anchor="middle">Trả về mảng JSON ghế ngay cho Client</text>
  <text x="200" y="330" fill="#166534" font-size="10.5" font-weight="bold" text-anchor="middle">HOÀN TOÀN KHÔNG CHẠM VÀO DATABASE</text>

  <rect x="380" y="215" width="330" height="135" fill="#ffffff" stroke="#64748b" stroke-width="1.5" />
  <text x="545" y="240" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">[CACHE MISS] (15% LƯỢT GỌI)</text>
  <text x="545" y="265" fill="#0f172a" font-size="11" text-anchor="middle">Lần đầu xem hoặc vừa có người mua vé</text>
  <text x="545" y="288" fill="#475569" font-size="11" text-anchor="middle">Truy vấn xuống Database Standby (local)</text>
  <text x="545" y="310" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">Ghi nạp lại vào Redis (TTL 15 giây)</text>
  <text x="545" y="330" fill="#475569" font-size="10" text-anchor="middle">await redisWrite.setex('seats:1', 15, data)</text>

  <rect x="40" y="365" width="670" height="140" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="388" fill="#0f172a" font-size="11.5" font-weight="bold">2. Phân phối tải trên cụm Redis Master-Replica qua mạng LAN:</text>
  <text x="70" y="408" fill="#475569" font-size="11">• Tiến trình trên Máy 1 đọc từ Redis Master local (192.168.43.11:6379).</text>
  <text x="70" y="426" fill="#475569" font-size="11">• Tiến trình trên Máy 2 đọc từ Redis Replica local (192.168.43.12:6379).</text>
  <text x="70" y="446" fill="#166534" font-size="11" font-weight="bold">• Khi có người đặt vé: Chỉ gửi lệnh DEL xoá cache về Redis Master.</text>
  <text x="70" y="464" fill="#0f172a" font-size="11">• Redis Master tự stream replication sang Redis Replica của Máy 2 trong &lt; 5ms.</text>
  <text x="70" y="484" fill="#0f172a" font-size="11" font-weight="bold">-&gt; Cả 2 máy đọc bộ nhớ đệm tại chỗ, không làm nghẽn đường truyền mạng WAN!</text>

  <rect x="40" y="520" width="670" height="255" fill="#ffffff" stroke="#cbd5e1" />
  <text x="55" y="545" fill="#166534" font-size="12" font-weight="bold">KẾT QUẢ ĐẠT ĐƯỢC:</text>
  <text x="70" y="570" fill="#0f172a" font-size="11">• Database Master được giải phóng hoàn toàn khỏi các truy vấn đọc lặp đi lặp lại.</text>
  <text x="70" y="590" fill="#0f172a" font-size="11">• Thời gian phản hồi trang xem phim giảm từ 45ms xuống còn dưới 1ms.</text>
  <text x="70" y="610" fill="#0f172a" font-size="11">• Chịu được tải đọc lên tới hàng chục ngàn lượt xem ghế mỗi giây mà không tăng CPU.</text>
  <text x="70" y="630" fill="#166534" font-size="11" font-weight="bold">• Dù nhiều người cùng tải lại trang, Database vẫn giữ 100% tài nguyên cho việc ghi vé.</text>


  <!-- Right: DB R/W Splitting -->
  <rect x="750" y="75" width="710" height="725" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="750" y="75" width="710" height="30" fill="#1e293b" />
  <text x="765" y="95" fill="#ffffff" font-size="12" font-weight="bold">LỚP 2: TÁCH LUỒNG ĐỌC/GHI (READ/WRITE SPLITTING) TRÊN DATABASE</text>

  <rect x="770" y="120" width="670" height="80" fill="#ffffff" stroke="#64748b" />
  <text x="785" y="142" fill="#0f172a" font-size="11.5" font-weight="bold">1. Nguyên tắc thiết kế TypeORM Multi-Connection:</text>
  <text x="785" y="162" fill="#475569" font-size="11">• Connection 'default' (Master): Dành riêng cho INSERT, UPDATE, DELETE và SELECT FOR UPDATE.</text>
  <text x="785" y="180" fill="#475569" font-size="11">• Connection 'replica' (Standby): Dành riêng cho toàn bộ câu lệnh SELECT tra cứu thông thường.</text>

  <rect x="770" y="215" width="670" height="135" fill="#ffffff" stroke="#475569" stroke-width="1.5" />
  <text x="785" y="240" fill="#0f172a" font-size="12" font-weight="bold">LUỒNG ĐỌC (READ PATH — 85% LƯU LƯỢNG):</text>
  <text x="800" y="265" fill="#0f172a" font-size="11">• listSeats(), getShowtime() sử dụng seatReadRepo và showtimeReadRepo.</text>
  <text x="800" y="285" fill="#0f172a" font-size="11" font-weight="bold">• Điều hướng trực tiếp sang PostgreSQL Standby trên Máy 2 (192.168.43.12:5501).</text>
  <text x="800" y="305" fill="#475569" font-size="11">• Database Master tại Máy 1 hoàn toàn không phải tốn chu kỳ CPU nào để xử lý đọc.</text>
  <text x="800" y="325" fill="#166534" font-size="11" font-weight="bold">-&gt; Tận dụng tối đa tài nguyên RAM và SSD của máy chủ phụ (Node 2)!</text>

  <rect x="770" y="365" width="670" height="140" fill="#ffffff" stroke="#1e40af" stroke-width="1.5" />
  <text x="785" y="390" fill="#1e40af" font-size="12" font-weight="bold">LUỒNG GHI (WRITE PATH — 15% LƯU LƯỢNG):</text>
  <text x="800" y="415" fill="#0f172a" font-size="11">• Khi khách đặt vé: reserveSeat() và createBooking() dùng masterDataSource.</text>
  <text x="800" y="435" fill="#1e40af" font-size="11" font-weight="bold">• Thực hiện khoá dòng SELECT ... FOR UPDATE và INSERT trong 1 Transaction trên Master.</text>
  <text x="800" y="455" fill="#475569" font-size="11">• WAL Streaming Replication tự sao chép sang Máy 2 trong chế độ nền.</text>
  <text x="800" y="475" fill="#166534" font-size="11" font-weight="bold">-&gt; DB Master chỉ phục vụ ghi vé nên không bị nghẽn I/O disk!</text>

  <rect x="770" y="520" width="670" height="255" fill="#ffffff" stroke="#cbd5e1" />
  <text x="785" y="545" fill="#0f172a" font-size="12" font-weight="bold">HIỆU QUẢ KHI PHỐI HỢP CẢ 2 LỚP:</text>
  <text x="800" y="570" fill="#0f172a" font-size="11">• Tổng 10.000 requests/s -&gt; Nginx Rate Limiter lọc còn ~150 requests/s.</text>
  <text x="800" y="590" fill="#0f172a" font-size="11">• Trong 150 req/s hợp lệ: ~125 lượt đọc ghế được Redis Cache trả về ngay trong 1ms.</text>
  <text x="800" y="610" fill="#0f172a" font-size="11">• Khoảng 15 lượt đọc bị Cache Miss được chuyển sang DB Standby trên Máy 2 xử lý.</text>
  <text x="800" y="630" fill="#166534" font-size="11.5" font-weight="bold">• Chỉ còn đúng ~10 lượt đặt vé thực sự chạm vào DB Master trên Máy 1!</text>
  <text x="800" y="650" fill="#475569" font-size="11">-&gt; Hệ thống loại bỏ hoàn toàn hiện tượng thắt cổ chai (Bottleneck) tại Master.</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 4: LUỒNG KIỂM SOÁT ĐỒNG THỜI (CONCURRENCY CONTROL)
# ==============================================================================
svg_04 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <!-- Title Header -->
  <rect x="250" y="10" width="980" height="55" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">BÀI TOÁN ĐIỂM CỐT LÕI: 10 KHÁCH HÀNG CÙNG ĐUA MUA GHẾ A20 DUY NHẤT TẠI THỜI ĐIỂM T=0</text>
  <text x="740" y="50" fill="#166534" font-size="11" font-weight="bold" text-anchor="middle">Mục tiêu: Đúng 1 request thành công (201 Created), 9 requests bị từ chối dứt khoát (409 Conflict)</text>

  <!-- Left: Pessimistic Locking -->
  <rect x="20" y="80" width="710" height="720" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="20" y="80" width="710" height="30" fill="#1e293b" />
  <text x="35" y="100" fill="#ffffff" font-size="12" font-weight="bold">CHIẾN LƯỢC 1: PESSIMISTIC LOCKING (Khoá Bi Quan — SELECT ... FOR UPDATE)</text>

  <rect x="40" y="125" width="670" height="60" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="148" fill="#0f172a" font-size="11.5" font-weight="bold">Bước 1: Bắt đầu Transaction &amp; Khoá độc quyền hàng dữ liệu (Exclusive Row Lock)</text>
  <text x="55" y="168" fill="#0f172a" font-size="11" font-family="monospace">SELECT * FROM seats WHERE id = '20' FOR UPDATE;</text>

  <rect x="40" y="200" width="670" height="150" fill="#ffffff" stroke="#64748b" />
  <text x="55" y="223" fill="#0f172a" font-size="11.5" font-weight="bold">Bước 2: Phân giải tranh chấp tại tầng Database Engine (PostgreSQL):</text>
  <text x="70" y="245" fill="#166534" font-size="11" font-weight="bold">[THÀNH CÔNG] Request 1: Giành được Exclusive Lock đầu tiên.</text>
  <text x="85" y="265" fill="#475569" font-size="10.5">• Kiểm tra trạng thái: status == 'available' -&gt; Hợp lệ!</text>
  <text x="85" y="283" fill="#475569" font-size="10.5">• Cập nhật: seat.status = 'booked' -&gt; Lưu DB -&gt; COMMIT TRANSACTION.</text>
  <text x="70" y="307" fill="#991b1b" font-size="11" font-weight="bold">[HÀNG ĐỢI] 9 Requests còn lại (Req 2..10): BỊ ĐƯA VÀO HÀNG ĐỢI TREO (BLOCKED)</text>
  <text x="85" y="328" fill="#475569" font-size="10.5">• Khi Req 1 nhả khoá: Lần lượt Req 2..10 được đọc dòng dữ liệu -&gt; Thấy status ĐÃ LÀ 'booked'!</text>

  <rect x="40" y="365" width="320" height="110" fill="#ffffff" stroke="#166534" stroke-width="1.5" />
  <text x="200" y="390" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">KẾT QUẢ REQUEST 1 (THẮNG)</text>
  <text x="200" y="415" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">HTTP 201 CREATED</text>
  <text x="200" y="438" fill="#475569" font-size="11" text-anchor="middle">Đặt vé thành công Ghế A20</text>
  <text x="200" y="458" fill="#166534" font-size="10.5" font-weight="bold" text-anchor="middle">Xoá cache Redis Master -&gt; Stream qua LAN</text>

  <rect x="380" y="365" width="330" height="110" fill="#ffffff" stroke="#991b1b" stroke-width="1.5" />
  <text x="545" y="390" fill="#991b1b" font-size="12" font-weight="bold" text-anchor="middle">KẾT QUẢ 9 REQUESTS CÒN LẠI</text>
  <text x="545" y="415" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">HTTP 409 CONFLICT</text>
  <text x="545" y="438" fill="#991b1b" font-size="11" text-anchor="middle">RpcException: Seat A20 is already booked</text>
  <text x="545" y="458" fill="#475569" font-size="10.5" text-anchor="middle">Gateway map code 6 (ALREADY_EXISTS) -&gt; 409</text>

  <rect x="40" y="490" width="670" height="295" fill="#ffffff" stroke="#cbd5e1" />
  <text x="55" y="515" fill="#0f172a" font-size="12" font-weight="bold">Đặc điểm kỹ thuật:</text>
  <text x="70" y="540" fill="#0f172a" font-size="11">• Cơ chế khoá thực hiện trực tiếp tại Kernel Database Engine qua Postgres Lock Manager.</text>
  <text x="70" y="563" fill="#0f172a" font-size="11">• Đảm bảo tính toàn vẹn tuyệt đối: Không bao giờ xảy ra Dirty Read hay Phantom Read.</text>
  <text x="70" y="586" fill="#0f172a" font-size="11">• Phù hợp nhất cho bài toán mở bán vé giờ vàng khi nhiều người cùng tranh 1 chỗ ngồi.</text>
  <text x="70" y="609" fill="#166534" font-size="11" font-weight="bold">• Sau khi commit: Kích hoạt ngay lệnh xoá cache Redis Master -&gt; Đồng bộ sang Máy 2.</text>


  <!-- Right: Optimistic Locking -->
  <rect x="750" y="80" width="710" height="720" fill="#ffffff" stroke="#1e40af" stroke-width="1.8" />
  <rect x="750" y="80" width="710" height="30" fill="#1e40af" />
  <text x="765" y="100" fill="#ffffff" font-size="12" font-weight="bold">CHIẾN LƯỢC 2: OPTIMISTIC LOCKING (Khoá Lạc Quan — @VersionColumn CAS)</text>

  <rect x="770" y="125" width="670" height="60" fill="#ffffff" stroke="#64748b" />
  <text x="785" y="148" fill="#0f172a" font-size="11.5" font-weight="bold">Bước 1: Đọc dữ liệu tự do không giữ khoá (Non-blocking Read)</text>
  <text x="785" y="168" fill="#0f172a" font-size="11" font-family="monospace">SELECT id, version, status FROM seats WHERE id = '20'; -- Cả 10 requests cùng đọc version = 1</text>

  <rect x="770" y="200" width="670" height="150" fill="#ffffff" stroke="#64748b" />
  <text x="785" y="223" fill="#0f172a" font-size="11.5" font-weight="bold">Bước 2: Cập nhật nguyên tử kèm kiểm tra phiên bản (Atomic Compare-and-Set):</text>
  <text x="800" y="245" fill="#0f172a" font-size="11" font-family="monospace">UPDATE seats SET status='booked', version=version+1</text>
  <text x="800" y="262" fill="#0f172a" font-size="11" font-family="monospace">WHERE id='20' AND version=1 AND status='available';</text>
  <text x="800" y="285" fill="#166534" font-size="11" font-weight="bold">[THÀNH CÔNG] Đúng 1 Request được Database ghi nhận: affected rows == 1 (Version tăng lên 2).</text>
  <text x="800" y="307" fill="#991b1b" font-size="11" font-weight="bold">[XUNG ĐỘT] 9 Requests còn lại chạy sau: affected rows == 0! Version trong DB đã là 2 khác 1!</text>
  <text x="800" y="328" fill="#475569" font-size="10.5">• inventory-service phát hiện affected === 0 -&gt; Ném ngay RpcException(status.ABORTED)!</text>

  <rect x="770" y="365" width="320" height="110" fill="#ffffff" stroke="#166534" stroke-width="1.5" />
  <text x="930" y="390" fill="#166534" font-size="12" font-weight="bold" text-anchor="middle">KẾT QUẢ REQUEST THẮNG</text>
  <text x="930" y="415" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">HTTP 201 CREATED</text>
  <text x="930" y="438" fill="#475569" font-size="11" text-anchor="middle">affected rows = 1 (Version mới: 2)</text>
  <text x="930" y="458" fill="#166534" font-size="10.5" font-weight="bold" text-anchor="middle">Xoá cache Redis Master -&gt; Stream qua LAN</text>

  <rect x="1110" y="365" width="330" height="110" fill="#ffffff" stroke="#991b1b" stroke-width="1.5" />
  <text x="1275" y="390" fill="#991b1b" font-size="12" font-weight="bold" text-anchor="middle">KẾT QUẢ 9 REQUESTS THUA</text>
  <text x="1275" y="415" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">HTTP 409 CONFLICT</text>
  <text x="1275" y="438" fill="#991b1b" font-size="11" text-anchor="middle">RpcException: Optimistic Lock Conflict</text>
  <text x="1275" y="458" fill="#475569" font-size="10.5" text-anchor="middle">Gateway map code 10 (ABORTED) -&gt; 409 Conflict</text>

  <rect x="770" y="490" width="670" height="295" fill="#ffffff" stroke="#cbd5e1" />
  <text x="785" y="515" fill="#0f172a" font-size="12" font-weight="bold">Đặc điểm kỹ thuật:</text>
  <text x="800" y="540" fill="#0f172a" font-size="11">• Không chiếm giữ khoá cấp cơ sở dữ liệu: Các request khác vẫn đọc dữ liệu ghế bình thường.</text>
  <text x="800" y="563" fill="#0f172a" font-size="11">• Phù hợp nhất cho môi trường có tỉ lệ tranh chấp thấp hoặc đọc nhiều hơn ghi.</text>
  <text x="800" y="586" fill="#0f172a" font-size="11">• Minh chứng tính linh hoạt: Chuyển đổi giữa 2 cơ chế chỉ bằng biến môi trường LOCK_STRATEGY.</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 5: LUỒNG ĐỒNG BỘ XOÁ CACHE GIỮA 2 MÁY (CHỐNG BÁN VÉ MA)
# ==============================================================================
svg_05 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="m5-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
    </marker>
    <marker id="m5-dark" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e40af" />
    </marker>
  </defs>

  <!-- Title Header -->
  <rect x="250" y="10" width="980" height="50" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">BÀI TOÁN: CHỐNG HIỆN TƯỢNG BÁN VÉ MA (GHOST BOOKING) KHI CHẠY TRÊN 2 MÁY VẬT LÝ</text>
  <text x="740" y="48" fill="#475569" font-size="11" text-anchor="middle">Giải pháp: Đặt vé tại Máy 1 xoá cache Redis Master -&gt; Lan truyền stream qua mạng LAN xoá ngay cache Máy 2 trong &lt; 5ms</text>

  <!-- Main Container -->
  <rect x="20" y="75" width="1440" height="725" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="20" y="75" width="1440" height="30" fill="#1e293b" />
  <text x="35" y="95" fill="#ffffff" font-size="12" font-weight="bold">QUY TRÌNH ĐỒNG BỘ BỘ NHỚ ĐỆM QUA MẠNG LAN NỘI BỘ</text>

  <!-- Step 1: Booking on Node 1 -->
  <rect x="40" y="125" width="440" height="280" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <rect x="40" y="125" width="440" height="25" fill="#334155" />
  <text x="260" y="142" fill="#ffffff" font-size="11.5" font-weight="bold" text-anchor="middle">BƯỚC 1: ĐẶT VÉ TẠI MÁY VẬT LÝ 1</text>

  <text x="60" y="175" fill="#0f172a" font-size="11.5" font-weight="bold">1. Khách hàng gửi POST /booking (Ghế A20):</text>
  <text x="75" y="195" fill="#475569" font-size="11">• Giữ chỗ thành công trên Postgres Master (192.168.43.11:5501).</text>
  <text x="75" y="215" fill="#475569" font-size="11">• Commit transaction -&gt; Ghế A20 chuyển thành 'booked'.</text>

  <text x="60" y="245" fill="#0f172a" font-size="11.5" font-weight="bold">2. inventory-service kích hoạt lệnh xoá cache:</text>
  <text x="75" y="265" fill="#0f172a" font-size="11" font-family="monospace">await this.redisWrite.del('seats:1');</text>
  <text x="75" y="285" fill="#166534" font-size="11">• Lệnh DEL được gửi trực tiếp tới Redis Master (192.168.43.11:6379).</text>

  <rect x="60" y="305" width="400" height="85" fill="#ffffff" stroke="#1e40af" stroke-width="1.5" />
  <text x="260" y="328" fill="#1e40af" font-size="12" font-weight="bold" text-anchor="middle">REDIS MASTER (192.168.43.11:6379)</text>
  <text x="260" y="348" fill="#0f172a" font-size="11" text-anchor="middle">Xoá ngay key 'seats:1' tại RAM Máy 1</text>
  <text x="260" y="368" fill="#475569" font-size="10.5" text-anchor="middle">Đẩy lệnh DEL vào Replication Buffer Stream</text>


  <!-- Streaming Arrow -->
  <line x1="480" y1="350" x2="670" y2="350" stroke="#1e40af" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#m5-dark)" />
  <rect x="500" y="325" width="150" height="22" fill="#ffffff" stroke="#1e40af" />
  <text x="575" y="340" fill="#1e40af" font-size="10" font-weight="bold" text-anchor="middle">Replication Stream</text>

  <!-- Step 2: Node 2 Redis Sync -->
  <rect x="680" y="125" width="440" height="280" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <rect x="680" y="125" width="440" height="25" fill="#334155" />
  <text x="900" y="142" fill="#ffffff" font-size="11.5" font-weight="bold" text-anchor="middle">BƯỚC 2: ĐỒNG BỘ XOÁ CACHE SANG MÁY VẬT LÝ 2</text>

  <text x="700" y="175" fill="#0f172a" font-size="11.5" font-weight="bold">3. Redis Replica trên Máy 2 (192.168.43.12:6379):</text>
  <text x="715" y="195" fill="#475569" font-size="11">• Cấu hình: replicaof 192.168.43.11 6379 (Chế độ đọc - Read Only).</text>
  <text x="715" y="215" fill="#475569" font-size="11">• Nhận gói tin DEL 'seats:1' từ mạng LAN trong &lt; 3ms.</text>

  <rect x="700" y="235" width="400" height="85" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <text x="900" y="258" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">REDIS REPLICA (192.168.43.12:6379)</text>
  <text x="900" y="280" fill="#991b1b" font-size="11.5" font-weight="bold" text-anchor="middle">TỰ ĐỘNG XOÁ KEY 'seats:1' TẠI RAM MÁY 2</text>
  <text x="900" y="300" fill="#475569" font-size="10.5" text-anchor="middle">Độ trễ đồng bộ (Replication Lag): ~2-5 mili-giây</text>

  <text x="700" y="345" fill="#166534" font-size="11.5" font-weight="bold">4. Trạng thái sau đồng bộ:</text>
  <text x="715" y="365" fill="#475569" font-size="11">• Cả Redis Master (Máy 1) và Redis Replica (Máy 2) đều KHÔNG CÒN key 'seats:1'.</text>
  <text x="715" y="385" fill="#166534" font-size="11" font-weight="bold">• Đảm bảo tính nhất quán dữ liệu (Cache Consistency) trên toàn cụm phân tán!</text>

  <!-- Line to Step 3 -->
  <line x1="1120" y1="275" x2="1160" y2="275" stroke="#1e293b" stroke-width="1.5" marker-end="url(#m5-arr)" />

  <!-- Step 3: Node 2 User Sees Red Seat -->
  <rect x="1170" y="125" width="270" height="280" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
  <rect x="1170" y="125" width="270" height="25" fill="#334155" />
  <text x="1305" y="142" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">BƯỚC 3: KHÁCH ĐỌC Ở MÁY 2</text>

  <text x="1185" y="175" fill="#0f172a" font-size="11" font-weight="bold">Khách vào xem phim:</text>
  <text x="1185" y="195" fill="#475569" font-size="10.5">• Gửi GET /movies/1</text>
  <text x="1185" y="215" fill="#0f172a" font-size="10.5" font-weight="bold">• Redis Replica: CACHE MISS</text>
  <text x="1185" y="235" fill="#475569" font-size="10.5">• Query DB Standby local</text>
  <text x="1185" y="255" fill="#166534" font-size="10.5" font-weight="bold">• Thấy ghế A20 = 'booked'</text>
  <text x="1185" y="275" fill="#475569" font-size="10.5">• Ghi nạp lại cache mới</text>

  <rect x="1185" y="305" width="240" height="85" fill="#ffffff" stroke="#991b1b" stroke-width="1.5" />
  <text x="1305" y="328" fill="#0f172a" font-size="11" font-weight="bold" text-anchor="middle">GIAO DIỆN KHÁCH HÀNG</text>
  <text x="1305" y="350" fill="#991b1b" font-size="11" font-weight="bold" text-anchor="middle">GHẾ A20 ĐỔI MÀU (ĐÃ ĐẶT)</text>
  <text x="1305" y="370" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">KHÔNG CÒN BÁN VÉ MA</text>

  <!-- Explanatory Box -->
  <rect x="40" y="430" width="1400" height="350" fill="#ffffff" stroke="#cbd5e1" />
  <text x="60" y="455" fill="#0f172a" font-size="12" font-weight="bold">PHÂN TÍCH KỸ THUẬT VỀ TÍNH NHẤT QUÁN BỘ NHỚ ĐỆM (CACHE CONSISTENCY):</text>

  <text x="60" y="485" fill="#0f172a" font-size="11.5" font-weight="bold">1. Vì sao dùng Redis Master-Replica thay vì Redis Cluster?</text>
  <text x="75" y="505" fill="#475569" font-size="11">• Redis Cluster chia 16384 slot cần tối thiểu 6 node -&gt; Quá nặng và phức tạp cho đồ án 2 máy vật lý.</text>
  <text x="75" y="525" fill="#475569" font-size="11">• Mô hình Master-Replica giải quyết đúng và trúng: Ghi tập trung tại Master, Đọc phân tán tại Replica local.</text>

  <text x="60" y="555" fill="#0f172a" font-size="11.5" font-weight="bold">2. Độ trễ sao chép (Replication Lag):</text>
  <text x="75" y="575" fill="#475569" font-size="11">• Qua đường truyền mạng LAN, gói tin DEL chỉ mất 2-5 mili-giây để đến được Redis Replica.</text>
  <text x="75" y="595" fill="#475569" font-size="11">• Kể cả khi có độ trễ: Nếu khách nhanh tay bấm mua lại ghế A20 trên Máy 2 trong khoảng 2ms đó, tầng Database Transaction bên dưới với SELECT FOR UPDATE hoặc Version Check vẫn sẽ CHẶN ĐỨNG request (trả về 409 Conflict).</text>

  <text x="60" y="625" fill="#166534" font-size="11.5" font-weight="bold">-&gt; Hệ thống đạt mô hình Eventual Consistency đa tầng, đảm bảo tính đúng đắn 100% trong mọi kịch bản cạnh tranh!</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 6: TÁCH RỜI BẤT ĐỒNG BỘ & CHỊU LỖI HÀNG ĐỢI (RABBITMQ QUORUM)
# ==============================================================================
svg_06 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="m6-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
    </marker>
    <marker id="m6-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#166534" />
    </marker>
  </defs>

  <!-- Title Header -->
  <rect x="250" y="10" width="980" height="50" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">TÁCH RỜI BẤT ĐỒNG BỘ (ASYNCHRONOUS DECOUPLING) VÀ CHỊU LỖI TỪNG PHẦN (PARTIAL FAILURE)</text>
  <text x="740" y="48" fill="#475569" font-size="11" text-anchor="middle">Sử dụng cụm RabbitMQ Cluster với Quorum Queues (Thuật toán đồng thuận Raft)</text>

  <!-- Stage 1 -->
  <rect x="20" y="75" width="1440" height="240" fill="#ffffff" stroke="#1e40af" stroke-width="1.8" />
  <rect x="20" y="75" width="1440" height="28" fill="#1e40af" />
  <text x="35" y="94" fill="#ffffff" font-size="12" font-weight="bold">GIAI ĐOẠN 1: TÁCH RỜI ĐỘ TRỄ — ĐẶT VÉ PHẢN HỒI NGAY, GỬI EMAIL CHẠY HẬU TRƯỜNG</text>

  <rect x="40" y="120" width="220" height="75" fill="#ffffff" stroke="#64748b" />
  <text x="150" y="148" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">1. Client POST /booking</text>
  <text x="150" y="168" fill="#475569" font-size="10.5" text-anchor="middle">Khách chọn suất chiếu &amp; ghế A20</text>

  <line x1="260" y1="157" x2="310" y2="157" stroke="#1e293b" stroke-width="1.5" marker-end="url(#m6-arr)" />

  <rect x="315" y="120" width="250" height="75" fill="#ffffff" stroke="#334155" />
  <text x="440" y="145" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">2. Booking Service</text>
  <text x="440" y="165" fill="#475569" font-size="10.5" text-anchor="middle">Giữ chỗ &amp; Ghi DB Master thành công</text>
  <text x="440" y="182" fill="#475569" font-size="9.5" text-anchor="middle">Thời gian xử lý: ~20 mili-giây</text>

  <line x1="565" y1="157" x2="615" y2="157" stroke="#1e293b" stroke-width="1.5" marker-end="url(#m6-arr)" />

  <rect x="620" y="120" width="300" height="75" fill="#ffffff" stroke="#1e293b" />
  <text x="770" y="143" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">3. Bắn Event vào RabbitMQ</text>
  <text x="770" y="163" fill="#0f172a" font-size="10.5" font-family="monospace" text-anchor="middle">this.rabbitClient.emit('booking.confirmed')</text>
  <text x="770" y="182" fill="#475569" font-size="9.5" text-anchor="middle">Phát tin nhắn bất đồng bộ: ~2 mili-giây</text>

  <line x1="920" y1="157" x2="970" y2="157" stroke="#166534" stroke-width="2" marker-end="url(#m6-green)" />

  <rect x="975" y="120" width="465" height="75" fill="#ffffff" stroke="#166534" stroke-width="1.8" />
  <text x="1207" y="148" fill="#166534" font-size="12.5" font-weight="bold" text-anchor="middle">4. Phản hồi lập tức: HTTP 201 CREATED</text>
  <text x="1207" y="168" fill="#0f172a" font-size="11" text-anchor="middle">Tổng thời gian phản hồi cho User: &lt; 40 mili-giây!</text>
  <text x="1207" y="185" fill="#475569" font-size="10" text-anchor="middle">User nhận mã vé ngay mà không cần đợi gửi email (tốn 3-5 giây)</text>

  <rect x="40" y="210" width="1400" height="85" fill="#ffffff" stroke="#cbd5e1" />
  <text x="55" y="235" fill="#0f172a" font-size="11.5" font-weight="bold">Ý NGHĨA PHÂN TÁN:</text>
  <text x="55" y="255" fill="#475569" font-size="11">• Tách rời thời gian (Time Decoupling): Gửi email phụ thuộc vào mạng SMTP của bên thứ ba thường xuyên chập chờn.</text>
  <text x="55" y="275" fill="#475569" font-size="11">• Nhờ Message Queue làm bộ đệm, sự cố bên ngoài không bao giờ ảnh hưởng tới luồng đặt vé cốt lõi.</text>


  <!-- Stage 2 -->
  <rect x="20" y="335" width="1440" height="465" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="20" y="335" width="1440" height="28" fill="#1e293b" />
  <text x="35" y="354" fill="#ffffff" font-size="12" font-weight="bold">GIAI ĐOẠN 2: CHỊU LỖI TỪNG PHẦN (PARTIAL FAILURE) — WORKER MÁY 1 BỊ TẮT, WORKER MÁY 2 XỬ LÝ THAY THẾ</text>

  <rect x="40" y="380" width="620" height="230" fill="#ffffff" stroke="#334155" />
  <text x="350" y="405" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">CỤM RABBITMQ CLUSTER ĐỒNG THUẬN (RAFT CONSENSUS)</text>

  <rect x="60" y="425" width="260" height="120" fill="#ffffff" stroke="#475569" />
  <text x="190" y="450" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">RabbitMQ #1 (Máy 1: 192.168.43.11)</text>
  <text x="190" y="470" fill="#475569" font-size="10.5" text-anchor="middle">Queue Leader: 'booking.confirmed'</text>
  <text x="190" y="490" fill="#475569" font-size="10" text-anchor="middle">Ghi log tin nhắn bền vững xuống đĩa</text>
  <text x="190" y="510" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">Raft State: Replicated (Term 1)</text>

  <line x1="320" y1="485" x2="380" y2="485" stroke="#1e293b" stroke-width="2" stroke-dasharray="4,3" />

  <rect x="380" y="425" width="260" height="120" fill="#ffffff" stroke="#475569" />
  <text x="510" y="450" fill="#0f172a" font-size="11.5" font-weight="bold" text-anchor="middle">RabbitMQ #2 (Máy 2: 192.168.43.12)</text>
  <text x="510" y="470" fill="#475569" font-size="10.5" text-anchor="middle">Queue Follower: 'booking.confirmed'</text>
  <text x="510" y="490" fill="#475569" font-size="10" text-anchor="middle">Đồng thuận tin nhắn qua mạng LAN</text>
  <text x="510" y="510" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">Raft State: Replicated (Term 1)</text>

  <rect x="60" y="560" width="580" height="35" fill="#ffffff" stroke="#94a3b8" />
  <text x="350" y="582" fill="#0f172a" font-size="10.5" text-anchor="middle">rabbitmqctl set_policy quorum-policy "^booking\." '{"queue-type":"quorum"}'</text>

  <!-- Worker Simulation -->
  <rect x="690" y="380" width="750" height="230" fill="#ffffff" stroke="#64748b" />
  <text x="1065" y="405" fill="#0f172a" font-size="12" font-weight="bold" text-anchor="middle">MÔ PHỎNG THỰC TẾ: TẮT NOTIFICATION SERVICE MÁY 1 (DEMO BẢO VỆ)</text>

  <rect x="710" y="425" width="330" height="120" fill="#ffffff" stroke="#991b1b" stroke-width="1.5" />
  <text x="875" y="450" fill="#991b1b" font-size="11.5" font-weight="bold" text-anchor="middle">TẮT notification-service #1</text>
  <text x="875" y="470" fill="#0f172a" font-size="10.5" font-family="monospace" text-anchor="middle">docker stop notification-node1</text>
  <text x="875" y="495" fill="#991b1b" font-size="11" font-weight="bold" text-anchor="middle">Worker Máy 1 bị tắt</text>
  <text x="875" y="515" fill="#475569" font-size="10" text-anchor="middle">Tin nhắn KHÔNG bị mất (Durable Queue)</text>

  <rect x="1070" y="425" width="350" height="120" fill="#ffffff" stroke="#166534" stroke-width="1.5" />
  <text x="1245" y="450" fill="#166534" font-size="11.5" font-weight="bold" text-anchor="middle">notification-service #2 (MÁY 2)</text>
  <text x="1245" y="470" fill="#0f172a" font-size="10.5" text-anchor="middle">TỰ ĐỘNG TIÊU THỤ THAY THẾ</text>
  <text x="1245" y="495" fill="#166534" font-size="11" font-weight="bold" text-anchor="middle">Lấy tin nhắn từ cụm RabbitMQ Máy 2</text>
  <text x="1245" y="515" fill="#475569" font-size="10" text-anchor="middle">In log gửi email xác nhận &amp; manual ACK</text>

  <line x1="640" y1="485" x2="1070" y2="485" stroke="#166534" stroke-width="2" marker-end="url(#m6-green)" />

  <rect x="40" y="630" width="1400" height="150" fill="#ffffff" stroke="#cbd5e1" />
  <text x="55" y="655" fill="#0f172a" font-size="11.5" font-weight="bold">KẾT LUẬN GIÁ TRỊ ĂN ĐIỂM:</text>
  <text x="55" y="680" fill="#475569" font-size="11">• Tính chịu lỗi từng phần (Partial Failure): Một thành phần gặp sự cố không làm sập toàn bộ hệ thống.</text>
  <text x="55" y="700" fill="#475569" font-size="11">• Tính bền vững: Dùng manual ACK (noAck: false). Chỉ khi worker gửi mail xong mới gọi channel.ack().</text>
  <text x="55" y="720" fill="#166534" font-size="11" font-weight="bold">• Nhờ Quorum Queue với Raft: Tin nhắn được sao chép an toàn trên cả 2 máy vật lý -&gt; ZERO MESSAGE LOSS!</text>
</svg>
"""

# ==============================================================================
# SƠ ĐỒ 7: CƠ CHẾ NGẮT MẠCH CIRCUIT BREAKER
# ==============================================================================
svg_07 = """
<svg viewBox="0 0 1480 820" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="m7-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
    </marker>
    <marker id="m7-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#166534" />
    </marker>
    <marker id="m7-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#991b1b" />
    </marker>
  </defs>

  <!-- Title Header -->
  <rect x="250" y="10" width="980" height="50" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
  <text x="740" y="32" fill="#0f172a" font-size="13" font-weight="bold" text-anchor="middle">CƠ CHẾ NGẮT MẠCH (CIRCUIT BREAKER) &amp; RETRY WITH EXPONENTIAL BACKOFF</text>
  <text x="740" y="48" fill="#475569" font-size="11" text-anchor="middle">Bảo vệ API Gateway không bị sập dây chuyền (Cascade Failure) khi dịch vụ downstream gặp sự cố hoặc quá tải</text>

  <!-- Main Container -->
  <rect x="20" y="75" width="1440" height="725" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  <rect x="20" y="75" width="1440" height="28" fill="#1e293b" />
  <text x="35" y="94" fill="#ffffff" font-size="12" font-weight="bold">MÁY TRẠNG THÁI HỮU HẠN CỦA CIRCUIT BREAKER (FINITE STATE MACHINE — 3 TRẠNG THÁI CHUẨN)</text>

  <!-- CLOSED -->
  <rect x="40" y="130" width="410" height="230" fill="#ffffff" stroke="#166534" stroke-width="1.8" />
  <rect x="40" y="130" width="410" height="26" fill="#166534" />
  <text x="245" y="148" fill="#ffffff" font-size="11.5" font-weight="bold" text-anchor="middle">1. TRẠNG THÁI: CLOSED (Đóng Mạch - Bình Thường)</text>

  <text x="60" y="180" fill="#0f172a" font-size="11" font-weight="bold">• Hành vi xử lý request:</text>
  <text x="75" y="200" fill="#475569" font-size="10.5">Mọi request từ Client đều được cho phép đi qua bình thường.</text>
  <text x="75" y="218" fill="#475569" font-size="10.5">Chuyển tiếp tới gRPC Inventory hoặc Booking service.</text>

  <text x="60" y="248" fill="#166534" font-size="11" font-weight="bold">• Tích hợp Retry with Exponential Backoff:</text>
  <text x="75" y="268" fill="#475569" font-size="10.5">Nếu gặp lỗi chập chờn mạng: Tự thử lại tối đa 3 lần.</text>
  <text x="75" y="286" fill="#475569" font-size="10.5">Thời gian chờ tăng dần: 500ms -&gt; 1000ms -&gt; 2000ms + Jitter.</text>

  <text x="60" y="318" fill="#991b1b" font-size="11" font-weight="bold">[ĐIỀU KIỆN CHUYỂN MẠCH]:</text>
  <text x="75" y="338" fill="#991b1b" font-size="10.5">5 lần lỗi liên tiếp (failureThreshold = 5) -&gt; CHUYỂN SANG OPEN</text>

  <!-- Line to OPEN -->
  <line x1="450" y1="245" x2="550" y2="245" stroke="#991b1b" stroke-width="2" marker-end="url(#m7-red)" />
  <rect x="465" y="225" width="75" height="18" fill="#ffffff" stroke="#991b1b" />
  <text x="502" y="238" fill="#991b1b" font-size="9" font-weight="bold" text-anchor="middle">5 Lỗi liên tiếp</text>

  <!-- OPEN -->
  <rect x="560" y="130" width="410" height="230" fill="#ffffff" stroke="#991b1b" stroke-width="1.8" />
  <rect x="560" y="130" width="410" height="26" fill="#991b1b" />
  <text x="765" y="148" fill="#ffffff" font-size="11.5" font-weight="bold" text-anchor="middle">2. TRẠNG THÁI: OPEN (Ngắt Mạch - Chặn Hoàn Toàn)</text>

  <text x="580" y="180" fill="#991b1b" font-size="11" font-weight="bold">• Hành vi xử lý request:</text>
  <text x="595" y="200" fill="#991b1b" font-size="10.5">KHÔNG GỌI DỊCH VỤ PHÍA DƯỚI! Chặn đứng ngay tại Gateway.</text>
  <text x="595" y="218" fill="#475569" font-size="10.5">Tránh cho downstream service đang quá tải bị nhận thêm việc.</text>

  <text x="580" y="248" fill="#0f172a" font-size="11" font-weight="bold">• Phản hồi Fallback tức thì (&lt; 1ms):</text>
  <text x="595" y="268" fill="#0f172a" font-size="10.5">Trả về thông điệp êm dịu (Graceful Degradation):</text>
  <text x="595" y="286" fill="#475569" font-size="10">"Hệ thống đang bận hoặc bảo trì, vui lòng thử lại sau 30 giây."</text>

  <text x="580" y="318" fill="#0f172a" font-size="11" font-weight="bold">[ĐỒNG HỒ ĐẾM NGƯỢC]:</text>
  <text x="595" y="338" fill="#475569" font-size="10.5">recoveryTimeout = 30000ms (30 giây) -&gt; CHUYỂN SANG HALF-OPEN</text>

  <!-- Line to HALF-OPEN -->
  <line x1="970" y1="245" x2="1060" y2="245" stroke="#1e293b" stroke-width="1.8" marker-end="url(#m7-arr)" />
  <rect x="985" y="225" width="60" height="18" fill="#ffffff" stroke="#1e293b" />
  <text x="1015" y="238" fill="#0f172a" font-size="9" font-weight="bold" text-anchor="middle">Hết 30s</text>

  <!-- HALF-OPEN -->
  <rect x="1070" y="130" width="370" height="230" fill="#ffffff" stroke="#334155" stroke-width="1.8" />
  <rect x="1070" y="130" width="370" height="26" fill="#334155" />
  <text x="1255" y="148" fill="#ffffff" font-size="11.5" font-weight="bold" text-anchor="middle">3. TRẠNG THÁI: HALF-OPEN (Bán Mở - Thăm Dò)</text>

  <text x="1090" y="180" fill="#0f172a" font-size="11" font-weight="bold">• Hành vi thăm dò sức khoẻ:</text>
  <text x="1105" y="200" fill="#475569" font-size="10.5">Cho phép đúng 1 request thử nghiệm đi qua xuống hạ tầng.</text>
  <text x="1105" y="218" fill="#475569" font-size="10.5">Các request khác đến cùng lúc vẫn nhận Fallback.</text>

  <text x="1090" y="248" fill="#166534" font-size="11" font-weight="bold">• Nếu thành công 2 lần (successThreshold=2):</text>
  <text x="1105" y="268" fill="#166534" font-size="10.5">Hạ tầng đã hồi phục! -&gt; Chuyển mạch QUAY VỀ CLOSED.</text>

  <text x="1090" y="298" fill="#991b1b" font-size="11" font-weight="bold">• Nếu vẫn bị lỗi:</text>
  <text x="1105" y="318" fill="#991b1b" font-size="10.5">Dịch vụ vẫn chưa sẵn sàng -&gt; QUAY LẠI OPEN thêm 30s nữa.</text>

  <!-- Loops -->
  <path d="M 1255 360 L 1255 400 L 245 400 L 245 360" fill="none" stroke="#166534" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#m7-green)" />
  <rect x="670" y="390" width="160" height="20" fill="#ffffff" stroke="#166534" />
  <text x="750" y="404" fill="#166534" font-size="10" font-weight="bold" text-anchor="middle">Thành công -&gt; Về CLOSED</text>

  <path d="M 1150 360 L 1150 380 L 850 380 L 850 360" fill="none" stroke="#991b1b" stroke-width="1.8" stroke-dasharray="4,3" marker-end="url(#m7-red)" />
  <rect x="940" y="370" width="120" height="18" fill="#ffffff" stroke="#991b1b" />
  <text x="1000" y="383" fill="#991b1b" font-size="9" font-weight="bold" text-anchor="middle">Lỗi -&gt; Về lại OPEN</text>

  <!-- Bottom Explanations -->
  <rect x="40" y="430" width="1400" height="350" fill="#ffffff" stroke="#cbd5e1" />
  <text x="60" y="455" fill="#0f172a" font-size="12" font-weight="bold">TẠI SAO CIRCUIT BREAKER LÀ ĐIỂM ĂN ĐIỂM XUẤT SẮC TRONG HỆ THỐNG PHÂN TÁN?</text>

  <text x="60" y="485" fill="#0f172a" font-size="11.5" font-weight="bold">1. Bài toán Sập Dây Chuyền (Cascading Failure):</text>
  <text x="75" y="505" fill="#475569" font-size="11">• Giả sử inventory-service bị treo: Nếu không có Circuit Breaker, mỗi request từ Client gửi vào Gateway sẽ bị treo chờ timeout (60 giây).</text>
  <text x="75" y="525" fill="#475569" font-size="11">• Hàng trăm request bị nghẽn làm cạn kiệt Connection Pool và RAM của API Gateway -&gt; Cuối cùng API Gateway sập theo!</text>
  <text x="75" y="545" fill="#166534" font-size="11" font-weight="bold">• Có Circuit Breaker: Khi phát hiện 5 lỗi liên tiếp, Gateway lập tức NGẮT MẠCH. Trả lỗi ngay trong 0.1ms, giữ cho Gateway sống sót để phục vụ các endpoint khác.</text>

  <text x="60" y="580" fill="#0f172a" font-size="11.5" font-weight="bold">2. Trải nghiệm người dùng văn minh (Fail Fast &amp; Graceful Degradation):</text>
  <text x="75" y="600" fill="#475569" font-size="11">• Thay vì bắt người dùng ngồi nhìn vòng tròn xoay 60 giây rồi mới báo lỗi Gateway Timeout (504).</text>
  <text x="75" y="620" fill="#475569" font-size="11">• Hệ thống phản hồi ngay tức khắc với thông điệp rõ ràng, bảo vệ độ tin cậy của nền tảng.</text>

  <text x="60" y="655" fill="#0f172a" font-size="11.5" font-weight="bold">3. Tích hợp trong mã nguồn dự án:</text>
  <text x="75" y="675" fill="#475569" font-size="11">• Triển khai thuần TypeScript trong shared/src/circuit-breaker.ts không cần phụ thuộc thư viện ngoài.</text>
  <text x="75" y="695" fill="#475569" font-size="11">• Được áp dụng trực tiếp vào GatewayService để bọc cả 2 kênh gọi gRPC: this.inventoryCircuit và this.bookingCircuit.</text>
</svg>
"""

diagrams_data = [
    {
        "id": "01_tong_the_he_thong_phan_tan",
        "title": "SƠ ĐỒ 1: KIẾN TRÚC TỔNG THỂ TOÀN BỘ HỆ THỐNG PHÂN TÁN (2 MÁY VẬT LÝ + NODE 3 TRỌNG TÀI, CÙNG MẠNG LAN)",
        "subtitle": "Mô hình Active-Standby kết nối qua mạng LAN (192.168.43.0/24), đồng bộ dữ liệu thời gian thực và tự động cân bằng tải",
        "svg": svg_01
    },
    {
        "id": "02_auto_failover_khi_db_master_sap",
        "title": "SƠ ĐỒ 2: LUỒNG AUTO-FAILOVER KHI MASTER CHẾT & CƠ CHẾ QUORUM CHỐNG NÃO CHIA CẮT (SPLIT-BRAIN)",
        "subtitle": "Quy trình bỏ phiếu Quorum 3 nodes: Phân biệt chính xác giữa đứt mạng (không promote) và máy chủ sập thật sự (tự động thăng cấp < 20s)",
        "svg": svg_02
    },
    {
        "id": "03_giam_tai_khi_db_master_qua_tai",
        "title": "SƠ ĐỒ 3: LUỒNG XỬ LÝ KHI MASTER BỊ QUÁ TẢI (READ/WRITE SPLITTING + REDIS CACHE-ASIDE)",
        "subtitle": "Giải phóng 85-90% truy vấn đọc vào Redis RAM (< 1ms), chuyển các truy vấn đọc còn lại sang PostgreSQL Standby Máy 2",
        "svg": svg_03
    },
    {
        "id": "04_kiem_soat_dong_thoi_tranh_ve",
        "title": "SƠ ĐỒ 4: LUỒNG KIỂM SOÁT ĐỒNG THỜI (CONCURRENCY CONTROL) — 10 KHÁCH TRANH MUA GHẾ CUỐI A20",
        "subtitle": "So sánh 2 trường phái khoá: Pessimistic Locking (SELECT FOR UPDATE) và Optimistic Locking (@VersionColumn Atomic CAS)",
        "svg": svg_04
    },
    {
        "id": "05_dong_bo_cache_chong_ban_ve_ma",
        "title": "SƠ ĐỒ 5: LUỒNG ĐỒNG BỘ XOÁ CACHE GIỮA 2 MÁY THẬT (CHỐNG BÁN VÉ MA - GHOST BOOKING)",
        "subtitle": "Ghi vé tại Máy 1 -> Xoá cache Redis Master -> Stream replication qua mạng LAN tự động xoá cache Redis Replica trên Máy 2 trong < 5ms",
        "svg": svg_05
    },
    {
        "id": "06_async_decoupling_va_chiu_loi_queue",
        "title": "SƠ ĐỒ 6: TÁCH RỜI BẤT ĐỒNG BỘ & CHỊU LỖI TỪNG PHẦN VỚI RABBITMQ QUORUM QUEUES (RAFT)",
        "subtitle": "Đặt vé phản hồi ngay trong < 40ms, email chạy ngầm. Khi worker Máy 1 bị sập, worker Máy 2 tự động lấy message từ Quorum Queue để gửi bù",
        "svg": svg_06
    },
    {
        "id": "07_circuit_breaker_ngat_mach_tu_bao_ve",
        "title": "SƠ ĐỒ 7: CƠ CHẾ NGẮT MẠCH (CIRCUIT BREAKER) & RETRY BACKOFF CHỐNG SẬP DÂY CHUYỀN",
        "subtitle": "Máy trạng thái hữu hạn (CLOSED -> 5 lỗi liên tiếp -> OPEN ngắt mạch 30s -> HALF-OPEN thăm dò hồi phục) và cơ chế thử lại có độ trễ tăng dần",
        "svg": svg_07
    }
]

print("=== BẮT ĐẦU TẠO 7 BẢN VẼ KỸ THUẬT VÀ XUẤT ẢNH PNG VÀO {OUTPUT_IMAGE_DIR} ===")

count = 0
for d in diagrams_data:
    temp_html_path = os.path.join(TOOLS_DIR, f"{d['id']}.html")
    html_content = (
        HTML_SHELL
        .replace("__TITLE__", d['title'])
        .replace("__SUBTITLE__", d['subtitle'])
        .replace("__SVG__", d['svg'])
    )
    with open(temp_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    target_png_path = os.path.join(OUTPUT_IMAGE_DIR, f"{d['id']}.png")
    
    cmd = [
        EDGE_EXE,
        "--headless=new",
        f"--screenshot={target_png_path}",
        "--window-size=1600,920",
        "--hide-scrollbars",
        f"file:///{temp_html_path.replace(os.sep, '/')}"
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=30)
        time.sleep(1)
        if os.path.exists(target_png_path) and os.path.getsize(target_png_path) > 1000:
            print(f"DONE: {d['id']}.png ({os.path.getsize(target_png_path)} bytes)")
            count += 1
        else:
            print(f"FAILED: {target_png_path}")
    except Exception as e:
        print(f"ERROR: {e}")

print(f"\n=== HOÀN TẤT: Đã tạo đủ {count}/7 file ảnh PNG vào thư mục: {OUTPUT_IMAGE_DIR} ===")
