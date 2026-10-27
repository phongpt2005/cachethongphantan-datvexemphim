// KỊCH BẢN 4 — CHỐNG SPLIT-BRAIN: đứt mạng giữa máy 1 và máy 2, Node 3 vẫn thấy cả hai
// Máy 2 mất liên lạc với Primary nên muốn thăng cấp, nhưng hỏi Node 3 (witness) thì Node 3 vẫn thấy
// Primary còn sống -> phủ quyết -> máy 2 giữ STANDBY. Không bao giờ có 2 Primary.
//   node demo/04-split-brain.mjs           (chạy trên Node 3)
//   node demo/04-split-brain.mjs --cut     (người ở MÁY 2 gõ khi được nhắc: cắt đường máy 2 -> máy 1)
//   node demo/04-split-brain.mjs --heal    (người ở MÁY 2 gõ: nối lại)
import { banner, step, info, ok, bad, note, conclude, c, docker, dockerTry, dockerLogs, routerStatus, book, resetData, sleep, pause, main, table, onMachine, localNodes, NODES } from './lib.mjs';

const PG = ['pg-inv-node2', 'pg-book-node2'];
const PORTS = [5501, 5502]; // chỉ cắt tới CSDL máy 1; đường tới Node 3 vẫn thông
const cut = () => PG.forEach((ct) => docker('exec', ct, 'sh', '-c', PORTS.map((p) => `iptables -A OUTPUT -p tcp -d ${NODES[1].ip} --dport ${p} -j DROP`).join(' && ')));
const heal = () => PG.forEach((ct) => dockerTry('exec', ct, 'sh', '-c', 'iptables -F OUTPUT'));

// Vai trò của 2 nút CSDL máy 2, đọc qua pg-router máy 2 (xem được từ bất kỳ máy nào)
async function roles2() {
  const rs = await routerStatus(2);
  return (rs?.routes || []).map((r) => ({ name: r.name, primary: r.primary, state: r.backends[1]?.state, witness: r.witnesses?.[0]?.state }));
}

main(async () => {
  if (process.argv.includes('--cut')) { cut(); ok('Đã cắt đường từ CSDL máy 2 tới máy 1.'); return; }
  if (process.argv.includes('--heal')) { heal(); ok('Đã nối lại.'); return; }
  banner('04', 'ĐỨT MẠNG GIỮA MÁY 1 VÀ MÁY 2 — CÓ SINH RA 2 PRIMARY KHÔNG?', 'Fault tolerance: chống split-brain bằng Witness (Node 3) + bỏ phiếu đồng thuận');

  step(1, 'Trạng thái ban đầu');
  const before = await routerStatus(2);
  if (before.routes.some((r) => r.backends[0].state !== 'primary')) {
    bad('Primary hiện không ở máy 1 (vừa demo failover?) → trên MÁY 1 chạy: node deploy/cluster.mjs failback');
    process.exit(1);
  }
  for (const r of before.routes) info(`${r.name.padEnd(9)} PRIMARY = ${c.bold(r.primary)} · repmgr: ${r.repmgr.map((x) => `${x.node_name}=${x.type}`).join(', ')}`);
  note('Node 3 là trọng tài: không chứa dữ liệu, chỉ trả lời câu hỏi "bạn còn thấy Primary không?".');
  await pause();

  step(2, 'Cắt đường mạng MÁY 2 → MÁY 1 (đường tới Node 3 vẫn còn)');
  const since = new Date().toISOString();
  await onMachine(2, 'cắt đường từ CSDL máy 2 tới máy 1', 'node demo/04-split-brain.mjs --cut', cut);
  note('Máy 2 không phân biệt được "máy 1 chết" hay "đứt cáp" — nó phải hỏi bên thứ ba.');

  step(3, 'Quan sát máy 2 trong 25 giây');
  const t0 = Date.now();
  let promoted = false;
  while (Date.now() - t0 < 25000) {
    await sleep(5000);
    const r = await roles2();
    promoted ||= r.some((x) => x.state === 'primary');
    info(`t+${Math.round((Date.now() - t0) / 1000)}s  ${r.map((x) => `${x.name} máy 2 = ${x.state === 'standby' ? c.cyan('standby') : c.red(x.state)}`).join('  ')}`);
  }
  if (localNodes().includes(2)) {
    info('Nhật ký repmgrd của pg-inv-node2:');
    [...new Set(dockerLogs(PG[0], since)
      .filter((l) => /can still see the primary|considering primary still visible|cancelling failover|election cancelled|unable to reconnect/i.test(l))
      .map((l) => l.replace(/^\[[^\]]+\] /, '').slice(0, 110)))].slice(-4).forEach((l) => console.log(c.gray('    ' + l)));
  } else {
    info(c.gray('Người ở máy 2 có thể chiếu: docker logs --since 1m pg-inv-node2 | findstr cancel'));
  }
  promoted
    ? bad('Máy 2 đã tự thăng cấp — split-brain!')
    : ok('Witness Node 3 vẫn thấy Primary → máy 2 "cancelling failover as some nodes can still see the primary" → giữ STANDBY.');
  await pause();

  step(4, 'Hệ thống vẫn chỉ có MỘT nơi nhận lệnh ghi');
  await resetData();
  const r = await book(`Khach_luc_dut_mang_${Date.now().toString().slice(-4)}`);
  info(`Đặt vé qua Frontend LB trong lúc đứt mạng: HTTP ${c.bold(r.status)} (${r.ms} ms, gateway ${r.data.nodeId})`);
  note('Nếu máy 2 tự lên Primary, hai máy sẽ cùng bán ghế A20 cho hai người → dữ liệu phân nhánh, không thể gộp lại.');
  await pause();

  step(5, 'Nối lại mạng');
  await onMachine(2, 'nối lại đường máy 2 → máy 1', 'node demo/04-split-brain.mjs --heal', heal);
  await sleep(6000);
  const after = await routerStatus(2);
  table(after.routes.map((rt) => [rt.name, rt.primary, rt.backends.map((b) => `${b.addr}=${b.state}`).join(', '), `${rt.quorum.visible}/${rt.quorum.total}`]),
    ['Cụm', 'Primary (không đổi)', 'Các nút', 'Quorum']);
  ok('Standby tự kết nối lại và nhận WAL tiếp — không cần can thiệp.');

  conclude([
    'Với 2 máy, Standby không thể tự biết "Primary chết" hay "mạng đứt" — cần bên thứ ba: Node 3.',
    'Quy tắc: chỉ thăng cấp khi thấy đa số nút (2/3) VÀ không nút nào còn thấy Primary cũ (bỏ phiếu đồng thuận).',
    'Đánh đổi CAP: khi phân vùng mạng, hệ thống chọn Nhất quán — không bao giờ có 2 nơi cùng bán vé.',
  ]);
});
