// KỊCH BẢN 7 — KHÔNG CÓ ĐỒNG HỒ CHUNG: đo độ lệch đồng hồ 2 máy bằng thuật toán Cristian
//   node demo/07-dong-ho.mjs
import { banner, step, info, ok, note, cmd, conclude, c, get, book, resetData, pause, main, table, NODES, REHEARSAL } from './lib.mjs';

// Cristian: gửi lúc t0, server trả thời gian T, nhận lúc t1 -> lệch ≈ T - (t0+t1)/2, sai số ±(t1-t0)/2
async function cristian(url, samples = 8) {
  let best = null;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const r = await get(url, 3000);
    const t1 = Date.now();
    const T = Date.parse(r.data.timestamp);
    const rtt = t1 - t0;
    if (!best || rtt < best.rtt) best = { rtt, offset: T - (t0 + t1) / 2, T };
  }
  return best;
}

const fmt = (ms) => `${ms >= 0 ? '+' : ''}${ms.toFixed(1)} ms`;

main(async () => {
  banner('07', 'MỖI MÁY MỘT ĐỒNG HỒ — AI NÓI ĐÚNG GIỜ?', 'No global clock: clock skew, thuật toán Cristian, thứ tự nhân quả');

  step(1, 'Đo độ lệch đồng hồ của từng máy so với máy đang chạy demo (thuật toán Cristian, lấy mẫu RTT nhỏ nhất)');
  cmd('t0 = now();  T = GET /health → timestamp;  t1 = now();   lệch = T − (t0 + t1)/2  ± RTT/2');
  const m = {};
  for (const n of [1, 2]) m[n] = await cristian(`${NODES[n].gw}/health`);
  table([1, 2].map((n) => [NODES[n].label, NODES[n].ip, `${m[n].rtt} ms`, c.bold(fmt(m[n].offset)), `± ${(m[n].rtt / 2).toFixed(1)} ms`]),
    ['Máy', 'IP', 'RTT', 'Lệch so với máy demo', 'Sai số']);
  const skew = m[2].offset - m[1].offset;
  info(`Đồng hồ máy 2 lệch so với máy 1: ${c.bold(c.yellow(fmt(skew)))}  (sai số ± ${((m[1].rtt + m[2].rtt) / 2).toFixed(1)} ms)`);
  if (REHEARSAL) note('Đang tập dượt trên 1 laptop nên 2 "máy" dùng chung đồng hồ — trên 2 laptop thật độ lệch thường vài ms đến hàng trăm ms.');
  note('Không bao giờ đo được chính xác tuyệt đối: thời gian truyền mạng không biết trước → chỉ biết khoảng sai số ±RTT/2.');
  await pause();

  step(2, 'Một giao dịch, ba đồng hồ: dấu thời gian do những máy khác nhau ghi');
  await resetData();
  const sentAt = Date.now();
  const r = await book(`Clock_${Date.now().toString().slice(-4)}`, '20', NODES[2].gw);
  const recvAt = Date.now();
  const events = [
    ['Client gửi yêu cầu', 'máy demo', sentAt],
    ['Ghi vé vào CSDL (created_at)', 'PostgreSQL Primary — MÁY 1', Date.parse(r.data.createdAt)],
    ['booking-service trả kết quả', 'container booking — MÁY 2', Date.parse(r.data.timestamp)],
    ['Client nhận phản hồi', 'máy demo', recvAt],
  ];
  table(events.map(([what, clock, t]) => [what, clock, new Date(t).toISOString().slice(11, 23), `${t - sentAt >= 0 ? '+' : ''}${t - sentAt} ms`]),
    ['Sự kiện (theo đúng thứ tự nhân quả)', 'Đồng hồ của', 'Giờ ghi nhận', 'So với lúc gửi']);
  const ordered = events.every((e, i) => i === 0 || e[2] >= events[i - 1][2]);
  ordered
    ? ok('Lần này các dấu thời gian tình cờ đúng thứ tự — nhưng không có gì bảo đảm điều đó.')
    : ok(c.yellow('Dấu thời gian NGƯỢC thứ tự nhân quả: sự kiện xảy ra sau lại mang giờ sớm hơn — vì mỗi máy một đồng hồ.'));
  await pause();

  step(3, 'Vậy hệ thống phân xử "ai đặt trước" bằng gì?');
  console.log(c.gray(`
     ✘ Không dùng: "yêu cầu nào có timestamp nhỏ hơn thì thắng"  (đồng hồ 2 máy lệch nhau ${fmt(skew)})
     ✔ Dùng: thứ tự do MỘT nơi duy nhất quyết định — khoá dòng / phiên bản trên PostgreSQL Primary (kịch bản 02)
     ✔ Dùng: quan hệ nhân quả "xảy ra trước" (Lamport): gửi → nhận, publish → consume, commit → WAL → Standby`));

  conclude([
    'Mỗi máy có đồng hồ thạch anh riêng, trôi theo nhiệt độ; NTP chỉ kéo về gần đúng, không bao giờ trùng khớp.',
    'Đo độ lệch qua mạng luôn có sai số (Cristian: ±RTT/2) → không thể dựng một "đồng hồ toàn cục" chính xác.',
    'Hệ phân tán sắp thứ tự sự kiện bằng nhân quả và bằng một điểm phân xử chung, không bằng giờ vật lý.',
  ]);
});
