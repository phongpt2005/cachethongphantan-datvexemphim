// KỊCH BẢN 1 — TÍNH TRONG SUỐT: client gọi MỘT địa chỉ, không biết phía sau có 2 máy
//   node demo/01-trong-suot.mjs        (chạy trên máy 1)
import { banner, step, info, ok, note, cmd, conclude, c, get, book, resetData, cluster, routerStatus, pause, main, table, GATEWAY, NODES } from './lib.mjs';

main(async () => {
  banner('01', 'MỘT ĐỊA CHỈ DUY NHẤT — HAI MÁY VẬT LÝ PHÍA SAU', 'Transparency: access · location · replication');

  step(1, `Client chỉ biết ${GATEWAY}`);
  cmd(`for i in 1..6: curl ${GATEWAY}/health`);
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const r = await get('/health');
    rows.push([i, r.data.nodeId === 'node1' ? c.cyan('MÁY 1') : c.magenta('MÁY 2'), r.data.hostname, `${r.ms} ms`]);
  }
  table(rows, ['Lần gọi', 'Máy trả lời', 'Container gateway', 'Độ trễ']);
  ok('Cùng một URL nhưng các yêu cầu luân phiên do 2 máy khác nhau phục vụ (Frontend LB round-robin).');
  await pause();

  step(2, 'Đặt vé qua địa chỉ duy nhất đó');
  await resetData();
  const user = `Khach_${Date.now().toString().slice(-5)}`;
  cmd(`curl -X POST ${GATEWAY}/booking -d '{"showtimeId":"1","seatId":"20","userName":"${user}"}'`);
  const r = await book(user);
  info(`HTTP ${c.bold(c.green(r.status))} sau ${c.bold(r.ms + ' ms')}`);
  table([
    ['Gateway nhận yêu cầu', `${r.data.nodeId === 'node1' ? 'MÁY 1' : 'MÁY 2'} (container ${r.data.gatewayHost})`],
    ['booking-service xử lý', `container ${r.data.processedByHost}`],
    ['Kết quả', `vé ${String(r.data.bookingId).slice(0, 8)}… ghế ${r.data.seatCode} phim "${r.data.movieName}"`],
  ], ['Hậu trường', 'Giá trị']);
  ok('Client chỉ nhận JSON; nó không biết yêu cầu đã đi qua máy nào, giao thức gì (REST → gRPC → SQL → AMQP).');
  await pause();

  step(3, 'Những gì bị che giấu: mỗi máy tự mô tả mình');
  const [c1, c2] = await Promise.all([cluster(NODES[1].gw), cluster(NODES[2].gw)]);
  const rs = await routerStatus(1);
  const inv = rs?.routes.find((x) => x.name === 'inventory');
  table([1, 2].map((n) => {
    const cl = n === 1 ? c1 : c2;
    return [NODES[n].label, NODES[n].ip, `${cl.booking.length} bản sao`, `${cl.inventory.db.write.role} (qua pg-router)`, `${cl.inventory.db.read.role} tại chỗ`, `${cl.inventory.redis.read.role}`];
  }), ['Máy', 'IP', 'booking-service', 'Ghi CSDL vào', 'Đọc CSDL từ', 'Đọc cache từ']);
  info(`Primary hiện tại của CSDL ghế: ${c.bold(inv?.primary || '?')} — mọi lệnh GHI từ cả 2 máy đều dồn về đây.`);
  console.log(c.gray(`
                    NODE 3 ${NODES[3].ip} · Frontend LB ${GATEWAY} · Witness ×2 · RabbitMQ #3
                         ┌───────────────────────┴───────────────────────┐
                         ▼                                               ▼
        MÁY 1 ${NODES[1].ip.padEnd(15)}                      MÁY 2 ${NODES[2].ip}
        gateway → booking ×N → inventory                  gateway → booking ×N → inventory
        PostgreSQL PRIMARY  ══ WAL streaming ══▶          PostgreSQL STANDBY (chỉ đọc)
        Redis MASTER        ══ replication   ══▶          Redis REPLICA
        RabbitMQ #1 (Raft)  ◀════ quorum queue ════▶      RabbitMQ #2 (Raft)`));

  conclude([
    'Access transparency: bên ngoài là REST/JSON, bên trong là gRPC/Protobuf, SQL, AMQP.',
    'Location transparency: client không biết IP, số máy, số bản sao; chỉ biết một URL.',
    'Replication transparency: dữ liệu có 2 bản trên 2 máy nhưng client thấy "một" CSDL nhất quán.',
  ]);
});
