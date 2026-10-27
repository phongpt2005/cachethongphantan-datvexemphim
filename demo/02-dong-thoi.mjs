// KỊCH BẢN 2 — KIỂM SOÁT ĐỒNG THỜI: 10 khách ở 2 máy cùng giành ghế cuối A20
//   node demo/02-dong-thoi.mjs
import { banner, step, info, ok, bad, note, cmd, conclude, c, post, book, resetData, cluster, pause, main, table, NODES } from './lib.mjs';

async function race(label) {
  await resetData();
  info('Đã reset: chỉ ghế A20 còn trống.');
  const t0 = performance.now();
  // 5 khách vào qua máy 1, 5 khách vào qua máy 2 — bắn cùng một lúc
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => {
    const node = (i % 2) + 1;
    return book(`${label}_${String(i + 1).padStart(2, '0')}`, '20', NODES[node].gw).then((r) => ({ i: i + 1, node, ...r }));
  }));
  const total = Math.round(performance.now() - t0);
  table(results.map((r) => [
    `Khách ${String(r.i).padStart(2, '0')}`,
    r.node === 1 ? c.cyan('MÁY 1') : c.magenta('MÁY 2'),
    r.status === 201 ? c.green('201 Created') : r.status === 409 ? c.red('409 Conflict') : c.yellow(String(r.status)),
    `${r.ms} ms`,
    r.status === 201 ? `vé ${r.data.bookingId.slice(0, 8)}…` : String(r.data.message || '').slice(0, 64),
  ]), ['Khách', 'Vào qua', 'Kết quả', 'Độ trễ', 'Chi tiết']);
  const won = results.filter((r) => r.status === 201).length;
  const lost = results.filter((r) => r.status === 409).length;
  const seat = (await cluster(NODES[1].gw)).inventory.db.write.seatA20;
  info(`Tổng ${total} ms · ${c.bold(won)} thành công · ${c.bold(lost)} bị từ chối · trạng thái A20 trong CSDL Primary: ${c.bold(seat)}`);
  won === 1 && lost === 9 ? ok('Không bán trùng: đúng 1 khách giữ được A20 dù yêu cầu đến từ 2 máy khác nhau.') : bad('Kết quả bất thường — kiểm tra lại cụm.');
  return results;
}

async function setStrategy(mode) {
  for (const n of [1, 2]) {
    const r = await post(`${NODES[n].gw}/lab/lock-strategy?mode=${mode}`);
    info(`${NODES[n].label}: inventory-service → ${c.bold(String(r.data.lockStrategy).toUpperCase())}`);
  }
}

main(async () => {
  banner('02', '10 KHÁCH — 2 MÁY — 1 GHẾ CUỐI', 'Concurrency control: Pessimistic & Optimistic locking');

  step(1, 'PESSIMISTIC LOCKING — SELECT … FOR UPDATE');
  await setStrategy('pessimistic');
  cmd('10 × POST /booking (5 qua máy 1, 5 qua máy 2) cùng lúc bằng Promise.all');
  await race('Pess');
  note('Giao dịch đầu tiên khoá dòng ghế A20 trên Primary; 9 giao dịch còn lại phải CHỜ khoá, rồi thấy ghế đã "booked".');
  await pause();

  step(2, 'OPTIMISTIC LOCKING — UPDATE … WHERE version = v');
  await setStrategy('optimistic');
  await race('Opt');
  note('Không khoá trước: ai UPDATE trước thì version 1→2; người đến sau thấy version đã đổi (affected = 0) → bị huỷ.');
  await setStrategy('pessimistic');
  info(c.gray('Đã đặt lại PESSIMISTIC cho các kịch bản sau.'));

  conclude([
    'Hai máy chạy hai bản inventory-service độc lập nhưng mọi lệnh GHI đều về một Primary → một nơi phân xử duy nhất.',
    'Pessimistic: an toàn khi tranh chấp cao (mở bán vé hot). Optimistic: nhẹ hơn khi ít tranh chấp, không giữ khoá.',
    'Thứ tự ai thắng do CSDL quyết định (khoá/phiên bản), không dựa vào đồng hồ của từng máy (xem kịch bản 07).',
  ]);
});
