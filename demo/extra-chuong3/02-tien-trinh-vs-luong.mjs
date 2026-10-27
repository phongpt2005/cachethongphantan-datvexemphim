// KỊCH BẢN 2 — TIẾN TRÌNH vs LUỒNG (tái hiện Hình 3.3 & 3.4 của giáo trình bằng Node.js)
// Hai tiến trình "eve" và "bob", mỗi tiến trình 3 luồng. Biến shared_x:
//   - DÙNG CHUNG giữa các luồng trong cùng một tiến trình,
//   - KHÔNG dùng chung giữa hai tiến trình (mỗi tiến trình có không gian địa chỉ riêng).
//   node demo/extra-chuong3/02-tien-trinh-vs-luong.mjs
import { fork } from 'node:child_process';
import { Worker, isMainThread, workerData, threadId } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ts = () => new Date().toISOString().slice(14, 19); // mm:ss giống giáo trình
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------------- LUỒNG (worker thread) ----------------
if (!isMainThread) {
  const { name, shared } = workerData;
  const shared_x = new Int32Array(shared);
  const s = rnd(1, 5);
  console.log(`${ts()}   ${name} (thread #${threadId}) ngủ ${s} giây`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000); // "sleep" chặn đúng luồng này
  const v = Atomics.add(shared_x, 0, 1) + 1; // shared_x = shared_x + 1 (nguyên tử)
  console.log(`${ts()}   ${name} thức dậy, thấy shared_x = ${v}`);
}

// ---------------- TIẾN TRÌNH CON (eve / bob) ----------------
else if (process.argv[2] === '--child') {
  const name = process.argv[3];
  const shared = new SharedArrayBuffer(4);
  const shared_x = new Int32Array(shared);
  shared_x[0] = rnd(10, 99);
  console.log(`${ts()} [${name}] PID=${process.pid} — tiến trình ${name} khởi tạo shared_x = ${shared_x[0]}`);
  const threads = [0, 1, 2].map((i) => new Worker(SELF, { workerData: { name: `${name} ${i}`, shared } }));
  await Promise.all(threads.map((t) => new Promise((r) => t.on('exit', r))));
  console.log(`${ts()} [${name}] PID=${process.pid} — kết thúc, shared_x = ${shared_x[0]}  (= ban đầu + 3)`);
}

// ---------------- TIẾN TRÌNH CHÍNH ----------------
else {
  const { banner, step, conclude, note, c } = await import('../lib.mjs');
  banner('02', 'TIẾN TRÌNH vs LUỒNG — biến shared_x được chia sẻ tới đâu?', 'mục 3.1.1, Hình 3.3–3.4 (ví dụ eve/bob)');
  step(1, `Tiến trình cha PID=${process.pid} tạo 2 tiến trình con (fork), mỗi con tạo 3 luồng`);
  console.log(c.gray('  Mỗi luồng ngủ ngẫu nhiên rồi tăng shared_x thêm 1.\n'));
  const procs = ['eve', 'bob'].map((n) => fork(SELF, ['--child', n], { stdio: 'inherit' }));
  await Promise.all(procs.map((p) => new Promise((r) => p.on('exit', r))));
  note('Trong cùng tiến trình, 3 luồng thấy shared_x tăng dần: họ dùng CHUNG một vùng nhớ.');
  note('eve và bob có shared_x khác nhau: mỗi tiến trình có không gian địa chỉ RIÊNG do hệ điều hành bảo vệ.');
  note('Khi một luồng ngủ (lời gọi chặn), các luồng khác của cùng tiến trình vẫn chạy (one-to-one threading).');
  conclude([
    'Ngữ cảnh luồng ⊂ ngữ cảnh tiến trình: luồng chỉ cần thanh ghi + stack, chia sẻ heap ⇒ tạo/chuyển nhanh.',
    'Cái giá: lập trình viên tự bảo vệ dữ liệu chung (ở đây dùng Atomics.add, tức thao tác nguyên tử).',
    'Tiến trình: an toàn hơn nhờ cách ly phần cứng (MMU), nhưng giao tiếp tốn kém (IPC, chuyển ngữ cảnh).',
  ]);
}
