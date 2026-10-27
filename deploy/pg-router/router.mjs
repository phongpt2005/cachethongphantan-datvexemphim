// pg-router — định tuyến kết nối GHI tới PostgreSQL Primary hiện tại của từng cụm.
//
// Ứng dụng chỉ biết một địa chỉ cố định (pg-router:5432 / :5433). Mỗi giây router hỏi mọi nút
// "pg_is_in_recovery()?"; nút trả lời false là Primary. Khi repmgr thăng cấp Standby, router
// thấy Primary đổi chỗ -> cắt các kết nối cũ -> kết nối mới tự đi sang Primary mới.
// Nếu cùng lúc có 2 nút xưng Primary, chọn nút có timeline cao hơn (vừa được thăng cấp) và
// cảnh báo — nút timeline cũ coi như đã bị "rào" (fencing).
// Self-fencing: chỉ cho ghi khi router còn thấy ĐA SỐ nút của cụm (dữ liệu + witness). Máy bị
// cô lập khỏi mạng chỉ thấy chính nó -> mất quorum -> chặn mọi kết nối ghi.
//
//   ROUTES="5432=IP1:5501,IP2:5511|IP3:5503;5433=IP1:5502,IP2:5512|IP3:5504"   (sau | là witness)
//   STATUS_PORT=8008   ->  GET /status  (JSON cho kịch bản demo)
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import pg from 'pg';

const PASSWORD = process.env.PGPASSWORD || 'postgres';
const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 1000);
const NAMES = Object.fromEntries((process.env.ROUTE_NAMES || '5432=inventory,5433=booking').split(',').map((x) => x.split('=')));

const node = (hp) => ({ addr: hp, host: hp.split(':')[0], port: Number(hp.split(':')[1]), state: 'unknown', timeline: null });

const routes = (process.env.ROUTES || '').split(';').filter(Boolean).map((spec) => {
  const [listen, rest] = spec.split('=');
  const [list, witnessList = ''] = rest.split('|');
  return {
    listen: Number(listen),
    name: NAMES[listen] || `route-${listen}`,
    backends: list.split(',').map(node),
    witnesses: witnessList.split(',').filter(Boolean).map(node),
    quorum: { visible: 0, total: 0, ok: false },
    primary: null,
    repmgr: [],
    sockets: new Set(),
    history: [],
  };
});

const log = (...a) => console.log(`[pg-router] [${new Date().toISOString()}]`, ...a);

const client = (n, database = 'postgres') =>
  new pg.Client({ host: n.host, port: n.port, user: 'postgres', password: PASSWORD, database, connectionTimeoutMillis: 800, query_timeout: 800 });

async function probe(b) {
  const c = client(b);
  try {
    await c.connect();
    // Primary: timeline từ tên file WAL đang ghi (đổi ngay khi thăng cấp); Standby: từ checkpoint
    const { rows } = await c.query(`SELECT pg_is_in_recovery() AS standby,
      CASE WHEN pg_is_in_recovery() THEN (SELECT timeline_id FROM pg_control_checkpoint())
           ELSE ('x' || substr(pg_walfile_name(pg_current_wal_lsn()), 1, 8))::bit(32)::int END AS timeline`);
    b.state = rows[0].standby ? 'standby' : 'primary';
    b.timeline = rows[0].timeline;
  } catch {
    b.state = 'down';
    b.timeline = null;
  } finally {
    c.end().catch(() => {});
  }
}

async function probeWitness(w) {
  const c = client(w);
  try {
    await c.connect();
    await c.query('SELECT 1');
    w.state = 'witness';
  } catch {
    w.state = 'down';
  } finally {
    c.end().catch(() => {});
  }
}

// Góc nhìn của chính repmgr (bảng repmgr.nodes trên Primary): ai là primary/standby/witness
async function readRepmgr(route) {
  if (!route.primary) return;
  const c = client(route.primary, 'repmgr');
  try {
    await c.connect();
    const { rows } = await c.query('SELECT node_id, node_name, type, active, location, priority FROM repmgr.nodes ORDER BY node_id');
    route.repmgr = rows;
  } catch {
    /* giữ kết quả cũ */
  } finally {
    c.end().catch(() => {});
  }
}

async function check(route) {
  await Promise.all([...route.backends.map(probe), ...route.witnesses.map(probeWitness)]);
  const total = route.backends.length + route.witnesses.length;
  const visible = [...route.backends, ...route.witnesses].filter((n) => n.state !== 'down').length;
  const ok = visible >= Math.floor(total / 2) + 1;
  if (route.quorum.total && ok !== route.quorum.ok) {
    log(ok ? `${route.name}: CÓ LẠI QUORUM (${visible}/${total}) -> cho phép ghi` : `⛔ ${route.name}: MẤT QUORUM (${visible}/${total}) -> chặn ghi (self-fencing)`);
  }
  route.quorum = { visible, total, ok };

  const primaries = route.backends.filter((b) => b.state === 'primary').sort((a, b) => b.timeline - a.timeline);
  if (primaries.length > 1) log(`⚠ ${route.name}: ${primaries.length} nút cùng xưng PRIMARY -> chọn timeline cao nhất ${primaries[0].addr}`);
  const next = ok ? primaries[0] || null : null;
  if (next?.addr !== route.primary?.addr) {
    log(`${route.name}: PRIMARY ${route.primary?.addr || '(không có)'} -> ${next?.addr || '(không có)'} · cắt ${route.sockets.size} kết nối cũ`);
    route.history.push({ at: new Date().toISOString(), from: route.primary?.addr || null, to: next?.addr || null, quorum: ok });
    route.history = route.history.slice(-20);
    route.primary = next ? { ...next } : null;
    for (const s of route.sockets) s.destroy();
  }
  await readRepmgr(route);
}

for (const route of routes) {
  net.createServer((conn) => {
    if (!route.primary) return conn.destroy();
    const upstream = net.connect(route.primary.port, route.primary.host);
    const pair = { destroy: () => { conn.destroy(); upstream.destroy(); } };
    route.sockets.add(pair);
    const done = () => { route.sockets.delete(pair); pair.destroy(); };
    conn.on('error', done).on('close', done);
    upstream.on('error', done).on('close', done);
    conn.pipe(upstream).pipe(conn);
  }).listen(route.listen, () => log(`${route.name}: lắng nghe :${route.listen} -> [${route.backends.map((b) => b.addr).join(', ')}] witness [${route.witnesses.map((w) => w.addr).join(', ')}]`));

  const loop = async () => {
    await check(route).catch((e) => log(route.name, 'lỗi kiểm tra:', e.message));
    setTimeout(loop, INTERVAL_MS);
  };
  loop();
}

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    router: os.hostname(),
    nodeId: process.env.NODE_ID || null,
    routes: routes.map((r) => ({
      name: r.name,
      listen: r.listen,
      primary: r.primary?.addr || null,
      quorum: r.quorum,
      connections: r.sockets.size,
      backends: r.backends.map(({ addr, state, timeline }) => ({ addr, state, timeline })),
      witnesses: r.witnesses.map(({ addr, state }) => ({ addr, state })),
      repmgr: r.repmgr,
      history: r.history,
    })),
    timestamp: new Date().toISOString(),
  }, null, 2));
}).listen(Number(process.env.STATUS_PORT || 8008));
