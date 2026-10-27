// MENU DEMO — node demo/run.mjs            (chọn kịch bản theo số)
//             node demo/run.mjs 5          (chạy thẳng kịch bản 5)
//             node demo/run.mjs all --auto (chạy toàn bộ, không dừng — dùng khi tập dượt trên 1 máy)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT, c, GATEWAY, localNodes } from './lib.mjs';

// [mã, file, tiêu đề, đặc trưng, chạy trên máy]
export const SCENARIOS = [
  ['00', '00-preflight.mjs', 'Kiểm tra cụm 3 máy trước khi demo', '—', 'Node 3'],
  ['01', '01-trong-suot.mjs', 'Một địa chỉ duy nhất — 2 máy vật lý phía sau', 'Transparency', 'Node 3'],
  ['02', '02-dong-thoi.mjs', '10 khách ở 2 máy giành ghế cuối A20 (pessimistic/optimistic)', 'Concurrency', 'Node 3'],
  ['03', '03-hang-doi.mjs', 'Dịch vụ email & RabbitMQ chết từng phần — không mất email', 'Fault tolerance + Async', 'Node 3 (+máy 1, 2)'],
  ['04', '04-split-brain.mjs', 'Đứt mạng máy 1 ↔ máy 2 — Node 3 phủ quyết, không 2 Primary', 'Split-brain / Quorum', 'Node 3 (+máy 2)'],
  ['05', '05-failover.mjs', 'Primary sập — máy 2 tự thăng cấp, khách vẫn đặt vé', 'Auto-failover', 'Node 3 (+máy 1)'],
  ['06', '06-cache-ma.mjs', 'Bán ở máy 1 — máy 2 thấy ngay (chống vé ma)', 'Replication / Cache sync', 'Node 3'],
  ['07', '07-dong-ho.mjs', 'Mỗi máy một đồng hồ — đo lệch bằng Cristian', 'No global clock', 'Node 3'],
  ['08', '08-mo-rong.mjs', 'Nhân bản booking-service ×3 + cache giảm tải (bổ sung)', 'Scalability', 'máy 1'],
  ['09', '09-circuit-breaker.mjs', 'Dịch vụ kho ghế chết — ngắt mạch tự bảo vệ (bổ sung)', 'Circuit breaker', 'máy 1'],
  ['10', '10-co-lap-may1.mjs', 'Tắt Wi-Fi máy 1 — máy 1 tự chặn ghi, máy 2 lên thay (bổ sung)', 'Partition + fencing', 'Node 3 (+máy 1)'],
];

const extra = process.argv.slice(3);
const run = (file) => spawnSync(process.execPath, [path.join(ROOT, 'demo', file), ...extra], { stdio: 'inherit' }).status;

function menu() {
  console.log('\n' + c.bold(c.red('  DEMO HỆ THỐNG ĐẶT VÉ XEM PHIM PHÂN TÁN — CỤM 3 MÁY')));
  console.log(c.gray(`  Điểm vào cho client: ${GATEWAY} · máy này đang chạy node: ${localNodes().join(', ') || '—'}\n`));
  for (const [id, , title, trait, where] of SCENARIOS) console.log(`  ${c.bold(c.cyan(id))}  ${title.padEnd(62)} ${c.gray(trait.padEnd(24))} ${where.includes('+') ? c.yellow(where) : c.gray(where)}`);
  console.log();
}

const arg = process.argv[2];
if (arg === 'all') {
  for (const [, file] of SCENARIOS) {
    // Kịch bản 10 cần Primary ở máy 1, nhưng kịch bản 05 đã chuyển Primary sang máy 2
    if (file.startsWith('10-')) spawnSync(process.execPath, [path.join(ROOT, 'deploy', 'cluster.mjs'), 'failback'], { stdio: 'inherit' });
    if (run(file) !== 0) process.exit(1);
  }
} else if (arg) {
  const s = SCENARIOS.find(([id]) => Number(id) === Number(arg));
  if (!s) { menu(); process.exit(1); }
  process.exit(run(s[1]));
} else {
  menu();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(c.bold('  Chọn kịch bản (số, Enter để thoát): '), (ans) => {
    rl.close();
    const s = SCENARIOS.find(([id]) => ans.trim() !== '' && Number(id) === Number(ans));
    if (s) process.exit(run(s[1]));
  });
}
