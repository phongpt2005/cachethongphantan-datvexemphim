// KỊCH BẢN 3 — CHỊU LỖI TỪNG PHẦN & TÁCH RỜI BẤT ĐỒNG BỘ (RabbitMQ 3 nút, quorum queue Raft)
//   (1) Dịch vụ email máy 1 chết -> notification máy 2 tiếp quản
//   (2) Dịch vụ email cả 2 máy chết -> vẫn bán vé, thông điệp nằm chờ trong hàng đợi bền
//   (3) RabbitMQ máy 1 (leader Raft) chết -> leader mới được bầu, thông điệp không mất
//   (4) Bật lại tất cả -> gửi bù đủ email
//   node demo/03-hang-doi.mjs          (chạy trên Node 3 — máy trình chiếu)
import { banner, step, info, ok, bad, note, conclude, c, docker, dockerTry, dockerLogs, book, resetData, rabbitStatus, sleep, pause, main, onMachine, localNodes, NODES, GATEWAY, waitFor } from './lib.mjs';

const users = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${['An', 'Binh', 'Chi', 'Dung'][i]}_${Date.now().toString().slice(-4)}`);

// Số thông điệp chờ: rabbitmqctl tại chỗ nếu có (tức thời), không thì API quản trị (trễ ~5 s)
async function queue() {
  for (const n of [3, 2, 1]) {
    if (!localNodes().includes(n)) continue;
    const r = dockerTry('exec', `rabbitmq-node${n}`, 'rabbitmqctl', '-q', 'list_queues', 'name', 'messages_ready', 'leader', 'members');
    const line = r.out.split(/\r?\n/).find((l) => l.startsWith('booking.confirmed'));
    if (r.code === 0 && line) {
      const [, ready, leader, ...members] = line.trim().split(/\s+/);
      return { ready: Number(ready), leader: leader.replace('rabbit@', ''), members: members.join(' ').replace(/[[\]]/g, '').split(/,\s*/).map((m) => m.replace('rabbit@', '')) };
    }
  }
  for (const n of [3, 2, 1]) {
    const s = await rabbitStatus(n);
    if (s) return { ready: s.ready, leader: s.leader, members: s.members };
  }
  return { ready: '?', leader: '?', members: [] };
}

async function bookMany(list) {
  for (const u of list) {
    await resetData();
    const r = await book(u);
    r.status === 201 ? ok(`${u}: HTTP 201 sau ${c.bold(r.ms + ' ms')} (gateway ${r.data.nodeId})`) : bad(`${u}: HTTP ${r.status}`);
  }
}

const emailsFor = (ct, since, list) => localNodes().includes(Number(ct.slice(-1)))
  ? dockerLogs(ct, since).filter((l) => l.includes('Email successfully') && list.some((u) => l.includes(u)))
  : [];

main(async () => {
  banner('03', 'DỊCH VỤ EMAIL & HÀNG ĐỢI CHẾT TỪNG PHẦN — VẪN BÁN VÉ, KHÔNG MẤT EMAIL', 'Fault tolerance + Asynchronous decoupling (quorum queue, Raft)');
  const q0 = await queue();
  info(`Hàng đợi booking.confirmed: ${q0.members.length} bản sao Raft [${q0.members.join(', ')}] · leader ${c.bold(q0.leader)}`);

  step(1, 'Tắt dịch vụ email của MÁY 1 — máy 2 có tiếp quản không?');
  await onMachine(1, 'tắt dịch vụ email máy 1', 'docker stop notification-node1', () => docker('stop', 'notification-node1'));
  let since = new Date().toISOString();
  const g1 = users('Tiepquan', 2);
  await bookMany(g1);
  await waitFor(() => emailsFor('notification-node2', since, g1).length >= g1.length, 15000, 1000);
  const took = emailsFor('notification-node2', since, g1);
  took.length ? took.forEach((l) => ok('notification-node2: ' + l.trim())) : info('(Xem log notification-node2 trên MÁY 2: email đã được gửi)');
  note('Cả 2 máy cùng nghe một hàng đợi (competing consumers): máy 1 chết thì máy 2 nhận hết thông điệp.');
  await pause();

  step(2, 'Tắt luôn dịch vụ email MÁY 2 — không còn ai gửi email');
  await onMachine(2, 'tắt dịch vụ email máy 2', 'docker stop notification-node2', () => docker('stop', 'notification-node2'));
  const g2 = users('Cho', 3);
  await bookMany(g2);
  await waitFor(async () => (await queue()).ready >= g2.length, 12000, 1000); // chỉ số hàng đợi cập nhật sau vài giây
  const q2 = await queue();
  info(`Hàng đợi booking.confirmed: ${c.bold(c.yellow(q2.ready + ' thông điệp đang chờ'))} — khách vẫn nhận vé ngay, email chỉ bị hoãn`);
  await pause();

  // Tắt đúng nút đang là leader Raft (có thể ở máy 1, máy 2 hoặc Node 3) để thấy bầu leader mới
  const victim = Number(String(q2.leader).slice(-1)) || 1;
  step(3, `Tắt RabbitMQ của ${NODES[victim].label} — nút đang là LEADER Raft của hàng đợi`);
  await onMachine(victim, `tắt RabbitMQ ${NODES[victim].label}`, `docker stop rabbitmq-node${victim}`, () => docker('stop', `rabbitmq-node${victim}`));
  await waitFor(async () => { const q = await queue(); return q.leader && q.leader !== `rabbit-node${victim}`; }, 20000, 1000);
  await sleep(2000);
  const q3 = await queue();
  info(`Còn 2/3 nút · leader cũ ${c.bold(q2.leader)} → leader mới ${c.bold(c.green(q3.leader))} · thông điệp chờ: ${c.bold(q3.ready)}`);
  q3.ready === q2.ready ? ok('Không mất thông điệp nào: mỗi thông điệp đã được ghi trên đa số nút trước khi xác nhận.') : info(`Trước: ${q2.ready} · sau: ${q3.ready}`);
  note('Raft: leader chết -> 2 nút còn lại vẫn là đa số (2/3) -> bầu leader mới trong vài giây.');
  await pause();

  step(4, 'Bật lại mọi thứ — gửi bù email');
  since = new Date().toISOString();
  const restart1 = victim === 1 ? ['rabbitmq-node1', 'notification-node1'] : ['notification-node1'];
  const restart2 = victim === 2 ? ['rabbitmq-node2', 'notification-node2'] : ['notification-node2'];
  if (victim === 3) await onMachine(3, 'bật lại RabbitMQ Node 3', 'docker start rabbitmq-node3', () => docker('start', 'rabbitmq-node3'));
  await onMachine(1, 'bật lại các container đã tắt ở máy 1', `docker start ${restart1.join(' ')}`, () => docker('start', ...restart1));
  await onMachine(2, 'bật lại các container đã tắt ở máy 2', `docker start ${restart2.join(' ')}`, () => docker('start', ...restart2));
  await waitFor(async () => (await queue()).ready === 0, 60000, 1500);
  info(`Hàng đợi booking.confirmed: ${c.bold(c.green((await queue()).ready + ' thông điệp'))}`);
  await sleep(1500);
  const sent = [...emailsFor('notification-node1', since, g2), ...emailsFor('notification-node2', since, g2)];
  sent.forEach((l) => ok(l.trim()));
  if (localNodes().includes(1) && localNodes().includes(2)) {
    sent.length >= g2.length ? ok(`Đủ ${g2.length} email cho các khách đặt vé lúc không còn dịch vụ email nào chạy.`) : bad(`Mới thấy ${sent.length}/${g2.length} email`);
  } else {
    info('Email được gửi trên máy 1 hoặc máy 2 — xem log notification ở hai máy đó.');
  }

  conclude([
    'Lỗi từng phần: dịch vụ email hay một nút RabbitMQ chết đều không chặn việc bán vé.',
    'Tách rời bất đồng bộ: booking chỉ phát sự kiện; email được gửi khi có worker sẵn sàng (eventual consistency).',
    'Quorum queue (Raft) 3 nút: thông điệp có trên đa số nút nên chết 1 nút không mất gì, leader được bầu lại tự động.',
    `Đặt vé qua ${GATEWAY} (Frontend LB trên Node 3).`,
  ]);
});
