// KỊCH BẢN 5 — AUTO-FAILOVER: Primary ở máy 1 sập, máy 2 + Node 3 (witness) đủ 2/3 phiếu -> tự thăng cấp
//   node demo/05-failover.mjs           (chạy trên Node 3; lệnh "docker kill" do người ở MÁY 1 gõ khi được nhắc)
import { banner, step, info, ok, bad, note, conclude, c, docker, dockerLogs, routerStatus, post, sleep, pause, main, table, onMachine, localNodes, NODES, GATEWAY, waitFor } from './lib.mjs';

const PRIMARIES = ['pg-inv-node1', 'pg-book-node1'];

function roleTable(rs, title) {
  const where = { 1: 'máy 1', 2: 'máy 2', 3: 'Node 3' };
  table(rs.routes.flatMap((r) => r.repmgr.map((x) => [r.name, x.node_name, where[x.node_id], x.active ? (x.type === 'primary' ? c.red(x.type.toUpperCase()) : x.type) : c.gray(`${x.type} (mất kết nối)`)])),
    [title, 'Nút', 'Ở máy', 'Vai trò theo repmgr']);
}

main(async () => {
  banner('05', 'MÁY CHỦ CSDL CHÍNH SẬP — HỆ THỐNG TỰ CHUYỂN SANG MÁY 2', 'Fault tolerance: automatic failover (repmgr + witness quorum)');

  step(1, 'Trạng thái ban đầu (đọc từ pg-router của máy 2)');
  const before = await routerStatus(2);
  if (before.routes.some((r) => !r.primary?.startsWith(NODES[1].ip) || r.backends[0].state !== 'primary')) {
    bad('Primary hiện không ở máy 1 (vừa demo failover?) → trên MÁY 1 chạy: node deploy/cluster.mjs failback');
    process.exit(1);
  }
  roleTable(before, 'Cụm');
  await pause();

  step(2, `Khách đặt vé liên tục qua Frontend LB ${GATEWAY} (mỗi 0,7 giây)`);
  const ticks = [];
  let running = true;
  const traffic = (async () => {
    let i = 0;
    while (running) {
      i++;
      const t = Date.now();
      let status = 0;
      try {
        await post('/dev/reset', null, 6000);
        status = (await post('/booking', { showtimeId: '1', seatId: '20', userName: `FO_${i}` }, 6000)).status;
      } catch { status = 0; }
      ticks.push({ t, ok: status === 201, status });
      process.stdout.write(status === 201 ? c.green('█') : c.red('█'));
      await sleep(Math.max(0, 700 - (Date.now() - t)));
    }
  })();
  await sleep(4000);

  console.log();
  step(3, 'Đánh sập đột ngột cả 2 Primary trên máy 1');
  let killedAt = Date.now();
  await onMachine(1, 'đánh sập 2 Primary', `docker kill ${PRIMARIES.join(' ')}`, () => { killedAt = Date.now(); docker('kill', ...PRIMARIES); });
  process.stdout.write('  ');
  const promoted = await waitFor(async () => {
    const rs = await routerStatus(2);
    return rs && rs.routes.every((r) => r.primary?.startsWith(NODES[2].ip + ':551'));
  }, 90000, 1000);
  await waitFor(() => ticks.slice(-3).length === 3 && ticks.slice(-3).every((x) => x.ok && x.t > killedAt), 30000, 500);
  running = false;
  await traffic;
  console.log();

  const firstFail = ticks.find((x) => x.t >= killedAt && !x.ok);
  const recovered = ticks.find((x) => x.t > (firstFail?.t || killedAt) && x.ok);
  const after = await routerStatus(2);
  promoted ? ok('Máy 2 đã tự thăng cấp lên PRIMARY cho cả 2 cụm.') : bad('Chưa thấy thăng cấp sau 90 giây.');
  info(`Thời gian gián đoạn dịch vụ đặt vé: ${c.bold(c.yellow(recovered && firstFail ? ((recovered.t - firstFail.t) / 1000).toFixed(1) + ' giây' : '0 giây'))}  (${ticks.filter((x) => !x.ok).length}/${ticks.length} lượt lỗi)`);
  for (const r of after.routes) {
    const [lost, found] = r.history.slice(-2);
    info(`${r.name.padEnd(9)} pg-router: ${lost?.from} → (không có Primary, ${lost?.at?.slice(11, 19)}) → ${c.bold(found?.to)} (${found?.at?.slice(11, 19)})`);
  }
  roleTable(after, 'Cụm sau failover');
  note('repmgrd máy 2: ping Primary thất bại 3 lần → hỏi Node 3 → Node 3 cũng không thấy Primary → đủ đa số 2/3 → pg_promote().');
  note('pg-router trên mỗi máy phát hiện Primary đổi chỗ → cắt kết nối cũ → ứng dụng tự nối lại vào máy 2. Không sửa cấu hình app.');
  await pause();

  step(4, 'Máy 1 sống lại: Primary cũ có được ghi tiếp không?');
  await onMachine(1, 'bật lại 2 CSDL máy 1', `docker start ${PRIMARIES.join(' ')}`, () => docker('start', ...PRIMARIES));
  const rejoined = await waitFor(async () => {
    const rs = await routerStatus(1);
    return rs && rs.routes.every((r) => r.backends[0].state === 'standby' && r.repmgr.filter((x) => x.type === 'standby' && x.active).length === 1);
  }, 90000, 2000);
  if (localNodes().includes(1)) {
    const logs = dockerLogs(PRIMARIES[0], new Date(killedAt).toISOString()).filter((l) => /cluster:|pg_rewind: Done/.test(l)).slice(-4);
    logs.forEach((l) => console.log(c.gray('    ' + l.slice(0, 120))));
  }
  rejoined ? ok('Primary cũ phát hiện đã có Primary mới → tự pg_rewind và quay lại làm STANDBY (fencing, không có 2 Primary).') : bad('Primary cũ chưa quay lại làm Standby.');
  roleTable(await routerStatus(1), 'Cụm hiện tại');

  conclude([
    'Phát hiện lỗi → bầu chọn có trọng tài → thăng cấp → định tuyến lại: tự động hoàn toàn, khách chỉ thấy vài giây lỗi.',
    'Dữ liệu không mất: Standby nhận WAL liên tục nên đã có mọi giao dịch đã commit trên Primary.',
    'Nút hỏng quay lại phải đi theo Primary mới (fencing) — đây là điều kiện để không bao giờ có 2 nơi cùng ghi.',
    `Đưa Primary về máy 1 sau demo: ${c.bold('node deploy/cluster.mjs failback')} (trên máy 1).`,
  ]);
});
