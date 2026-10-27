// Điều khiển cụm 3 máy (máy 1 Primary · máy 2 Secondary · Node 3 trọng tài).
//   node deploy/cluster.mjs ip                                  liệt kê IP LAN của máy này
//   node deploy/cluster.mjs init <IP_MAY1> <IP_MAY2> <IP_NODE3>  ghi deploy/cluster.env (chạy trên CẢ 3 máy, cùng giá trị)
//   node deploy/cluster.mjs init --rehearsal                    tập dượt: cả 3 "máy" chạy trên laptop này
//   node deploy/cluster.mjs up 1 | up 2 | up 3 | up all         dựng node (máy 1 → Node 3 → máy 2)
//   node deploy/cluster.mjs down 1|2|3|all [--wipe]              dừng node (--wipe: xoá sạch dữ liệu để làm lại từ đầu)
//   node deploy/cluster.mjs status                              trạng thái cả cụm nhìn từ máy này
//   node deploy/cluster.mjs failback                            (trên MÁY 1) đưa Primary về lại máy 1 sau demo failover
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(DIR, 'cluster.env');
const [cmd, ...args] = process.argv.slice(2);
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

function lanIps() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !/vEthernet|VMware|VirtualBox|Loopback|WSL|docker|Hyper-V/i.test(name))
    .flatMap(([name, addrs]) => addrs.filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })));
}

export function readEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error('Chưa có deploy/cluster.env -> chạy: node deploy/cluster.mjs init <IP_MAY1> <IP_MAY2> <IP_NODE3>');
  const env = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => l.split('=').map((x) => x.trim())));
  if (!env.NODE3_IP) throw new Error('cluster.env thiếu NODE3_IP (bản cũ 2 máy) -> chạy lại "init" với 3 IP');
  return env;
}

const rehearsal = (env) => env.NODE1_IP === env.NODE2_IP && env.NODE2_IP === env.NODE3_IP;

function run(argv) {
  const r = spawnSync('docker', argv, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function compose(env, node, ...rest) {
  const files = ['docker-compose.yml', rehearsal(env) ? 'rehearsal.yml' : 'lan.yml'].flatMap((f) => ['-f', path.join(DIR, `node${node}`, f)]);
  run(['compose', ...files, '--env-file', ENV_FILE, ...rest]);
}

// Thứ tự dựng: máy 1 (Primary) -> Node 3 (witness cần Primary) -> máy 2 (Standby clone từ Primary)
const nodes = (x) => (x === 'all' ? ['1', '3', '2'] : ['1', '2', '3'].includes(x) ? [x] : (console.error('Chọn node: 1, 2, 3 hoặc all'), process.exit(1)));

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return await res.json();
  } catch (e) {
    return { error: e.cause?.code || e.message };
  }
}

if (cmd === 'ip') {
  lanIps().forEach(({ name, ip }) => console.log(`${ip.padEnd(16)} ${name}`));
} else if (cmd === 'init') {
  let ips = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--rehearsal')) {
    const ip = lanIps()[0]?.ip;
    if (!ip) throw new Error('Không tìm thấy IP LAN — hãy kết nối Wi-Fi');
    ips = [ip, ip, ip];
  }
  if (ips.length !== 3 || !ips.every((ip) => IPV4.test(ip))) {
    console.error('Cách dùng: node deploy/cluster.mjs init <IP_MAY1> <IP_MAY2> <IP_NODE3>   (xem IP: node deploy/cluster.mjs ip)');
    process.exit(1);
  }
  const [ip1, ip2, ip3] = ips;
  fs.writeFileSync(ENV_FILE, `# IP LAN của 3 máy — phải GIỐNG NHAU trên cả ba máy\nNODE1_IP=${ip1}\nNODE2_IP=${ip2}\nNODE3_IP=${ip3}\nLOCK_STRATEGY=pessimistic\n`);
  console.log(`Đã ghi ${ENV_FILE}: máy 1=${ip1} máy 2=${ip2} Node 3=${ip3}${ip1 === ip2 && ip2 === ip3 ? '  (chế độ TẬP DƯỢT trên 1 máy)' : ''}`);
} else if (cmd === 'up') {
  const env = readEnv();
  if (rehearsal(env) && spawnSync('docker', ['network', 'inspect', 'moviebook-lan'], { stdio: 'ignore' }).status !== 0) {
    run(['network', 'create', 'moviebook-lan']);
  }
  for (const n of nodes(args[0])) compose(env, n, 'up', '-d', ...(args.includes('--no-build') ? [] : ['--build']));
} else if (cmd === 'down') {
  const env = readEnv();
  for (const n of nodes(args[0]).reverse()) compose(env, n, 'down', ...(args.includes('--wipe') ? ['-v'] : []));
} else if (cmd === 'failback') {
  // Switchover có kiểm soát: chờ Standby máy 1 bắt kịp WAL -> thăng cấp (timeline mới cao hơn)
  // -> watchdog fencing trên máy 2 thấy Primary timeline cao hơn -> tự hạ cấp, pg_rewind, theo máy 1.
  const env = readEnv();
  const sql = (ct, q) => spawnSync('docker', ['exec', '-u', 'postgres', ct, 'psql', '-tAc', q], { encoding: 'utf8' }).stdout.trim();
  for (const ct of ['pg-inv-node1', 'pg-book-node1']) {
    // CSDL có thể đang khởi động lại (vừa rejoin): chờ tới khi trả lời được t/f rồi mới quyết định
    let inRecovery = '';
    for (let i = 0; i < 60 && !['t', 'f'].includes(inRecovery); i++) {
      inRecovery = sql(ct, 'select pg_is_in_recovery()');
      if (!['t', 'f'].includes(inRecovery)) await new Promise((r) => setTimeout(r, 1000));
    }
    if (inRecovery !== 't') { console.log(`${ct}: ${inRecovery === 'f' ? 'đã là PRIMARY' : 'KHÔNG TRẢ LỜI'}`); continue; }
    for (let i = 0; i < 30 && sql(ct, 'select pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()') !== 't'; i++) await new Promise((r) => setTimeout(r, 500));
    console.log(`${ct}: thăng cấp -> ${sql(ct, 'select pg_promote(true, 30)') === 't' ? 'PRIMARY' : 'LỖI'}`);
  }
  console.log('Chờ máy 2 tự hạ cấp về STANDBY…');
  for (let i = 0; i < 60; i++) {
    const rs = await getJson(`http://${env.NODE1_IP}:8008/status`);
    if (rs.routes?.every((r) => r.primary?.startsWith(`${env.NODE1_IP}:550`) && r.backends[1].state === 'standby')) {
      // Máy 2 đã đăng ký lại là standby -> giờ mới ghi nhận máy 1 là primary trong metadata repmgr
      for (const ct of ['pg-inv-node1', 'pg-book-node1']) {
        spawnSync('docker', ['exec', '-u', 'postgres', ct, 'repmgr', '-f', '/etc/repmgr.conf', 'primary', 'register', '--force'], { stdio: 'ignore' });
      }
      console.log('Xong: Primary ở máy 1, Standby ở máy 2.');
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('Máy 2 chưa về Standby sau 2 phút — kiểm tra: node deploy/cluster.mjs status');
  process.exit(1);
} else if (cmd === 'status') {
  const env = readEnv();
  const targets = [
    ['Máy 1', `http://${env.NODE1_IP}:8008/status`, `http://${env.NODE1_IP}:3000/health`],
    ['Máy 2', `http://${env.NODE2_IP}:8018/status`, `http://${env.NODE2_IP}:3100/health`],
  ];
  for (const [label, routerUrl, gwUrl] of targets) {
    const [router, gw] = await Promise.all([getJson(routerUrl), getJson(gwUrl)]);
    console.log(`\n${label}: gateway ${gw.error ? 'KHÔNG TRUY CẬP ĐƯỢC (' + gw.error + ')' : 'OK ' + gw.hostname}`);
    if (router.error) { console.log(`  pg-router: KHÔNG TRUY CẬP ĐƯỢC (${router.error})`); continue; }
    for (const r of router.routes) {
      const q = r.quorum ? ` quorum ${r.quorum.visible}/${r.quorum.total}${r.quorum.ok ? '' : ' MẤT -> chặn ghi'}` : '';
      console.log(`  ${r.name.padEnd(10)} primary=${r.primary || '(KHÔNG CÓ)'}${q}  ` +
        [...r.backends.map((b) => `${b.addr}:${b.state}${b.timeline ? '/tl' + b.timeline : ''}`), ...(r.witnesses || []).map((w) => `${w.addr}:${w.state}`)].join('  '));
    }
  }
  const lb = await getJson(`http://${env.NODE3_IP}:8090/lb-health`);
  console.log(`\nFrontend LB (Node 3) http://${env.NODE3_IP}:8090 : ${lb.error ? 'KHÔNG TRUY CẬP ĐƯỢC (' + lb.error + ')' : 'OK'}`);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}
