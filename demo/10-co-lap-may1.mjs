// KỊCH BẢN 10 — MÁY 1 BỊ CÔ LẬP KHỎI MẠNG (tắt Wi-Fi máy 1) — lỗ hổng split-brain thật sự của plan cũ
// Máy 2 + Node 3 là đa số -> bầu máy 2 lên Primary. Máy 1 vẫn "tưởng" mình là Primary nhưng pg-router
// máy 1 chỉ thấy 1/3 nút -> tự chặn ghi (self-fencing). Cắm mạng lại -> máy 1 thấy Primary timeline
// cao hơn -> tự hạ cấp, pg_rewind, theo máy 2. Không lúc nào có 2 nơi cùng nhận ghi.
//   node demo/10-co-lap-may1.mjs        (chạy trên Node 3; người ở MÁY 1 tắt/bật Wi-Fi khi được nhắc)
import { banner, step, info, ok, bad, note, conclude, c, docker, dockerTry, routerStatus, post, sleep, pause, main, table, localNodes, NODES, GATEWAY, REHEARSAL, waitFor } from './lib.mjs';

// Tập dượt trên 1 laptop: mô phỏng "tắt Wi-Fi máy 1" bằng cách chặn cổng giữa các container
const ISO = {
  from1: [['pg-inv-node1', 'pg-book-node1', 'pg-router-node1'], [5511, 5512, 5503, 5504]],
  to1: [['pg-inv-node2', 'pg-book-node2', 'pg-router-node2', 'pg-inv-witness', 'pg-book-witness'], [5501, 5502]],
};
function isolate1() {
  for (const [cts, ports] of Object.values(ISO)) {
    for (const ct of cts) docker('exec', ct, 'sh', '-c', ports.map((p) => `iptables -A OUTPUT -p tcp -d ${NODES[1].ip} --dport ${p} -j DROP`).join(' && '));
  }
}
function reconnect1() {
  for (const [cts] of Object.values(ISO)) for (const ct of cts) dockerTry('exec', ct, 'sh', '-c', 'iptables -F OUTPUT');
}

async function stepOnMachine1(description, simulate) {
  if (REHEARSAL && localNodes().includes(1)) {
    info(c.gray(`(tập dượt: mô phỏng "${description}" bằng iptables)`));
    return simulate();
  }
  console.log('  ' + c.inv(c.yellow(' 👉 TRÊN MÁY 1 ')) + ' ' + c.bold(description));
  await pause('Bấm Enter khi máy 1 đã làm xong…');
}

const routeRow = (label, rs) => (rs ? rs.routes.map((r) => [label, r.name, `${r.quorum.visible}/${r.quorum.total}`, r.quorum.ok ? c.green('cho phép ghi') : c.red('CHẶN GHI'), r.primary || '—']) : [[label, '—', '—', c.gray('không truy cập được (máy 1 đang mất mạng)'), '—']]);

main(async () => {
  if (process.argv.includes('--heal')) { reconnect1(); ok('Đã gỡ mô phỏng cô lập.'); return; }
  banner('10', 'MÁY 1 BỊ CÔ LẬP KHỎI MẠNG — HAI MÁY CÙNG TƯỞNG MÌNH LÀ CHỦ?', 'Partition tolerance: quorum + self-fencing + tự hạ cấp');

  step(1, 'Trạng thái ban đầu');
  const before = await routerStatus(2);
  if (before.routes.some((r) => r.backends[0].state !== 'primary')) {
    bad('Primary hiện không ở máy 1 → trên MÁY 1 chạy: node deploy/cluster.mjs failback');
    process.exit(1);
  }
  table([...routeRow('máy 1', await routerStatus(1)), ...routeRow('máy 2', before)], ['pg-router', 'Cụm', 'Thấy được', 'Ghi', 'Primary']);
  await pause();

  step(2, `Khách đặt vé liên tục qua Frontend LB ${GATEWAY}`);
  const ticks = [];
  let running = true;
  const traffic = (async () => {
    let i = 0;
    while (running) {
      i++;
      const t = Date.now();
      let r = { status: 0, data: {} };
      try {
        await post('/dev/reset', null, 6000);
        r = await post('/booking', { showtimeId: '1', seatId: '20', userName: `ISO_${i}` }, 6000);
      } catch { /* lỗi mạng */ }
      ticks.push({ t, ok: r.status === 201, node: r.data?.nodeId });
      process.stdout.write(r.status === 201 ? (r.data.nodeId === 'node1' ? c.cyan('█') : c.green('█')) : c.red('█'));
      await sleep(Math.max(0, 700 - (Date.now() - t)));
    }
  })();
  await sleep(4000);
  console.log();

  step(3, 'Cô lập máy 1 khỏi mạng');
  const cutAt = Date.now();
  await stepOnMachine1('Tắt Wi-Fi máy 1 (Win + A → bấm Wi-Fi)', isolate1);
  process.stdout.write('  ');
  const promoted = await waitFor(async () => {
    const rs = await routerStatus(2);
    return rs && rs.routes.every((r) => r.backends[1].state === 'primary' && r.primary === r.backends[1].addr);
  }, 120000, 1000);
  await waitFor(() => ticks.slice(-3).length === 3 && ticks.slice(-3).every((x) => x.ok && x.t > cutAt), 30000, 500);
  console.log();
  promoted ? ok('Máy 2 + Node 3 (2/3 phiếu) đã bầu máy 2 lên PRIMARY.') : bad('Máy 2 chưa lên Primary sau 2 phút.');
  table([...routeRow('máy 1', await routerStatus(1)), ...routeRow('máy 2', await routerStatus(2))], ['pg-router', 'Cụm', 'Thấy được', 'Ghi', 'Primary']);
  note('Máy 1 vẫn tưởng mình là Primary (không ai báo cho nó), nhưng router máy 1 chỉ thấy 1/3 nút → tự CHẶN GHI.');
  if (!(REHEARSAL && localNodes().includes(1))) info(c.gray('Người ở máy 1 chiếu: node deploy/cluster.mjs status → "quorum 1/3 MẤT -> chặn ghi"'));
  await pause();

  step(4, 'Nối mạng lại cho máy 1');
  const healAt = Date.now();
  await stepOnMachine1('Bật lại Wi-Fi máy 1', reconnect1);
  const demoted = await waitFor(async () => {
    const rs = await routerStatus(2);
    return rs && rs.routes.every((r) => r.backends[0].state === 'standby');
  }, 150000, 2000);
  running = false;
  await traffic;
  console.log();
  demoted
    ? ok(`Máy 1 thấy Primary máy 2 có timeline cao hơn → tự hạ cấp, pg_rewind, về STANDBY sau ${((Date.now() - healAt) / 1000).toFixed(0)} giây.`)
    : bad('Máy 1 chưa về Standby.');

  const firstFail = ticks.find((x) => x.t >= cutAt && !x.ok);
  const back = ticks.find((x) => x.t > (firstFail?.t || cutAt) && x.ok);
  info(`Gián đoạn đặt vé: ${c.bold(c.yellow(firstFail && back ? ((back.t - firstFail.t) / 1000).toFixed(1) + ' giây' : '0 giây'))} · ${ticks.filter((x) => x.ok).length}/${ticks.length} lượt thành công`);
  info(`${c.cyan('█')} xử lý ở máy 1  ${c.green('█')} xử lý ở máy 2  ${c.red('█')} lỗi`);
  const after = await routerStatus(2);
  table(after.routes.map((r) => [r.name, r.backends.map((b) => `${b.addr}=${b.state}/tl${b.timeline}`).join(', '), r.primary]), ['Cụm', 'Các nút', 'Primary']);

  conclude([
    'Phân vùng mạng: phía có đa số (máy 2 + Node 3) tiếp tục phục vụ, phía thiểu số (máy 1) tự chặn ghi.',
    'Máy cũ quay lại không được làm chủ: timeline thấp hơn → tự hạ cấp và tua lại dữ liệu theo chủ mới (fencing).',
    'Plan cũ chỉ lo "Primary chết"; đây là trường hợp nguy hiểm hơn: Primary SỐNG nhưng bị cô lập.',
    `Đưa Primary về máy 1 sau demo: ${c.bold('node deploy/cluster.mjs failback')} (trên máy 1).`,
  ]);
});
