// KỊCH BẢN 8 — UNION FILE SYSTEM: các image xếp lớp và dùng chung lớp nền
//   node demo/extra-chuong3/08-union-fs.mjs
import { banner, step, info, ok, note, cmd, conclude, c, docker, dexec, pause, main, table } from '../lib.mjs';

const IMAGES = ['api-gateway', 'booking-service', 'inventory-service', 'notification-service'].map((s) => `movie-booking/${s}:latest`);
const short = (d) => d.replace('sha256:', '').slice(0, 12);

main(async () => {
  banner('08', 'UNION FILE SYSTEM — XẾP LỚP & DÙNG CHUNG', 'mục 3.2.2 – Containers: union file system');

  step(1, 'Danh sách lớp (layer) của 4 image microservice');
  cmd('docker image inspect <image> --format "{{json .RootFS.Layers}}"');
  const layers = IMAGES.map((img) => JSON.parse(docker('image', 'inspect', img, '--format', '{{json .RootFS.Layers}}')));
  const base = JSON.parse(docker('image', 'inspect', 'node:20-alpine', '--format', '{{json .RootFS.Layers}}'));
  let shared = 0;
  while (shared < base.length && layers.every((l) => l[shared] === base[shared])) shared++;
  table(IMAGES.map((img, i) => [img.replace('movie-booking/', '').replace(':latest', ''), layers[i].length, shared, layers[i].length - shared,
    layers[i].slice(shared).map(short).join(' ').slice(0, 40) + '…']), ['Image', 'Tổng lớp', 'Lớp nền chung', 'Lớp riêng', 'Lớp riêng (digest)']);
  info(`${shared} lớp nền chung = image ${c.bold('node:20-alpine')}: ${base.map(short).join(', ')}`);
  ok('Lớp nền chỉ lưu MỘT lần trên đĩa và được gắn (mount) chỉ-đọc vào cả 4 image.');
  await pause();

  step(2, 'Dung lượng: tổng "ảo" vs thực tế trên đĩa');
  cmd('docker system df -v   (cột SHARED SIZE / UNIQUE SIZE)');
  const df = docker('system', 'df', '-v', '--format', '{{json .Images}}');
  const imgs = JSON.parse(df).filter((x) => x.Repository.startsWith('movie-booking/'));
  table(imgs.map((x) => [x.Repository.replace('movie-booking/', ''), x.Size, x.SharedSize, x.UniqueSize]), ['Image', 'Kích thước', 'Dùng chung', 'Riêng']);
  await pause();

  step(3, 'Chỉ lớp trên cùng của container là ghi được');
  cmd('docker exec api-gateway sh -c "echo xin-chao > /tmp/union-fs-demo.txt && rm /etc/motd 2>/dev/null"');
  dexec('api-gateway', 'echo xin-chao > /tmp/union-fs-demo.txt; rm -f /etc/motd');
  cmd('docker diff api-gateway');
  const diff = docker('diff', 'api-gateway').split('\n').filter((l) => /union-fs-demo|motd|^C \/tmp$|^C \/etc$/.test(l));
  console.log(c.gray(diff.map((l) => '    ' + l).join('\n')));
  info(c.gray('A = thêm mới, C = thay đổi, D = xoá (whiteout) — tất cả chỉ nằm trong lớp ghi được của container.'));
  const driver = docker('inspect', 'api-gateway', '--format', '{{.GraphDriver.Name}}');
  info(`Storage driver: ${c.bold(driver)} — lowerdir (các lớp image, chỉ đọc) + upperdir (lớp container, ghi được) ⇒ mergeddir.`);
  ok('Image gốc không đổi: container mới tạo từ cùng image sẽ không thấy tệp này.');
  dexec('api-gateway', 'rm -f /tmp/union-fs-demo.txt');

  conclude([
    'Container không sao chép cả môi trường: các lớp chỉ-đọc được xếp chồng bằng mount, chỉ lớp trên cùng ghi được.',
    'Bốn microservice dùng chung lớp nền node:20-alpine ⇒ tiết kiệm đĩa, tải về nhanh, nhân bản nhanh.',
    'Khi container bị xoá, lớp ghi được biến mất — dữ liệu cần giữ phải nằm ở volume (vd: inventory_pgdata).',
  ]);
});
