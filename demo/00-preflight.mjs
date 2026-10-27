// KIỂM TRA TRƯỚC GIỜ BẢO VỆ — chạy trên Node 3 (máy trình chiếu) khoảng 15 phút trước khi lên trình bày
// (cả 3 máy đã chạy "node deploy/cluster.mjs up <số máy>").
//   node demo/00-preflight.mjs
import { banner, step, ok, bad, info, note, c, get, post, book, resetData, routerStatus, rabbitStatus, localNodes, main, GATEWAY, NODES, ENV, REHEARSAL, table } from './lib.mjs';

main(async () => {
  banner('00', 'KIỂM TRA CỤM 3 MÁY TRƯỚC KHI DEMO', 'mọi thành phần sống, đúng vai trò, dữ liệu ở trạng thái ban đầu');
  let failures = 0;
  const check = (cond, okMsg, badMsg) => (cond ? ok(okMsg) : (bad(badMsg), failures++));

  if (!ENV) {
    bad('Chưa có deploy/cluster.env → chạy: node deploy/cluster.mjs init <IP_MAY1> <IP_MAY2> <IP_NODE3>');
    process.exit(1);
  }
  step(1, `Cấu hình: MÁY 1 = ${c.bold(NODES[1].ip)} · MÁY 2 = ${c.bold(NODES[2].ip)} · NODE 3 = ${c.bold(NODES[3].ip)}${REHEARSAL ? c.yellow('  (TẬP DƯỢT: cả 3 trên máy này)') : ''}`);
  info(`Máy này đang chạy node: ${localNodes().join(', ') || '(không có — kiểm tra Docker Desktop)'}`);

  step(2, 'API Gateway của từng máy');
  for (const n of [1, 2]) {
    try {
      const h = await get(NODES[n].gw + '/health', 4000);
      check(h.status === 200 && h.data.nodeId === `node${n}`, `${NODES[n].label}  ${NODES[n].gw}  (${h.ms} ms, container ${h.data.hostname})`, `${NODES[n].label} trả HTTP ${h.status}`);
    } catch (e) {
      bad(`${NODES[n].label} không truy cập được ${NODES[n].gw}: ${e.cause?.code || e.message}`); failures++;
      note('Kiểm tra: máy kia đã "up" chưa, cùng mạng Wi-Fi chưa, đã mở firewall (deploy/windows/open-firewall.ps1) chưa.');
    }
  }

  step(3, 'Frontend LB trên Node 3 — một địa chỉ, chia đều cho 2 máy');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    try { seen.push((await get('/health', 4000)).data.nodeId); } catch { seen.push('lỗi'); }
  }
  check(seen.includes('node1') && seen.includes('node2'), `${GATEWAY} → ${seen.join(' → ')}`, `Frontend LB chưa chia cho cả 2 máy: ${seen.join(', ')}`);

  step(4, 'Cụm CSDL: Primary ở máy 1, Standby ở máy 2, Witness ở Node 3 (repmgr), quorum 3/3');
  const rs = await routerStatus(1) || await routerStatus(2);
  if (!rs) { bad('Không đọc được pg-router của máy nào'); failures++; }
  for (const r of rs?.routes || []) {
    const [b1, b2] = r.backends;
    check(b1.state === 'primary' && b2.state === 'standby', `${r.name.padEnd(9)} PRIMARY ${b1.addr} · STANDBY ${b2.addr}`,
      `${r.name}: máy 1 = ${b1.state}, máy 2 = ${b2.state} (cần primary/standby — sau demo failover hãy làm lại cụm, xem DEMO-GUIDE)`);
    check(r.quorum?.visible === 3, `${r.name.padEnd(9)} quorum ${r.quorum?.visible}/${r.quorum?.total} · witness ${(r.witnesses || []).map((w) => w.addr + '=' + w.state).join(', ')}`,
      `${r.name}: quorum chỉ ${r.quorum?.visible}/${r.quorum?.total} — kiểm tra Node 3 đã "up 3" và firewall cổng 5503/5504`);
    const types = r.repmgr.filter((x) => x.active).map((x) => x.type);
    check(['primary', 'standby', 'witness'].every((t) => types.includes(t)), `${r.name.padEnd(9)} repmgr: ${r.repmgr.map((x) => `${x.node_name}=${x.type}${x.active ? '' : '(✗)'}`).join(', ')}`,
      `${r.name}: repmgr chưa đủ primary+standby+witness: ${types.join(', ')}`);
  }

  step(5, 'Cụm RabbitMQ 3 nút + quorum queue (Raft)');
  const rb = await rabbitStatus(3) || await rabbitStatus(1);
  check(rb && rb.running.length === 3, `Nút đang chạy: ${rb?.running.join(', ')}`, `Cụm RabbitMQ chưa đủ 3 nút: ${rb ? rb.running.join(', ') : 'không đọc được'}`);
  check(rb && rb.type === 'quorum' && rb.members.length === 3, `Hàng đợi booking.confirmed: ${rb?.type} · leader ${rb?.leader} · ${rb?.members.length} bản sao Raft`,
    `Hàng đợi chưa phải quorum 3 bản sao (type=${rb?.type}, members=${rb?.members.join(',')}) — đợi 10–20 s rồi chạy lại`);

  step(6, 'Cache & hàng đợi tại từng máy');
  for (const n of [1, 2]) {
    try {
      const cl = (await get(NODES[n].gw + '/lab/cluster', 6000)).data;
      const rd = cl.inventory.redis;
      check(rd.write.ok && rd.read.ok && (n === 1 || rd.read.link === 'up'), `${NODES[n].label} Redis: ghi ${rd.write.role} · đọc ${rd.read.role}${rd.read.link ? ' (link ' + rd.read.link + ')' : ''}`, `${NODES[n].label} Redis lỗi: ${JSON.stringify(rd)}`);
      check(cl.queue.ok && cl.queue.consumers >= 1, `${NODES[n].label} RabbitMQ: hàng đợi ${cl.queue.name} (durable=${cl.queue.durable}), ${cl.queue.consumers} consumer`, `${NODES[n].label} RabbitMQ/notification chưa sẵn sàng`);
      check(cl.inventory.lockStrategy === 'pessimistic', `${NODES[n].label} chiến lược khoá: ${cl.inventory.lockStrategy}`, `${NODES[n].label} đang để khoá ${cl.inventory.lockStrategy} (kịch bản 02 sẽ tự đặt lại)`);
      const states = Object.values(cl.gateway.circuits).map((x) => x.state);
      check(states.every((s) => s === 'CLOSED'), `${NODES[n].label} circuit breaker: ${states.join(', ')}`, `${NODES[n].label} circuit breaker chưa CLOSED: ${states.join(', ')}`);
    } catch (e) {
      bad(`${NODES[n].label}: không đọc được /lab/cluster (${e.message})`); failures++;
    }
  }

  step(7, 'Luồng đặt vé đầu-cuối trên cả 2 máy');
  await resetData();
  const r1 = await book('Preflight_May1', '20', NODES[1].gw);
  check(r1.status === 201, `Đặt A20 qua máy 1: 201 (${r1.ms} ms)`, `Đặt vé qua máy 1 lỗi HTTP ${r1.status}: ${JSON.stringify(r1.data).slice(0, 120)}`);
  const r2 = await book('Preflight_May2', '20', NODES[2].gw);
  check(r2.status === 409, 'Đặt lại A20 qua máy 2: 409 Conflict (máy 2 thấy dữ liệu của máy 1)', `Đặt lại A20 qua máy 2 trả ${r2.status} (mong đợi 409)`);
  for (const n of [1, 2]) await post(NODES[n].gw + '/lab/lock-strategy?mode=pessimistic').catch(() => {});
  await resetData();
  ok('Đã reset: chỉ còn ghế A20 trống, xoá toàn bộ booking');

  console.log();
  table([
    ['Client / trình duyệt (Frontend LB, Node 3)', GATEWAY],
    ['Gateway máy 1 / máy 2', `${NODES[1].gw}  /  ${NODES[2].gw}`],
    ['RabbitMQ UI (guest/guest)', `${NODES[1].rabbitUi}  /  ${NODES[2].rabbitUi}  /  ${NODES[3].rabbitUi}`],
    ['pg-router (Primary hiện tại)', `${NODES[1].router}  /  ${NODES[2].router}`],
  ], ['Địa chỉ', 'URL']);
  console.log();
  if (failures === 0) {
    console.log(c.bold(c.green('  ✅ CỤM SẴN SÀNG. Danh sách kịch bản: node demo/run.mjs')));
  } else {
    console.log(c.bold(c.red(`  ❌ Có ${failures} mục lỗi — xem DEMO-GUIDE.md mục "Xử lý sự cố".`)));
    process.exit(1);
  }
});
