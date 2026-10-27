// KỊCH BẢN 3 — BA CÁCH XÂY DỰNG SERVER (Hình 3.6 & 3.7 của giáo trình)
// Mỗi yêu cầu cần một thao tác "đọc đĩa" mất 200 ms. Gửi 16 yêu cầu đồng thời tới:
//   (A) Server đơn luồng, lời gọi CHẶN          → xử lý lần lượt từng yêu cầu
//   (B) Server đa luồng dispatcher/worker        → 8 worker chặn song song
//   (C) Server máy trạng thái hữu hạn (event)    → 1 luồng, lời gọi KHÔNG chặn (kiểu Node.js)
//   node demo/extra-chuong3/03-mo-hinh-server.mjs
import http from 'node:http';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const DISK_MS = 200;
const N_REQ = 16;
const POOL = 8;
const blockingDiskRead = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); // chặn thật luồng gọi

// ---------- worker thread của server (B) ----------
if (!isMainThread) {
  parentPort.on('message', ({ id }) => {
    blockingDiskRead(DISK_MS); // worker được phép chặn: chỉ luồng này ngủ
    parentPort.postMessage({ id });
  });
} else {
  const { banner, step, info, note, conclude, table, c, pause } = await import('../lib.mjs');

  // (A) đơn luồng + chặn: Node không có "đọc đĩa chặn" sẵn cho HTTP, nên mô phỏng bằng Atomics.wait trên luồng chính
  function singleThreaded() {
    return http.createServer((req, res) => { blockingDiskRead(DISK_MS); res.end('ok'); });
  }

  // (B) dispatcher (luồng chính nhận yêu cầu) + pool worker (mỗi worker chặn độc lập)
  function multiThreaded() {
    const workers = Array.from({ length: POOL }, () => new Worker(fileURLToPath(import.meta.url)));
    const idle = [...workers];
    const queue = [];
    const pending = new Map();
    let nextId = 0;
    const dispatch = () => {
      while (idle.length && queue.length) {
        const w = idle.pop();
        const job = queue.shift();
        pending.set(job.id, { res: job.res, w });
        w.postMessage({ id: job.id });
      }
    };
    workers.forEach((w) => w.on('message', ({ id }) => {
      const { res } = pending.get(id); pending.delete(id);
      res.end('ok'); idle.push(w); dispatch();
    }));
    const server = http.createServer((req, res) => { queue.push({ id: nextId++, res }); dispatch(); });
    server.on('close', () => workers.forEach((w) => w.terminate()));
    // Pool được tạo sẵn trước khi nhận yêu cầu (giống server thật khởi động pool lúc boot)
    server.ready = Promise.all(workers.map((w) => new Promise((r) => w.once('online', r))));
    return server;
  }

  // (C) máy trạng thái hữu hạn: ghi nhớ trạng thái yêu cầu, phát lệnh I/O không chặn rồi phục vụ yêu cầu khác
  function finiteStateMachine() {
    return http.createServer((req, res) => { setTimeout(() => res.end('ok'), DISK_MS); });
  }

  async function bench(server) {
    await server.ready;
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const agent = new http.Agent({ keepAlive: false, maxSockets: N_REQ });
    const once = () => new Promise((resolve, reject) => {
      const t = performance.now();
      http.get({ host: '127.0.0.1', port, agent }, (res) => { res.resume(); res.on('end', () => resolve(performance.now() - t)); }).on('error', reject);
    });
    const t0 = performance.now();
    const lat = await Promise.all(Array.from({ length: N_REQ }, once));
    const total = performance.now() - t0;
    await new Promise((r) => server.close(r));
    return { total, maxLat: Math.max(...lat), rps: (N_REQ / total) * 1000 };
  }

  banner('03', 'BA CÁCH XÂY DỰNG SERVER', 'mục 3.1.2 – Multithreaded servers, Hình 3.6 & 3.7');
  info(`Mỗi yêu cầu cần 1 lần "đọc đĩa" ${DISK_MS} ms. Gửi ${c.bold(N_REQ)} yêu cầu ĐỒNG THỜI tới từng kiểu server.`);

  const models = [
    ['Đơn luồng (single-threaded)', 'Không', 'Chặn', singleThreaded],
    [`Đa luồng (dispatcher + ${POOL} worker)`, 'Có', 'Chặn', multiThreaded],
    ['Máy trạng thái hữu hạn (event loop)', 'Có', 'Không chặn', finiteStateMachine],
  ];
  const rows = [];
  for (const [i, [name, par, call, make]] of models.entries()) {
    step(i + 1, name);
    const r = await bench(make());
    info(`Hoàn tất ${N_REQ} yêu cầu sau ${c.bold(Math.round(r.total) + ' ms')} — yêu cầu chậm nhất chờ ${Math.round(r.maxLat)} ms`);
    rows.push([name, par, call, `${Math.round(r.total)} ms`, `${r.rps.toFixed(1)} req/s`]);
  }
  await pause('Nhấn Enter để xem bảng tổng hợp (Hình 3.7)…');

  console.log();
  table(rows, ['Mô hình', 'Song song', 'Lời gọi hệ thống', `${N_REQ} yêu cầu`, 'Thông lượng']);
  note(`Đơn luồng ≈ ${N_REQ} × ${DISK_MS} ms: khi chờ đĩa, server "ngồi chơi", CPU rảnh mà không ai được phục vụ.`);
  note(`Đa luồng ≈ ${N_REQ}/${POOL} × ${DISK_MS} ms: code mỗi worker vẫn tuần tự, dễ viết; giới hạn bởi số worker.`);
  note('Máy trạng thái ≈ 1 × 200 ms: nhanh nhất nhưng code phải tách thành callback/async — đây chính là mô hình của Node.js mà cả hệ thống đặt vé đang dùng.');
  conclude([
    'Luồng giữ được sự đơn giản của lời gọi chặn mà vẫn có song song (Hình 3.7, dòng 1).',
    'Hệ thống đặt vé dùng NestJS/Node.js = mô hình máy trạng thái hữu hạn: I/O tới PostgreSQL, gRPC, RabbitMQ đều không chặn.',
    'Điểm yếu của mô hình này: một tác vụ CPU nặng sẽ chặn cả tiến trình → xem kịch bản 5.',
  ]);
}
