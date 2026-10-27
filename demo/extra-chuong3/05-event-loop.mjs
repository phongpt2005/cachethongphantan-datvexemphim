// KỊCH BẢN 5 — LỜI GỌI CHẶN LÀM ĐỨNG CẢ TIẾN TRÌNH (và cách luồng cứu nó)
// Đo nhịp tim GET /health mỗi 100 ms, trong lúc gateway:
//   (1) chạy tính toán 3 s NGAY TRÊN luồng event loop   → mọi yêu cầu khác phải chờ
//   (2) chạy cùng tính toán trong một WORKER THREAD      → server vẫn phản hồi bình thường
//   node demo/extra-chuong3/05-event-loop.mjs
import { banner, step, info, note, conclude, c, get, sleep, pause, main } from '../lib.mjs';

async function heartbeat(durationMs, job) {
  const samples = [];
  const t0 = Date.now();
  const timer = setInterval(async () => {
    const sent = Date.now() - t0;
    const t = performance.now();
    try { await get('/health', 10000); } catch {}
    samples.push({ at: sent, ms: Math.round(performance.now() - t) });
  }, 100);
  await sleep(500);
  const r = await job();
  await sleep(Math.max(0, durationMs - (Date.now() - t0)));
  clearInterval(timer);
  await sleep(300);
  return { samples: samples.sort((a, b) => a.at - b.at), result: r.data };
}

function chart(samples) {
  // Mỗi ký tự = 1 nhịp 100 ms; chiều cao theo độ trễ
  const levels = [[20, c.green('▁')], [100, c.green('▂')], [500, c.yellow('▄')], [1500, c.red('▆')], [Infinity, c.red('█')]];
  const sym = (ms) => levels.find(([lim]) => ms <= lim)[1];
  return samples.map((s) => sym(s.ms)).join('');
}

function report(label, { samples, result }) {
  const max = Math.max(...samples.map((s) => s.ms));
  const slow = samples.filter((s) => s.ms > 100).length;
  console.log(`  ${chart(samples)}`);
  info(`${label}: tác vụ ${result.tookMs} ms trên ${c.bold(result.thread)}`);
  info(`Nhịp /health chậm nhất: ${c.bold(max > 500 ? c.red(max + ' ms') : c.green(max + ' ms'))} · số nhịp > 100 ms: ${slow}/${samples.length}`);
  return max;
}

main(async () => {
  banner('05', 'MỘT LỜI GỌI CHẶN = CẢ TIẾN TRÌNH ĐỨNG HÌNH', 'mục 3.1.1 (blocking system call) & 3.1.2 (máy trạng thái hữu hạn vs đa luồng)');
  info(c.gray('Chú giải: ▁ < 20 ms   ▂ < 100 ms   ▄ < 500 ms   ▆ < 1,5 s   █ ≥ 1,5 s   (mỗi ký tự = một nhịp 100 ms)'));

  step(1, 'Tính toán 3 giây TRÊN luồng event loop của api-gateway  (GET /lab/block?ms=3000)');
  const a = report('Chặn', await heartbeat(5000, () => get('/lab/block?ms=3000')));
  note('Suốt 3 giây không yêu cầu nào được phục vụ — kể cả health check. Với hệ thống thật: không ai đặt được vé.');
  await pause();

  step(2, 'Cùng tác vụ, nhưng giao cho WORKER THREAD  (GET /lab/offload?ms=3000)');
  const b = report('Worker', await heartbeat(5000, () => get('/lab/offload?ms=3000')));
  note('Luồng event loop rảnh tay: vẫn nhận và trả lời yêu cầu trong lúc worker tính toán.');

  conclude([
    `Độ trễ tối đa: ${a} ms (chặn) so với ${b} ms (worker thread).`,
    'Giống ví dụ bảng tính trong giáo trình: tách luồng giao tiếp và luồng tính toán để chương trình luôn phản hồi.',
    'Bài học thiết kế cho hệ thống đặt vé: event loop chỉ làm I/O không chặn; việc nặng (xuất PDF vé, mã hoá…) đẩy sang worker hoặc service riêng qua hàng đợi.',
  ]);
});
