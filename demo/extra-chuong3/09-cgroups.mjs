// KỊCH BẢN 9 — CGROUPS: giới hạn tài nguyên cho từng container
//   node demo/extra-chuong3/09-cgroups.mjs
import { banner, step, info, ok, bad, note, cmd, conclude, c, docker, dockerTry, dexec, sleep, pause, main, table, get } from '../lib.mjs';

function cgroupOf(ct) {
  const v2 = dexec(ct, 'cat /sys/fs/cgroup/memory.max 2>/dev/null || true');
  if (v2) return { mem: v2, cpu: dexec(ct, 'cat /sys/fs/cgroup/cpu.max'), file: '/sys/fs/cgroup/{memory.max,cpu.max}' };
  return {
    mem: dexec(ct, 'cat /sys/fs/cgroup/memory/memory.limit_in_bytes'),
    cpu: dexec(ct, 'echo $(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us) $(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us)'),
    file: '/sys/fs/cgroup/memory/memory.limit_in_bytes, cpu.cfs_quota_us',
  };
}
// Thời gian CPU (giây) mà cả nhóm tiến trình đã dùng — bộ đếm do chính cgroup ghi lại
function cpuSeconds(ct) {
  const v2 = dexec(ct, "grep usage_usec /sys/fs/cgroup/cpu.stat 2>/dev/null | awk '{print $2}' || true");
  if (v2) return Number(v2) / 1e6;
  return Number(dexec(ct, 'cat /sys/fs/cgroup/cpuacct/cpuacct.usage')) / 1e9;
}

const mib = (b) => (Number(b) > 1e15 || b === 'max' ? '∞' : `${Math.round(Number(b) / 2 ** 20)} MiB`);

main(async () => {
  banner('09', 'CGROUPS — HỆ ĐIỀU HÀNH KIỂM SOÁT TÀI NGUYÊN CỦA CONTAINER', 'mục 3.2.2 – Containers: control groups');

  step(1, 'Giới hạn khai báo trong docker-compose.yml (deploy.resources.limits) → ghi vào cgroup');
  const cts = ['api-gateway', 'inventory-service', 'notification-service', 'postgres-inventory'];
  const rows = cts.map((ct) => {
    const g = cgroupOf(ct);
    const [quota, period] = g.cpu.split(' ');
    return [ct, mib(g.mem), quota === 'max' || quota === '-1' ? '∞' : `${(quota / period).toFixed(2)} CPU`, g.file];
  });
  table(rows, ['Container', 'RAM tối đa', 'CPU tối đa', 'Đọc từ tệp cgroup']);
  cmd('docker stats --no-stream');
  const stats = dockerTry('stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.PIDs}}');
  if (stats.code === 0) {
    table(stats.out.split('\n').filter(Boolean).map((l) => l.replace('cachethongphantan-datvexemphim-', '').split('|')),
      ['Container', 'CPU', 'RAM dùng / giới hạn', 'Số luồng']);
  }
  note('postgres-inventory không khai báo giới hạn ⇒ ∞ (dùng tới hết tài nguyên máy ảo).');
  await pause();

  step(2, 'Giới hạn CPU: chạy vòng lặp bận trong container chỉ được 0,5 CPU');
  cmd('docker run --rm --cpus 0.5 node:20-alpine node -e "while(true){}"');
  const name = `cg-cpu-${Date.now()}`;
  docker('run', '-d', '--rm', '--name', name, '--cpus', '0.5', 'node:20-alpine', 'node', '-e', 'while(true){}');
  await sleep(1500);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const u0 = cpuSeconds(name);
    const t0 = performance.now();
    await sleep(1000);
    samples.push(`${(((cpuSeconds(name) - u0) / ((performance.now() - t0) / 1000)) * 100).toFixed(0)}%`);
  }
  info(`CPU đo từ bộ đếm cgroup mỗi giây: ${samples.map((s) => c.bold(s)).join(' · ')}  (vòng lặp vô hạn nhưng chỉ ~50% một lõi)`);
  dockerTry('rm', '-f', name);
  ok('cgroup cpu (CFS quota) cắt lượng thời gian CPU mà nhóm tiến trình được dùng trong mỗi chu kỳ.');
  await pause();

  step(3, 'Giới hạn RAM: tiến trình cố cấp phát vượt 64 MiB');
  cmd('docker run --memory 64m --memory-swap 64m node:20-alpine node -e "<cấp phát 10 MiB mỗi 100 ms>"');
  const oom = `cg-oom-${Date.now()}`;
  const script = "const a=[];let n=0;setInterval(()=>{const b=Buffer.alloc(10*1024*1024,1);a.push(b);n+=10;console.log('da cap phat',n,'MiB')},100)";
  dockerTry('run', '--name', oom, '--memory', '64m', '--memory-swap', '64m', 'node:20-alpine', 'node', '-e', script);
  const logs = dockerTry('logs', oom);
  const lastLines = (logs.out || '').split('\n').slice(-3);
  console.log(c.gray(lastLines.map((l) => '    ' + l).join('\n')));
  const state = docker('inspect', oom, '--format', '{{.State.ExitCode}} {{.State.OOMKilled}}');
  dockerTry('rm', '-f', oom);
  const [code, killed] = state.split(' ');
  killed === 'true' || code === '137'
    ? ok(`Kernel OOM-killer đã kết liễu tiến trình: exit code ${c.bold(code)}, OOMKilled=${c.bold(killed)}`)
    : bad(`Kết thúc với exit code ${code}, OOMKilled=${killed}`);
  await pause();

  step(4, 'Cô lập lỗi: hệ thống đặt vé có bị ảnh hưởng không?');
  const h = await get('/health');
  ok(`api-gateway vẫn trả lời HTTP ${h.status} sau ${h.ms} ms — container “hư” không kéo sập container khác.`);

  conclude([
    'cgroups giới hạn RAM, CPU, số tiến trình… cho một NHÓM tiến trình — container là một nhóm như vậy.',
    'Không có cgroups, một service lỗi rò bộ nhớ có thể ăn hết RAM và làm sập mọi service khác trên cùng máy.',
    'Giáo trình: hệ điều hành chủ ngăn một container dùng quá nhiều tài nguyên làm ảnh hưởng container khác.',
  ]);
});
