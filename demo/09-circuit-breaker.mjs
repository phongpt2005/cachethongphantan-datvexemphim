// KỊCH BẢN 9 (bổ sung) — CIRCUIT BREAKER: dịch vụ phụ thuộc chết -> ngắt mạch, trả lời ngay thay vì treo
//   node demo/09-circuit-breaker.mjs
import { banner, step, info, ok, bad, note, cmd, conclude, c, docker, get, pause, main, table, localNodes, NODES, waitFor } from './lib.mjs';

main(async () => {
  const n = localNodes().find((x) => x !== 3); // chạy trên máy 1 hoặc máy 2 (nơi có bộ service)
  if (!n) throw new Error('Kịch bản này chạy trên MÁY 1 hoặc MÁY 2 (nơi có bộ service)');
  const gw = NODES[n].gw;
  const inv = `inventory-node${n}`;
  const state = async () => (await get(`${gw}/health/deep`, 3000)).data.circuits.inventory;
  banner('09', 'DỊCH VỤ KHO GHẾ CHẾT — GATEWAY TỰ NGẮT MẠCH', 'Fault tolerance: Circuit Breaker (CLOSED → OPEN → HALF_OPEN) + retry backoff');

  step(1, `Bình thường: circuit = ${c.green((await state()).state)}`);
  cmd(`docker stop ${inv}`);
  docker('stop', inv);
  ok(`${inv}: STOPPED`);
  await pause();

  step(2, 'Khách tiếp tục mở sơ đồ ghế');
  const rows = [];
  for (let i = 1; i <= 8; i++) {
    const r = await get(`${gw}/movies/1`, 15000);
    const cb = await state();
    rows.push([i, r.data.error === 'Circuit Breaker Open' ? c.yellow('fallback') : r.status === 200 ? c.green(r.status) : c.red(r.status), `${r.ms} ms`, cb.state === 'OPEN' ? c.red(cb.state) : cb.state, String(r.data.message || r.data.error || '').slice(0, 58)]);
  }
  table(rows, ['Lượt', 'Kết quả', 'Độ trễ', 'Circuit', 'Thông điệp']);
  ok('5 lỗi hạ tầng liên tiếp → OPEN: gateway trả lời ngay trong vài ms, không dồn request vào dịch vụ đang chết.');
  note('Ngăn sập dây chuyền: nếu mỗi request treo vài giây, luồng/kết nối của gateway sẽ cạn và kéo sập cả gateway.');
  await pause();

  step(3, 'Dịch vụ phục hồi — circuit tự thăm dò rồi đóng lại');
  cmd(`docker start ${inv}`);
  docker('start', inv);
  await waitFor(async () => (await get(`http://${NODES[n].ip}:${n === 1 ? 3000 : 3100}/health`)).status === 200 && docker('inspect', '-f', '{{.State.Health.Status}}', inv) === 'healthy', 90000, 1000);
  info(`${inv} healthy. Chờ hết thời gian OPEN (15 s) để circuit chuyển HALF_OPEN…`);
  await waitFor(async () => {
    const r = await get(`${gw}/movies/1`, 10000);
    const cb = await state();
    info(`  GET /movies/1 → ${r.data.success ? c.green('OK') : c.yellow(r.data.error || r.status)} · circuit ${cb.state}`);
    return cb.state === 'CLOSED' && r.data.success;
  }, 60000, 3000);
  (await state()).state === 'CLOSED' ? ok('HALF_OPEN → 2 lượt thử thành công → CLOSED. Hệ thống tự lành, không cần khởi động lại gateway.') : bad('Circuit chưa đóng lại');

  conclude([
    'Circuit breaker là máy trạng thái: CLOSED (bình thường) → OPEN (chặn, trả fallback) → HALF_OPEN (thử) → CLOSED.',
    'Kết hợp hạn chót gRPC 3 s + retry có backoff: lỗi thoáng qua được thử lại, lỗi kéo dài thì ngắt mạch.',
    'Lỗi nghiệp vụ (409 ghế đã bán) không bị tính là sự cố — chỉ lỗi hạ tầng (5xx) mới làm mạch mở.',
  ]);
});
