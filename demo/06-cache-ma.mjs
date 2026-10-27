// KỊCH BẢN 6 — CHỐNG BÁN VÉ MA: bán ghế ở máy 1, máy 2 thấy "đã bán" ngay lập tức
// Redis Master (máy 1) stream lệnh DEL cache sang Redis Replica (máy 2); CSDL Standby nhận WAL.
//   node demo/06-cache-ma.mjs
import { banner, step, info, ok, bad, note, cmd, conclude, c, get, book, resetData, cluster, pause, main, table, NODES } from './lib.mjs';

const seatOn = async (node) => {
  const r = await get(`${NODES[node].gw}/movies/1`, 4000);
  return r.data.seats.find((s) => s.id === '20')?.status;
};

main(async () => {
  banner('06', 'BÁN Ở MÁY 1 — MÁY 2 CÓ CÒN "THẤY" GHẾ TRỐNG KHÔNG?', 'Replication & consistency: Redis Master→Replica, PostgreSQL WAL streaming');

  step(1, 'Mỗi máy đọc dữ liệu ở đâu?');
  const [c1, c2] = await Promise.all([cluster(NODES[1].gw), cluster(NODES[2].gw)]);
  table([[1, c1], [2, c2]].map(([n, cl]) => [NODES[n].label, `Redis ${cl.inventory.redis.read.role}${cl.inventory.redis.read.link ? ' (link ' + cl.inventory.redis.read.link + ')' : ''}`, `PostgreSQL ${cl.inventory.db.read.role}`, `Redis ${cl.inventory.redis.write.role} + PostgreSQL ${cl.inventory.db.write.role}`]),
    ['Máy', 'Đọc cache', 'Đọc CSDL', 'Ghi / xoá cache vào']);
  note('Máy 2 đọc từ bản sao ngay tại chỗ (nhanh, giảm tải máy 1) — câu hỏi là: bản sao có kịp cập nhật không?');
  await pause();

  step(2, 'Khách ở máy 2 mở sơ đồ ghế → dữ liệu được nạp vào cache');
  await resetData(NODES[1].gw);
  const before = await seatOn(2);
  const warm = await cluster(NODES[2].gw);
  info(`Máy 2 thấy A20 = ${c.bold(c.green(before))} · cache seats:1 có trên Redis Replica máy 2: ${c.bold(warm.inventory.redis.read.cachedSeats)}`);
  await pause();

  step(3, 'Khách ở máy 1 mua A20 — ngay sau đó hỏi máy 2 liên tục');
  cmd(`POST ${NODES[1].gw}/booking  →  GET ${NODES[2].gw}/movies/1 (lặp tới khi thấy "booked")`);
  const r = await book(`Mua_o_may1_${Date.now().toString().slice(-4)}`, '20', NODES[1].gw);
  const t0 = performance.now();
  let seen = await seatOn(2);
  let polls = 1;
  while (seen !== 'booked' && performance.now() - t0 < 5000) { seen = await seatOn(2); polls++; }
  const lag = Math.round(performance.now() - t0);
  info(`Máy 1: HTTP ${c.bold(r.status)} — đã bán A20`);
  seen === 'booked'
    ? ok(`Máy 2 thấy A20 = ${c.bold(c.red('booked'))} sau ${c.bold(lag + ' ms')} (${polls} lần hỏi) — không có "vé ma".`)
    : bad(`Sau ${lag} ms máy 2 vẫn thấy A20 = ${seen}`);
  const r2 = await book(`Mua_o_may2_${Date.now().toString().slice(-4)}`, '20', NODES[2].gw);
  info(`Khách ở máy 2 cố đặt A20: HTTP ${c.bold(r2.status)} — ${r2.data.message || ''}`);
  await pause();

  step(4, 'Điều gì xảy ra nếu KHÔNG đồng bộ cache?');
  console.log(c.gray(`
     Máy 1: bán A20 → DEL seats:1 chỉ trên Redis riêng của máy 1
     Máy 2: Redis riêng vẫn giữ bản cũ "A20 available" tới khi hết TTL (15 s)
            → khách máy 2 thấy ghế trống, bấm mua → lỗi / tệ hơn: bán trùng  ⇒  "VÉ MA"
     Giải pháp ở đây: chỉ có MỘT Redis Master nhận ghi/xoá; Replica máy 2 nhận cùng lệnh DEL qua replication stream.`));

  conclude([
    'Nhân bản dữ liệu giúp đọc nhanh tại chỗ và giảm tải, nhưng tạo ra nguy cơ đọc dữ liệu cũ (stale read).',
    'Một nơi ghi duy nhất (Master/Primary) + đẩy thay đổi sang bản sao trong vài ms → nhất quán gần như tức thời.',
    'Dù cache có trễ, lớp cuối vẫn an toàn: lệnh đặt vé luôn kiểm tra và khoá trên Primary (kịch bản 02).',
  ]);
});
