// KỊCH BẢN 10 — MÁY ẢO vs CONTAINER: chính máy demo đang chạy CẢ HAI
// Windows (host OS) → máy ảo Linux WSL2/Hyper-V do Docker Desktop tạo (VMM) → các container dùng chung kernel của máy ảo.
//   node demo/extra-chuong3/10-vm-vs-container.mjs
import os from 'node:os';
import { banner, step, info, ok, note, cmd, conclude, c, docker, dockerTry, dexec, nodeContainers, pause, main, table } from '../lib.mjs';

main(async () => {
  banner('10', 'MÁY ẢO vs CONTAINER — NGAY TRÊN MÁY DEMO', 'mục 3.2.1 (VMM native/hosted) & 3.2.3 (so sánh VM và container)');

  step(1, 'Tầng 1 — máy thật và hệ điều hành chủ');
  info(`Hệ điều hành chủ: ${c.bold(`${os.type()} ${os.release()}`)} · ${os.cpus().length} luồng CPU · ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM`);

  step(2, 'Tầng 2 — máy ảo Linux mà Docker Desktop dựng sẵn (VMM: Hyper-V/WSL2)');
  cmd('docker info --format "{{.OperatingSystem}} | {{.KernelVersion}} | {{.NCPU}} CPU | {{.MemTotal}}"');
  const [vmOs, vmKernel, vmCpu, vmMem] = docker('info', '--format', '{{.OperatingSystem}}|{{.KernelVersion}}|{{.NCPU}}|{{.MemTotal}}').split('|');
  info(`Máy ảo: ${c.bold(vmOs)} · kernel ${c.bold(vmKernel)} · ${vmCpu} vCPU · ${(vmMem / 2 ** 30).toFixed(1)} GiB RAM được cấp`);
  note('Windows không chạy được container Linux trực tiếp: Docker Desktop tạo một máy ảo có hệ điều hành khách là Linux.');
  await pause();

  step(3, 'Tầng 3 — các container: kernel là của ai?');
  cmd('docker exec <container> uname -r');
  const cts = [...nodeContainers(), 'postgres-inventory', 'postgres-booking', 'redis', 'rabbitmq'];
  const rows = cts.map((ct) => [ct.replace('cachethongphantan-datvexemphim-', ''), dexec(ct, 'uname -r'), dexec(ct, '. /etc/os-release && echo $ID $VERSION_ID')]);
  table(rows, ['Container', 'uname -r (kernel)', 'Userland (/etc/os-release)']);
  const kernels = new Set(rows.map((r) => r[1]));
  kernels.size === 1 && [...kernels][0] === vmKernel
    ? ok(`${rows.length} container → MỘT kernel duy nhất = kernel của máy ảo (${vmKernel}).`)
    : info(`Kernel: ${[...kernels].join(', ')}`);
  note('Container chỉ ảo hoá phần “môi trường phần mềm” (thư viện, tệp, tên tiến trình); máy ảo ảo hoá cả tập lệnh + hệ điều hành.');
  await pause();

  step(4, 'Chi phí khởi tạo: tạo một container mới mất bao lâu?');
  cmd('docker run --rm alpine:3.20 true   (đo 3 lần)');
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    dockerTry('run', '--rm', 'alpine:3.20', 'true');
    times.push(Math.round(performance.now() - t));
  }
  info(`Thời gian tạo + chạy + xoá container: ${times.map((x) => c.bold(x + ' ms')).join(' · ')}`);
  const mem = docker('stats', '--no-stream', '--format', '{{.Name}}={{.MemUsage}}').split('\n').filter((l) => /api-gateway|redis/.test(l));
  info(`RAM thực dùng: ${mem.map((m) => m.split('/')[0]).join(' · ')}  (so với máy ảo được cấp cứng ${(vmMem / 2 ** 30).toFixed(1)} GiB)`);

  step(5, 'Bảng so sánh (đối chiếu với nghiên cứu được giáo trình trích dẫn)');
  table([
    ['Đối tượng ảo hoá', 'Tập lệnh + toàn bộ hệ điều hành khách', 'Môi trường phần mềm, dùng chung kernel'],
    ['Cơ chế', 'VMM bẫy lệnh nhạy cảm (Popek–Goldberg)', 'namespaces + union FS + cgroups'],
    ['Khởi tạo', 'Khởi động cả một hệ điều hành', `~${Math.min(...times)} ms (đo ở bước 4)`],
    ['Hiệu năng I/O', 'Phụ thuộc VMM, thường kém hơn', 'Gần như chạy trực tiếp'],
    ['Cô lập', 'Mạnh hơn (kernel riêng)', 'Yếu hơn (chung kernel)'],
    ['Trong demo này', 'Máy ảo WSL2 chạy Docker Engine', 'Toàn bộ container của hệ thống đặt vé'],
  ], ['Tiêu chí', 'Máy ảo (VM)', 'Container']);

  conclude([
    'Máy demo minh hoạ đúng Hình 3.10(c): hosted VMM trên hệ điều hành chủ, rồi container chạy trong máy ảo.',
    'VM và container không loại trừ nhau: đám mây thường thuê VM (IaaS) rồi chạy container bên trong.',
    'Theo van Rijn & Rellermeyer (2021) được giáo trình dẫn: chênh lệch hiệu năng ngày càng nhỏ; container khó cô lập lập lịch CPU/đĩa hơn VM.',
  ]);
});
