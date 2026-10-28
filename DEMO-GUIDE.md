# HƯỚNG DẪN DEMO — HỆ THỐNG ĐẶT VÉ XEM PHIM PHÂN TÁN (2 MÁY VẬT LÝ + NODE 3 TRỌNG TÀI)

> Kiến trúc **giữ nguyên như lần bảo vệ trước** (slide "Mô hình Active-Standby hai máy vật lý", [diagrams/01](diagrams/01_tong_the_he_thong_phan_tan.png)), Node 3 nay là một laptop thật cùng Wi-Fi.
> Lần này nhóm khắc phục 3 tình huống kiến trúc cũ chưa xử lý và **demo trực tiếp** từng tình huống:
> 1. Primary bị **cô lập** (máy 1 mất mạng nhưng vẫn sống) → máy 1 tự chặn ghi, không có 2 nơi cùng bán vé.
> 2. Primary cũ **quay lại** → tự `pg_rewind` về Standby, không thành 2 Primary.
> 3. Hàng đợi **2 nút mất đa số** khi 1 máy chết → RabbitMQ 3 nút (thêm nút trên Node 3), quorum queue Raft.
>
> **Nguyên tắc nói:** 1 câu "vì sao" → chạy lệnh → chỉ vào con số → 1 câu kết luận.

---

## 0. Kiến trúc chạy thật

| Máy | Vai trò | Chạy gì |
| :--- | :--- | :--- |
| **Máy 1** — Primary node | Nhận mọi lệnh ghi lúc đầu | Bộ service đầy đủ · PostgreSQL **PRIMARY** (inventory_db, booking_db) · Redis **MASTER** · RabbitMQ #1 · pg-router |
| **Máy 2** — Secondary node | Bản sao dự phòng, phục vụ đọc | Bộ service đầy đủ · PostgreSQL **STANDBY** · Redis **REPLICA** · RabbitMQ #2 · pg-router |
| **Node 3** — Trọng tài (máy chiếu) | Bỏ phiếu đa số, điểm vào cho client | Witness ×2 (repmgr) · RabbitMQ #3 · **Frontend LB** `:8090` · chạy các script demo |

| Cơ chế | Hoạt động thế nào |
| :--- | :--- |
| **Bỏ phiếu 2/3 + phủ quyết** | Standby chỉ lên Primary khi thấy đa số nút **và** Node 3 không còn thấy Primary cũ (`primary_visibility_consensus`) |
| **pg-router** (mỗi máy) | Ứng dụng chỉ ghi vào `pg-router`; router tìm Primary hiện tại. Router chỉ cho ghi khi còn thấy **≥ 2/3 nút**, nên máy bị cô lập tự chặn ghi (self-fencing) |
| **Tự hạ cấp / rejoin** | Primary cũ thấy nút khác là Primary với timeline cao hơn → tự dừng → khởi động lại bằng `pg_rewind` thành Standby |
| **Quorum queue (Raft)** | `booking.confirmed` có 3 bản sao trên 3 máy; chết 1 nút vẫn chạy, leader được bầu lại |
| **LB tự né máy lỗi** | Máy đang failover/mất quorum trả 503 → Frontend LB gửi lại sang máy kia (đặt vé an toàn nhờ khoá ghế trên Primary) |

---

## 1. Chuẩn bị (làm 1 lần)

| Hạng mục | Yêu cầu |
| :--- | :--- |
| 3 laptop | Windows 10/11, Docker Desktop đang *Engine running*, Node.js ≥ 18, Git. Máy 1 và máy 2 nên ≥ 8 GB RAM (Docker ≥ 4 GB); Node 3 cần ít hơn |
| Mạng | **Phát hotspot từ 1 điện thoại** cho cả 3 laptop. Wi-Fi trường/phòng thi thường chặn các máy nói chuyện với nhau |
| Kiểu mạng | Settings → Network → Wi-Fi → **Network profile type = Private** (cả 3 máy) |
| Firewall | PowerShell **Run as Administrator** trên từng máy (xem lệnh bên dưới) |
| Không ngủ máy | Settings → Power → Screen/Sleep = Never khi cắm sạc |

### Cách nhanh: script setup (làm hộ mục 1 + 2)

Mỗi máy chạy **một lệnh** trong PowerShell thường, cùng 3 IP, chỉ khác `-Node`:

```powershell
deploy\windows\setup.cmd -Node 1 -Ip1 192.168.43.11 -Ip2 192.168.43.12 -Ip3 192.168.43.13   # máy 1
deploy\windows\setup.cmd -Node 3 -Ip1 192.168.43.11 -Ip2 192.168.43.12 -Ip3 192.168.43.13   # Node 3
deploy\windows\setup.cmd -Node 2 -Ip1 192.168.43.11 -Ip2 192.168.43.12 -Ip3 192.168.43.13   # máy 2
```

Script làm các bước: kiểm tra Git/Node/Docker (tự mở Docker Desktop nếu chưa chạy), ghi `cluster.env`, kiểm tra IP máy này có đúng vai không, **hỏi quyền Admin một lần (bấm YES)** để mở firewall + đặt mạng Private, kiểm tra thấy các máy kia, kiểm tra cổng bị chiếm, rồi `up` và chờ dịch vụ lên. **Ba máy chạy cùng lúc được:** Node 3 tự đợi máy 1, máy 2 tự đợi máy 1 + Node 3. Lần sau chỉ cần `setup.cmd -Node <số>` (dùng lại IP đã lưu); `-CheckOnly` chỉ kiểm tra; `-Rehearsal` để tập trên 1 laptop.

### Cách làm tay

```powershell
# Máy 1
powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 1
# Máy 2
powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 2
# Node 3
powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 3
```

## 2. Dựng cụm

**Cả 3 máy:** clone cùng một commit, xem IP Wi-Fi bằng `node deploy/cluster.mjs ip`, rồi chạy **cùng một lệnh** với 3 IP (máy 1, máy 2, Node 3):

```bash
node deploy/cluster.mjs init 192.168.43.11 192.168.43.12 192.168.43.13
```

| Bước | Máy | Lệnh | Ghi chú |
| :--: | :--- | :--- | :--- |
| 1 | **Máy 1** | `node deploy/cluster.mjs up 1` | Máy 1 chưa phục vụ ngay: chỉ thấy 1/3 nút → chưa đủ quorum, **đúng thiết kế** |
| 2 | **Node 3** | `node deploy/cluster.mjs up 3` | Đủ 2/3 → máy 1 bắt đầu nhận ghi |
| 3 | **Máy 2** | `node deploy/cluster.mjs up 2` | Standby tự clone dữ liệu từ máy 1 |
| 4 | Node 3 | `node deploy/cluster.mjs status` | Cả 2 cụm `primary=<IP1>:550x quorum 3/3` |
| 5 | Node 3 | `node demo/00-preflight.mjs` | Phải ra **✅ CỤM SẴN SÀNG** (lần đầu có thể phải đợi 1–2 phút) |

### Tập dượt khi chỉ có 1 laptop
```bash
node deploy/cluster.mjs init --rehearsal     # cả 3 "máy" dùng IP của laptop này
node deploy/cluster.mjs up all
node demo/00-preflight.mjs
node demo/run.mjs all --auto                  # chạy liền 11 kịch bản (~12 phút)
```
Ba node dùng cổng khác nhau nên chạy chung được. Thao tác "tắt Wi-Fi máy 1" được mô phỏng bằng `iptables`. Toàn bộ kịch bản đã được kiểm thử ở chế độ này.

### Đưa Primary về máy 1 (sau kịch bản 05 hoặc 10)
```bash
node deploy/cluster.mjs failback     # chạy trên MÁY 1, ~20 giây
```
Máy 1 được thăng cấp (timeline mới cao hơn). Máy 2 tự phát hiện, tự hạ cấp và theo máy 1 — không cần xoá dữ liệu.

### Làm lại cụm từ đầu (khi rối)
`node deploy/cluster.mjs down <số máy> --wipe` trên máy 2 → Node 3 → máy 1, rồi `up` lại theo thứ tự 1 → 3 → 2.

---

## 3. Trước giờ bảo vệ 20 phút

1. Cả 3 máy vào hotspot, IP không đổi (`node deploy/cluster.mjs ip`).
2. Nếu hôm trước đã demo 05/10: chạy `failback` trên máy 1.
3. Node 3: `node demo/00-preflight.mjs` → ✅.
4. Node 3 nối máy chiếu: Windows Terminal cỡ chữ 18–20, gõ sẵn `node demo/run.mjs`; trình duyệt mở `http://<IP Node 3>:8090/` (Demo Console). Máy 2 mở `http://<IP máy 2>:3100/` → tab **② Trạng thái cụm** (xoay về phía hội đồng khi demo 05/10).
5. Máy 1 và máy 2: mở sẵn terminal ở thư mục dự án để gõ lệnh khi script nhắc **👉 TRÊN MÁY …**.
6. Tắt thông báo Windows, Zalo/Messenger; cắm sạc cả 3 máy.
7. Slide: `slides/Phan1_LyThuyet_Chuong3_Threads_Virtualization.pptx` và `slides/Phan2_Demo_HeThongDatVe.pptx` (lời thoại ở Notes). Máy trình chiếu cần font **Open Sans**. Nhớ sửa dòng "Thời gian" ở slide bìa.

## 4. Phân vai

| Người | Ngồi máy | Việc |
| :--- | :--- | :--- |
| Thành viên A | **Node 3** (máy chiếu) | Điều khiển script, nói tổng quan và kết luận từng kịch bản |
| Thành viên B | **Máy 1** | Gõ lệnh "phá" máy 1 khi được nhắc (`docker stop/kill …`, **tắt Wi-Fi**) |
| Thành viên C | **Máy 2** | Gõ lệnh trên máy 2 (`--cut/--heal`, `docker stop …`), xoay màn hình tab ② cho hội đồng xem |

Khi script hiện **👉 TRÊN MÁY 1/2**, người ở máy đó gõ đúng lệnh in ra rồi nói "xong"; người ở Node 3 bấm Enter.

---

## 5. Kịch bản (~18 phút)

| # | Đặc trưng | Lệnh (Node 3) | Người khác làm | Chỉ vào | Câu chốt |
| :--: | :--- | :--- | :--- | :--- | :--- |
| 01 | **Transparency** | `run.mjs 1` | — | 6 lần gọi một URL: MÁY 1 ↔ MÁY 2 | "Một địa chỉ, phía sau 3 máy, 4 giao thức." |
| 02 | **Concurrency** | `run.mjs 2` | — | 10 khách (5 mỗi máy) → **1 × 201, 9 × 409**, cả pessimistic & optimistic | "Hai máy, một nơi phân xử: Primary." |
| 03 | **Fault tolerance + Async** | `run.mjs 3` | Máy 1, 2: `docker stop …` | Máy 2 **tiếp quản** email · hàng đợi giữ 3 thông điệp · RabbitMQ leader chết → **leader mới** · gửi bù 3/3 | "Chết từng phần, không mất email: Raft 2/3." |
| 04 | **Chống split-brain** | `run.mjs 4` | Máy 2: `node demo/04-split-brain.mjs --cut` | Log: *"witness … considering primary still visible … cancelling failover"* | "Node 3 còn thấy Primary nên phủ quyết: không có 2 Primary." |
| 05 | **Auto-failover** | `run.mjs 5` | Máy 1: `docker kill pg-inv-node1 pg-book-node1` | Dải ô đỏ ~20 s rồi xanh; tab ② máy 2 đổi PRIMARY; máy 1 bật lại → `pg_rewind: Done!` | "Phát hiện, bỏ phiếu, thăng cấp, định tuyến lại: không ai chạm tay." |
| 06 | **Replication** | `run.mjs 6` | — | Máy 2 thấy "booked" sau **~10–20 ms** | "Một nơi ghi, bản sao nhận cùng lệnh DEL." |
| 07 | **No global clock** | `run.mjs 7` | — | Độ lệch đồng hồ máy 2 vs máy 1 ± sai số | "Thứ tự do nhân quả và Primary quyết định." |
| 10 | **Cô lập máy 1** (tình huống mới) | `run.mjs 10` | Máy 1: **tắt Wi-Fi**, sau đó bật lại | Router máy 1 **1/3 → CHẶN GHI**, máy 2 **2/3 → Primary**; khách qua LB vẫn đặt được; bật Wi-Fi → máy 1 tự về Standby | "Primary sống nhưng bị cô lập vẫn không được ghi — đây là lỗ hổng lần trước đã vá." |
| 08 | Scalability (bổ sung) | trên **máy 1**: `run.mjs 8` | — | 12 lượt chia **4/4/4**; 200 lượt đọc → 99,5 % trúng cache | Sau đó `run.mjs 8 --reset` |
| 09 | Circuit breaker (bổ sung) | trên **máy 1**: `run.mjs 9` | — | 504 → **fallback 3 ms** → HALF_OPEN → CLOSED | "Ngắt mạch để không sập dây chuyền." |

**Thứ tự:** 04 trước 05. Kịch bản 10 cần Primary ở máy 1 → chạy `failback` trên máy 1 sau 05 (hoặc làm 10 trước 05).

---

## 6. Số liệu tham chiếu (đo thật, tập dượt 1 laptop)

| Kịch bản | Kết quả |
| :--- | :--- |
| 00 | Quorum 3/3 cả 2 cụm; RabbitMQ 3 nút, quorum queue 3 bản sao |
| 02 | 1 × 201 + 9 × 409, cả 2 chiến lược khoá |
| 03 | Máy 2 tiếp quản 2/2 email; 3 thông điệp chờ; leader `rabbit-node2` → `rabbit-node3`; gửi bù 3/3 |
| 04 | 25 s quan sát: máy 2 luôn STANDBY; *"cancelling failover as some nodes can still see the primary"* |
| 05 | Máy 2 lên Primary sau ~16 s; gián đoạn đặt vé **~22 s**; máy 1 bật lại → `pg_rewind: Done!` → Standby |
| 10 | Máy 1: quorum **1/3 → chặn ghi**; máy 2: **2/3** → Primary sau ~16 s; khách qua LB gián đoạn ~23 s; nối mạng → máy 1 về Standby sau ~20 s |
| failback | ~20 s, không mất dữ liệu |
| 08 / 09 | 4/4/4; 199/200 trúng cache · fallback 3 ms |

---

## 7. Xử lý sự cố

| Triệu chứng | Cách xử lý |
| :--- | :--- |
| Preflight: *quorum chỉ 1/3* | Node 3 chưa `up 3`, hoặc firewall chặn 5503/5504 trên Node 3 |
| Preflight: *máy 1 = standby, máy 2 = primary* | Vừa demo 05/10 → `node deploy/cluster.mjs failback` trên máy 1 |
| Preflight: *RabbitMQ chưa đủ 3 nút* | Kiểm tra cổng 4369/25672 trên cả 3 máy (`open-firewall.ps1`); đợi 30 s; `docker restart rabbitmq-nodeX` |
| Preflight: *quorum queue chưa đủ 3 bản sao* | Đợi 30 s (RabbitMQ tự bổ sung bản sao) rồi chạy lại |
| `up 1` xong nhưng máy 1 trả 503 | Bình thường khi Node 3 chưa lên (chưa đủ quorum) |
| Máy 2 kẹt "chờ Primary…" khi `up 2` | Máy 1 chưa lên hoặc cổng 5501/5502 bị chặn: `docker logs pg-inv-node2` |
| Demo 04 dừng giữa chừng | Trên máy 2: `node demo/04-split-brain.mjs --heal` |
| Demo 10 (tập dượt) dừng giữa chừng | `node demo/10-co-lap-may1.mjs --heal` |
| IP đổi | `init` với IP mới trên cả 3 máy → `up` lại theo thứ tự 1 → 3 → 2 |
| Hỏng hẳn | Trình bày bằng slide: slide demo có số liệu đo thật |

---

## 8. Câu hỏi hội đồng hay hỏi

1. **Lần trước có Node 3 rồi, lần này khác gì?** Lần trước repmgr chỉ quyết định *thăng cấp*. Không có gì ngăn Primary cũ (bị cô lập hoặc vừa bật lại) tiếp tục ghi, nên vẫn có thể có 2 nơi bán vé. Lần này thêm: phiếu đồng thuận, router tự chặn ghi khi mất quorum, Primary cũ tự hạ cấp, và RabbitMQ 3 nút.
2. **Vì sao cần 3 máy, 2 máy không được sao?** Đa số của 2 là 2: chết 1 máy là mất đa số. Với 2 máy, Standby không phân biệt được "Primary chết" với "đứt cáp". Máy thứ 3 là người phân xử.
3. **Node 3 chết thì sao?** Máy 1 + máy 2 vẫn là 2/3, mọi thứ chạy bình thường. Chỉ khi chết thêm một máy nữa thì hệ thống dừng ghi để bảo toàn nhất quán.
4. **Vì sao máy 1 bị cô lập lại tự chặn ghi?** Nó chỉ thấy 1/3 nút nên không thể chắc mình còn là chủ (có thể phía bên kia đã bầu chủ mới). Chọn **C** trong CAP: thà không bán còn hơn bán trùng.
5. **Primary cũ quay lại xử lý thế nào?** Nó so timeline: Primary mới có timeline cao hơn, vậy nó là chủ cũ → tự dừng → `pg_rewind` (tua bỏ phần ghi lệch) → theo chủ mới. pg-router cũng luôn chọn timeline cao nhất.
6. **Quorum queue khác hàng đợi thường?** Mỗi thông điệp được ghi lên đa số nút (Raft) trước khi xác nhận. Chết 1 nút không mất thông điệp, leader được bầu lại tự động.
7. **Vì sao LB được gửi lại POST /booking?** Khi máy đang failover trả 503, LB thử máy kia. Gửi lại không gây bán trùng vì mọi lệnh đặt vé đều khoá ghế trên Primary: tệ nhất nhận 409.
8. **Có mất vé khi failover không?** Giao dịch đã commit đã được stream sang Standby. Nếu Primary chết trong vài ms trước khi kịp gửi WAL thì giao dịch cuối có thể mất; muốn tuyệt đối thì dùng *synchronous replication* (ghi chậm hơn).
9. **Đọc ở Standby có bị cũ không?** Có thể trễ vài ms. Vì vậy đặt vé luôn kiểm tra trên Primary. Ngoài ra khi máy 2 mất liên lạc với Redis Master, nó bỏ qua cache và đọc thẳng CSDL để không hiện "vé ma".
10. **Vì sao bỏ WireGuard?** 3 máy ngồi cùng một Wi-Fi nên không cần VPN; bớt một thành phần dễ hỏng trên Windows. Khi triển khai các máy ở xa nhau thì thêm VPN, kiến trúc không đổi.
11. **Failover ~20 s có lâu không?** Phần lớn là thời gian chờ chắc chắn Primary chết thật (3 lần ping × 2 s + bỏ phiếu). Rút ngắn được, nhưng càng ngắn càng dễ failover nhầm khi mạng chập chờn.

---

## 9. Thay đổi so với plan cũ

| Plan cũ | Bản chạy thật | Lý do |
| :--- | :--- | :--- |
| Witness trên VPS (10.0.0.3) | Node 3 = laptop thứ 3 cùng Wi-Fi, chạy 2 witness (mỗi cụm CSDL một witness) | Không phụ thuộc Internet; repmgr cần mỗi cụm một witness |
| WireGuard VPN 10.0.0.0/24 | Mạng LAN (hotspot) | Cùng phòng, không cần VPN |
| Frontend LB "Virtual IP 10.0.0.1" trên máy 1 | Frontend LB trên Node 3 | Máy 1 chết thì client vẫn vào được |
| RabbitMQ 2 nút (Leader/Follower) | 3 nút (thêm RabbitMQ #3 trên Node 3), quorum queue | Raft cần đa số; 2 nút chết 1 là mất đa số |
| inventory máy 2 "Ghi về máy 1" | Ghi về Primary hiện tại qua pg-router | Sau failover vẫn ghi đúng chỗ |
| Không có fencing | Self-fencing khi mất quorum + tự hạ cấp Primary cũ | Chống split-brain khi Primary bị cô lập hoặc quay lại |
| Chrony NTP | Đồng hồ Windows mặc định | Chrony chỉ có trên Linux; kịch bản 07 đo chính độ lệch còn lại |

## 10. Demo bổ trợ Chương 3 (tuỳ chọn)

Các script luồng/ảo hoá trong `demo/extra-chuong3/` chạy với `docker-compose.yml` gốc trên 1 máy (`docker compose up -d`, khi cụm đang tắt). Chỉ dùng nếu hội đồng hỏi sâu phần lý thuyết.
