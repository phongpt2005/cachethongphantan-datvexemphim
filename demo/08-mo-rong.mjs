// KỊCH BẢN 8 (bổ sung) — MỞ RỘNG NGANG & GIẢM TẢI: nhân bản booking-service, cache-aside đỡ lượt đọc
//   node demo/08-mo-rong.mjs            (nhân bản trên máy này lên 3)
//   node demo/08-mo-rong.mjs --reset    (đưa về 1 bản sao)
import path from 'node:path';
import { banner, step, info, ok, bad, note, cmd, conclude, c, docker, get, book, resetData, cluster, bookingContainers, sleep, pause, main, table, localNodes, NODES, ROOT, waitFor } from './lib.mjs';

const scale = (n, count) => docker('compose', '-f', path.join(ROOT, 'deploy', `node${n}`, 'docker-compose.yml'), '--env-file', path.join(ROOT, 'deploy', 'cluster.env'),
  'up', '-d', '--no-recreate', '--scale', `booking-service=${count}`, 'booking-service');
const healthy = (n) => bookingContainers(n).filter((ct) => docker('inspect', '-f', '{{.State.Health.Status}}', ct) === 'healthy');

main(async () => {
  const n = localNodes().find((x) => x !== 3); // chạy trên máy 1 hoặc máy 2 (nơi có bộ service)
  if (!n) throw new Error('Kịch bản này chạy trên MÁY 1 hoặc MÁY 2 (nơi có bộ service)');
  if (process.argv.includes('--reset')) { scale(n, 1); ok(`Đã đưa booking-service ${NODES[n].label} về 1 bản sao.`); return; }
  const gw = NODES[n].gw;
  banner('08', 'NHÂN BẢN DỊCH VỤ & GIẢM TẢI CSDL', 'Scalability: scale-out phi trạng thái + Nginx gRPC LB + Redis cache-aside');

  step(1, `Nhân bản booking-service trên ${NODES[n].label} lên 3 container — không sửa một dòng code`);
  cmd(`docker compose -f deploy/node${n}/docker-compose.yml up -d --scale booking-service=3`);
  scale(n, 3);
  info('Đang chờ 3 bản sao báo healthy…');
  await waitFor(() => healthy(n).length >= 3, 120000, 1500);
  table(healthy(n).map((ct) => [ct, docker('inspect', '-f', '{{.Config.Hostname}}', ct), docker('inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', ct)]),
    ['Bản sao', 'Hostname', 'IP nội bộ']);
  await sleep(5000); // DNS nội bộ Docker cập nhật để Nginx thấy bản sao mới
  await pause();

  step(2, 'Gửi 12 lượt đặt vé — Nginx gRPC LB chia cho các bản sao');
  const counts = {};
  let fail = 0;
  for (let i = 1; i <= 12; i++) {
    await resetData(gw);
    const r = await book(`Scale_${i}`, '20', gw);
    if (r.status === 201) counts[r.data.processedByHost] = (counts[r.data.processedByHost] || 0) + 1;
    else fail++;
  }
  table(Object.entries(counts).map(([h, k]) => [h, `${'█'.repeat(k * 2)} ${k}`]), ['booking-service (hostname)', 'Số lượt xử lý']);
  fail ? bad(`${fail} lượt lỗi`) : ok(`12/12 thành công, tải trải trên ${Object.keys(counts).length} bản sao.`);
  await pause();

  step(3, 'Giảm tải CSDL: 200 lượt xem sơ đồ ghế cùng lúc');
  const s0 = (await cluster(gw)).inventory.stats;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: 200 }, () => get(`${gw}/movies/1`, 10000)));
  const ms = Math.round(performance.now() - t0);
  const s1 = (await cluster(gw)).inventory.stats;
  const hits = s1.cacheHits - s0.cacheHits;
  const misses = s1.cacheMisses - s0.cacheMisses;
  table([
    ['Trả từ Redis (cache hit)', hits, `${((hits / (hits + misses)) * 100).toFixed(1)} %`],
    ['Phải truy vấn PostgreSQL', misses, `${((misses / (hits + misses)) * 100).toFixed(1)} %`],
  ], ['200 lượt đọc', 'Số lượt', 'Tỉ lệ']);
  ok(`200 lượt đọc trong ${ms} ms — CSDL chỉ phải trả lời ${misses} lần; lượt đọc đó lại đi vào bản sao tại chỗ, không chạm Primary.`);

  conclude([
    'booking-service phi trạng thái (dữ liệu ở CSDL) ⇒ thêm bản sao chỉ bằng một lệnh, LB tự phân phối.',
    'Cache-aside (TTL 15 s) chặn phần lớn lượt đọc trước khi tới CSDL; phần còn lại đọc ở Standby (read/write splitting).',
    `Đưa về 1 bản sao: ${c.bold('node demo/08-mo-rong.mjs --reset')}`,
  ]);
});
