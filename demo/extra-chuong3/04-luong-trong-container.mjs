// KỊCH BẢN 4 — "NODE.JS ĐƠN LUỒNG" THỰC RA CÓ BAO NHIÊU LUỒNG NHÂN?
// Đọc /proc/1/task bên trong từng container của hệ thống, rồi quan sát luồng mới sinh ra khi gateway dùng worker thread.
//   node demo/extra-chuong3/04-luong-trong-container.mjs
import { banner, step, info, ok, note, cmd, conclude, c, dexec, nodeContainers, get, pause, sleep, main, table } from '../lib.mjs';

const threadCount = (ct) => Number(dexec(ct, 'ls /proc/1/task | wc -l'));

main(async () => {
  banner('04', 'LUỒNG NHÂN THẬT CỦA CÁC TIẾN TRÌNH TRONG HỆ THỐNG', 'mục 3.1.1 – Thread implementation (user-level vs kernel-level, one-to-one)');

  step(1, 'Đếm luồng nhân của tiến trình chính (PID 1) trong mỗi container');
  cmd('docker exec <container> sh -c "ls /proc/1/task | wc -l; grep Threads /proc/1/status"');
  const rows = nodeContainers().map((ct) => {
    const comm = dexec(ct, 'cat /proc/1/comm');
    const n = threadCount(ct);
    const vm = dexec(ct, "grep -E 'VmRSS' /proc/1/status | awk '{print $2}'");
    return [ct.replace('cachethongphantan-datvexemphim-', ''), comm, n, `${Math.round(vm / 1024)} MiB`];
  });
  table(rows, ['Container', 'Tiến trình PID 1', 'Số luồng nhân', 'RSS']);
  note('Mỗi tiến trình Node.js có ~10 luồng nhân: 1 luồng JavaScript (event loop) + libuv threadpool (4) + luồng nền của V8 (GC, JIT) + luồng tín hiệu.');
  note('Linux dùng mô hình one-to-one (NPTL): mỗi luồng là một thực thể được kernel lập lịch ⇒ lời gọi chặn chỉ chặn luồng đó.');
  await pause();

  step(2, 'Gateway giao một tác vụ 3 giây cho worker thread — đếm lại số luồng trong lúc chạy');
  const before = threadCount('api-gateway');
  info(`Trước: api-gateway có ${c.bold(before)} luồng`);
  cmd('curl "localhost:3000/lab/offload?ms=3000"   (chạy nền)');
  const job = get('/lab/offload?ms=3000');
  await sleep(800);
  const during = threadCount('api-gateway');
  info(`Trong lúc worker chạy: ${c.bold(c.yellow(during))} luồng  (${during > before ? '+' + (during - before) : '±0'})`);
  const res = await job;
  await sleep(1000);
  const after = threadCount('api-gateway');
  info(`Sau khi xong: ${c.bold(after)} luồng — tác vụ chạy trên ${res.data.thread}, mất ${res.data.tookMs} ms`);
  if (during > before) ok('Worker thread của Node.js = một luồng nhân mới do hệ điều hành tạo và lập lịch (one-to-one).');

  conclude([
    '“Node.js đơn luồng” chỉ đúng với mã JavaScript; bản thân tiến trình là đa luồng ở mức nhân.',
    'Thư viện libuv dùng threadpool để biến lời gọi chặn của hệ điều hành (DNS, file, crypto) thành không chặn cho event loop.',
    'Ngữ cảnh luồng nằm trong ngữ cảnh tiến trình: tạo thêm luồng không cần không gian địa chỉ mới, chỉ thêm stack + thanh ghi.',
  ]);
});
