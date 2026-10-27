import * as fs from 'fs';
import * as os from 'os';
import { monitorEventLoopDelay } from 'perf_hooks';

/**
 * Thông tin runtime của tiến trình đang chạy trong container.
 * Phục vụ demo Chương 3:
 *  - 3.1 Threads: số luồng nhân (kernel thread) thật của tiến trình Node.js, độ trễ event loop.
 *  - 3.2 Virtualization: PID trong namespace, hostname (UTS namespace), IP (NET namespace),
 *    giới hạn cgroups (memory.max, cpu.max), kernel dùng chung với host/VM.
 */

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

function listThreads(): { tid: string; name: string }[] {
  try {
    return fs
      .readdirSync('/proc/self/task')
      .map((tid) => ({ tid, name: readText(`/proc/self/task/${tid}/comm`) || '?' }))
      .sort((a, b) => Number(a.tid) - Number(b.tid));
  } catch {
    return [];
  }
}

function formatBytes(raw: string | null): string {
  if (!raw) return 'unknown';
  if (raw === 'max') return 'không giới hạn';
  const n = Number(raw);
  if (!Number.isFinite(n) || n > 1e15) return 'không giới hạn';
  return `${Math.round(n / 1024 / 1024)} MiB`;
}

function cgroupLimits() {
  // cgroup v2 (Docker Desktop / WSL2 / kernel mới)
  const memMax = readText('/sys/fs/cgroup/memory.max');
  const cpuMax = readText('/sys/fs/cgroup/cpu.max');
  const memNow = readText('/sys/fs/cgroup/memory.current');
  if (memMax !== null || cpuMax !== null) {
    let cpus = 'không giới hạn';
    if (cpuMax && !cpuMax.startsWith('max')) {
      const [quota, period] = cpuMax.split(' ').map(Number);
      cpus = `${(quota / period).toFixed(2)} CPU`;
    }
    return { version: 'v2', memoryLimit: formatBytes(memMax), memoryUsage: formatBytes(memNow), cpuLimit: cpus, raw: { memMax, cpuMax } };
  }
  // cgroup v1 fallback
  const memV1 = readText('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const memV1Now = readText('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const quota = readText('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
  const period = readText('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
  const cpus = quota && period && Number(quota) > 0 ? `${(Number(quota) / Number(period)).toFixed(2)} CPU` : 'không giới hạn';
  return { version: 'v1', memoryLimit: formatBytes(memV1), memoryUsage: formatBytes(memV1Now), cpuLimit: cpus, raw: { memV1, quota, period } };
}

function primaryIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const addr of nets[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'unknown';
}

export function getRuntimeInfo(service: string) {
  const threads = listThreads();
  const stat = readText('/proc/1/comm');
  return {
    service,
    hostname: os.hostname(),
    ip: primaryIp(),
    pid: process.pid,
    pid1Command: stat,
    kernel: os.release(),
    platform: `${os.type()} ${os.arch()}`,
    nodeVersion: process.version,
    uptimeSec: Math.round(process.uptime()),
    threads: {
      count: threads.length,
      names: threads.map((t) => t.name),
      uvThreadpoolSize: Number(process.env.UV_THREADPOOL_SIZE || 4),
    },
    eventLoop: {
      meanMs: Number((loopDelay.mean / 1e6).toFixed(2)),
      p99Ms: Number((loopDelay.percentile(99) / 1e6).toFixed(2)),
      maxMs: Number((loopDelay.max / 1e6).toFixed(2)),
    },
    memory: {
      rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    cgroup: cgroupLimits(),
    timestamp: new Date().toISOString(),
  };
}
