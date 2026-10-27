// Thư viện dùng chung cho các kịch bản demo (chỉ dùng module có sẵn của Node.js >= 18).
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUTO = process.argv.includes('--auto') || !process.stdin.isTTY;

// ---------- cấu hình cụm 2 máy (deploy/cluster.env) ----------
function readClusterEnv() {
  const file = path.join(ROOT, 'deploy', 'cluster.env');
  if (!fs.existsSync(file)) return null;
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => l.split('=').map((x) => x.trim())));
}
export const ENV = readClusterEnv();
export const REHEARSAL = !!ENV && ENV.NODE1_IP === ENV.NODE2_IP && ENV.NODE2_IP === ENV.NODE3_IP;
export const NODES = ENV ? {
  1: { id: 1, label: 'MÁY 1', ip: ENV.NODE1_IP, gw: `http://${ENV.NODE1_IP}:3000`, router: `http://${ENV.NODE1_IP}:8008/status`, pgInv: `${ENV.NODE1_IP}:5501`, pgBook: `${ENV.NODE1_IP}:5502`, rabbitUi: `http://${ENV.NODE1_IP}:15674` },
  2: { id: 2, label: 'MÁY 2', ip: ENV.NODE2_IP, gw: `http://${ENV.NODE2_IP}:3100`, router: `http://${ENV.NODE2_IP}:8018/status`, pgInv: `${ENV.NODE2_IP}:5511`, pgBook: `${ENV.NODE2_IP}:5512`, rabbitUi: `http://${ENV.NODE2_IP}:15684` },
  3: { id: 3, label: 'NODE 3', ip: ENV.NODE3_IP, lb: `http://${ENV.NODE3_IP}:8090`, witnessInv: `${ENV.NODE3_IP}:5503`, witnessBook: `${ENV.NODE3_IP}:5504`, rabbitUi: `http://${ENV.NODE3_IP}:15694` },
} : null;
// Điểm vào duy nhất của client: Frontend LB trên Node 3 (hoặc gateway đơn lẻ khi chạy docker-compose gốc)
const EXTRA = /extra-chuong3/.test(process.argv[1] || '');
export const GATEWAY = process.env.GATEWAY_URL || (ENV && !EXTRA ? `http://${ENV.NODE3_IP}:8090` : 'http://localhost:3000');

// ---------- màu terminal ----------
const wrap = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const c = {
  red: wrap('31'), green: wrap('32'), yellow: wrap('33'), blue: wrap('34'), magenta: wrap('35'),
  cyan: wrap('36'), gray: wrap('90'), bold: wrap('1'), dim: wrap('2'), inv: wrap('7'),
};

export function banner(code, title, trait) {
  const line = '═'.repeat(78);
  console.log('\n' + c.red(line));
  console.log(c.bold(c.red(` ${code} `)) + c.bold(title));
  if (trait) console.log(c.gray(` ${/^mục/.test(trait) ? "Lý thuyết" : "Đặc trưng"}: ${trait}`));
  console.log(c.red(line));
}

export function step(n, text) {
  console.log('\n' + c.bold(c.cyan(`▶ Bước ${n}. `)) + c.bold(text));
}

export const info = (s) => console.log('  ' + s);
export const ok = (s) => console.log('  ' + c.green('✔ ') + s);
export const bad = (s) => console.log('  ' + c.red('✘ ') + s);
export const note = (s) => console.log('  ' + c.yellow('💡 ') + s);
export const cmd = (s) => console.log('  ' + c.gray('$ ') + c.magenta(s));

export function conclude(lines) {
  console.log('\n' + c.bold(c.green('■ KẾT LUẬN')));
  lines.forEach((l) => console.log('  ' + c.green('•') + ' ' + l));
  console.log();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dừng chờ người thuyết trình bấm Enter (bỏ qua khi chạy --auto)
export async function pause(msg = 'Nhấn Enter để tiếp tục…') {
  if (AUTO) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question(c.dim(`\n  ⏎ ${msg}`), () => { rl.close(); r(); }));
}

// ---------- HTTP ----------
export async function http(method, url, body, timeoutMs = 15000) {
  const t0 = performance.now();
  const res = await fetch(url.startsWith('http') ? url : GATEWAY + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ms: Math.round(performance.now() - t0) };
}
export const get = (url, t) => http('GET', url, null, t);
export const post = (url, body, t) => http('POST', url, body, t);

export async function resetData(base = GATEWAY) {
  const r = await post(base + '/dev/reset');
  if (r.status !== 200) throw new Error(`Reset thất bại: HTTP ${r.status}`);
  return r;
}

export const book = (userName, seatId = '20', base = GATEWAY) => post(base + '/booking', { showtimeId: '1', seatId, userName });

// ---------- Docker ----------
export function sh(file, args, opts = {}) {
  return execFileSync(file, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
export const docker = (...args) => sh('docker', args);
export function dockerTry(...args) {
  const r = spawnSync('docker', args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
// Log của container gồm cả stdout lẫn stderr (repmgrd, PostgreSQL ghi ra stderr)
export function dockerLogs(container, since) {
  const r = dockerTry('logs', ...(since ? ['--since', since] : []), container);
  return `${r.out}\n${r.err}`.split(/\r?\n/);
}
export const dexec = (container, shellCmd) => docker('exec', container, 'sh', '-c', shellCmd);

// Tên container của các bản sao booking-service trên máy này (do --scale tạo ra: node1-booking-service-1, …)
export function bookingContainers(node) {
  const names = dockerTry('ps', '--format', '{{.Names}}').out.split(/\r?\n/);
  return names.filter((n) => (node ? n.startsWith(`node${node}-booking-service-`) : /booking-service/.test(n))).sort();
}

// Ảnh chụp một máy do API Gateway của máy đó tổng hợp (bản sao booking, CSDL đọc/ghi, Redis, hàng đợi, circuit breaker)
export const cluster = async (base = GATEWAY) => (await get(base + '/lab/cluster', 8000)).data;

// Trạng thái pg-router (Primary hiện tại + góc nhìn repmgr) — trả null nếu không truy cập được
export async function routerStatus(node) {
  try { return (await get(NODES[node].router, 2500)).data; } catch { return null; }
}

// Các node đang chạy trên CHÍNH máy này (tập dượt: cả 1, 2 và 3)
export function localNodes() {
  const names = dockerTry('ps', '--format', '{{.Names}}').out.split(/\r?\n/);
  return [1, 2, 3].filter((n) => names.includes(n === 3 ? 'pg-inv-witness' : `gateway-node${n}`));
}

// Trạng thái cụm RabbitMQ đọc từ API quản trị của một nút: các nút đang chạy + thành viên Raft của hàng đợi
export async function rabbitStatus(node) {
  const auth = { Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64') };
  const fetchJson = async (p) => {
    const res = await fetch(NODES[node].rabbitUi + p, { headers: auth, signal: AbortSignal.timeout(2500) });
    return res.json();
  };
  try {
    const [nodes, queue] = await Promise.all([fetchJson('/api/nodes'), fetchJson('/api/queues/%2F/booking.confirmed').catch(() => null)]);
    return {
      running: nodes.filter((x) => x.running).map((x) => x.name.replace('rabbit@', '')),
      members: (queue?.members || []).map((m) => m.replace('rabbit@', '')),
      leader: (queue?.leader || '').replace('rabbit@', ''),
      type: queue?.type,
      ready: queue?.messages_ready ?? 0,
    };
  } catch {
    return null;
  }
}

// Thao tác docker phải làm trên một máy cụ thể: máy này -> tự chạy; máy kia -> hướng dẫn người còn lại gõ lệnh
export async function onMachine(node, description, command, run) {
  if (localNodes().includes(node)) {
    cmd(command);
    return run();
  }
  console.log('  ' + c.inv(c.yellow(` 👉 TRÊN ${NODES[node].label} `)) + ' ' + description);
  console.log('     ' + c.bold(c.magenta(command)));
  await pause(`Bấm Enter khi ${NODES[node].label} đã chạy xong lệnh trên…`);
  return null;
}

export const psql = (container, sql, db = 'inventory_db') => docker('exec', '-u', 'postgres', container, 'psql', '-d', db, '-tAc', sql);
export const shortName = (ct) => ct.replace('cachethongphantan-datvexemphim-', '');


export async function waitFor(fn, timeoutMs = 60000, everyMs = 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await fn()) return true; } catch { /* thử lại */ }
    await sleep(everyMs);
  }
  return false;
}


export function table(rows, headers) {
  const all = [headers, ...rows].map((r) => r.map((x) => String(x)));
  const widths = headers.map((_, i) => Math.max(...all.map((r) => visibleLen(r[i]))));
  const fmt = (r) => '  ' + r.map((x, i) => x + ' '.repeat(widths[i] - visibleLen(x))).join('  │ ');
  console.log(c.bold(fmt(all[0])));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('──┼─'));
  all.slice(1).forEach((r) => console.log(fmt(r)));
}
// eslint-disable-next-line no-control-regex
const visibleLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

export async function main(fn) {
  try {
    await fn();
  } catch (err) {
    console.error('\n' + c.red('✘ Lỗi: ' + (err.stderr || err.message)));
    console.error(c.yellow('  Gợi ý: chạy "node demo/00-preflight.mjs" để kiểm tra hệ thống.'));
    process.exit(1);
  }
}

// Dùng cho demo bổ trợ Chương 3 (chạy với docker-compose.yml gốc ở thư mục dự án)
export function nodeContainers() {
  return ['api-gateway', 'inventory-service', ...bookingContainers(), 'notification-service'];
}
