// KỊCH BẢN 7 — NAMESPACES: mỗi container "tưởng" mình là cả một máy
//   node demo/extra-chuong3/07-namespaces.mjs
import { banner, step, info, ok, note, cmd, conclude, c, docker, dockerTry, dexec, bookingContainers, pause, main, table } from '../lib.mjs';

main(async () => {
  banner('07', 'NAMESPACES — CÔ LẬP CÁI NHÌN CỦA TIẾN TRÌNH', 'mục 3.2.2 – Containers: namespaces (PID, UTS, NET, MNT)');

  step(1, 'Tái hiện đúng lệnh trong giáo trình: unshare --pid --fork --mount-proc');
  cmd('docker run --rm --privileged alpine:3.20 unshare --pid --fork --mount-proc ps');
  const r = dockerTry('run', '--rm', '--privileged', 'alpine:3.20', 'unshare', '--pid', '--fork', '--mount-proc', 'ps');
  console.log(c.gray(r.out.split('\n').map((l) => '    ' + l).join('\n')));
  note('Trong PID namespace mới, ps chỉ thấy chính nó với PID = 1; mọi tiến trình khác "biến mất".');
  await pause();

  step(2, 'PID namespace: cùng MỘT tiến trình, HAI số hiệu');
  cmd('docker exec api-gateway ps            # nhìn từ bên trong container');
  console.log(c.gray(dexec('api-gateway', 'ps -o pid,comm,args | head -3').split('\n').map((l) => '    ' + l).join('\n')));
  cmd('docker top api-gateway                # nhìn từ máy chủ (máy ảo Linux của Docker)');
  console.log(c.gray(docker('top', 'api-gateway', '-o', 'pid,ppid,comm').split('\n').map((l) => '    ' + l).join('\n')));
  ok('Tiến trình node là PID 1 bên trong container, nhưng mang PID khác hẳn trên máy chủ.');
  await pause();

  step(3, 'UTS + NET + MNT namespace của từng container trong hệ thống');
  const cts = ['api-gateway', 'inventory-service', ...bookingContainers(), 'notification-service', 'postgres-inventory', 'redis'];
  const rows = cts.map((ct) => [
    ct.replace('cachethongphantan-datvexemphim-', ''),
    dexec(ct, 'hostname'),
    dexec(ct, "ip -4 -o addr show eth0 | awk '{print $4}'"),
    dexec(ct, 'cat /proc/1/comm'),
    dexec(ct, '. /etc/os-release && echo $PRETTY_NAME'),
  ]);
  table(rows, ['Container', 'Hostname (UTS)', 'IP riêng (NET)', 'PID 1', 'Hệ thống tệp gốc (MNT)']);
  note('Mỗi container có hostname, card mạng/IP, cây tiến trình và hệ thống tệp riêng — dù cùng chạy trên một máy.');
  await pause();

  step(4, 'Định danh trong mạng ảo: tìm service theo tên thay vì địa chỉ');
  cmd('docker exec api-gateway nslookup booking-service');
  const ns = dexec('api-gateway', 'nslookup booking-service 2>/dev/null | grep -A20 "Name:" | grep Address || true');
  console.log(c.gray(ns.split('\n').map((l) => '    ' + l).join('\n')));
  info('DNS nội bộ của Docker trả về IP của mọi bản sao booking-service đang chạy.');

  conclude([
    'Namespace tạo ảo giác "tôi là duy nhất": PID riêng, hostname riêng, mạng riêng, cây thư mục riêng.',
    'Nhờ vậy 4 microservice + 2 PostgreSQL + Redis + RabbitMQ chạy cạnh nhau trên 1 máy mà không nhìn thấy nhau.',
    'Đây là cùng ý tưởng với Vserver của PlanetLab: hai tiến trình ở hai container có thể cùng UID/PID mà không liên quan.',
  ]);
});
