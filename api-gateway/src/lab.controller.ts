import { Controller, Get, Post, Query } from '@nestjs/common';
import { promises as dns } from 'dns';
import * as os from 'os';
import { GatewayService } from './gateway.service';
import { setTimeout as delay } from 'timers/promises';
import { Worker } from 'worker_threads';
import { getRuntimeInfo } from './common/runtime-info';

/**
 * Endpoint phục vụ demo:
 *  - /lab/cluster  : ảnh chụp toàn cụm (bản sao booking, Primary/Standby, Redis, hàng đợi, circuit breaker)
 * và các endpoint phụ cho phần demo bổ trợ Chương 3 (demo/extra-chuong3):
 *  - /lab/runtime  : gom thông tin luồng + namespace + cgroups của mọi container
 *  - /lab/block    : tính toán nặng NGAY TRÊN luồng event loop -> cả tiến trình bị "đóng băng"
 *  - /lab/offload  : cùng khối lượng tính toán nhưng đẩy sang worker thread -> server vẫn phản hồi
 *  - /lab/slow     : tài nguyên "ở xa" trả lời sau ms mili-giây (mô phỏng độ trễ WAN, không tốn CPU)
 */

const MAX_WORK_MS = 5000;

function clampMs(raw: string): number {
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return 2000;
  return Math.min(ms, MAX_WORK_MS);
}

// Vòng lặp bận CPU (giống ví dụ busy-waiting trong mục 3.1.1 của giáo trình)
function busyWork(ms: number): number {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) {
    for (let i = 0; i < 1e5; i++) x += Math.sqrt(i);
  }
  return x;
}

const WORKER_SOURCE = `
const { parentPort, workerData, threadId } = require('worker_threads');
const end = Date.now() + workerData.ms;
let x = 0;
while (Date.now() < end) { for (let i = 0; i < 1e5; i++) x += Math.sqrt(i); }
parentPort.postMessage({ threadId });
`;

async function fetchJson(url: string, timeoutMs = 1500, headers?: Record<string, string>): Promise<any> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return await res.json();
  } catch (err) {
    return { error: `${url}: ${err.message}` };
  }
}

// fetch() không chấp nhận user:pass trong URL -> tách ra thành header Basic Auth
function splitCredentials(raw: string): { base: string; headers: Record<string, string> } {
  const u = new URL(raw);
  const token = Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
  u.username = '';
  u.password = '';
  return { base: u.toString().replace(/\/$/, ''), headers: { Authorization: `Basic ${token}` } };
}

@Controller('lab')
export class LabController {
  private readonly inventoryHttp = process.env.INVENTORY_HTTP_URL || 'http://inventory-service:3002';
  private readonly bookingHost = process.env.BOOKING_HTTP_HOST || 'booking-service';
  private readonly bookingPort = process.env.BOOKING_HTTP_PORT || '3001';
  private readonly pgRouter = process.env.PG_ROUTER_URL || 'http://pg-router:8008';
  private readonly rabbit = splitCredentials(process.env.RABBITMQ_MGMT_URL || 'http://guest:guest@rabbitmq:15672');

  constructor(private readonly gatewayService: GatewayService) {}

  private async bookingIps(): Promise<string[]> {
    try {
      return await dns.resolve4(this.bookingHost);
    } catch {
      return [];
    }
  }

  @Get('cluster')
  async getCluster() {
    const ips = await this.bookingIps();
    const [inventory, router, queue, ...bookings] = await Promise.all([
      fetchJson(`${this.inventoryHttp}/lab/cluster`, 2500),
      fetchJson(`${this.pgRouter}/status`, 1500),
      fetchJson(`${this.rabbit.base}/api/queues/%2F/booking.confirmed`, 1500, this.rabbit.headers),
      ...ips.map((ip) => fetchJson(`http://${ip}:${this.bookingPort}/health`, 1000)),
    ]);
    return {
      nodeId: process.env.NODE_ID || 'node1',
      gateway: { hostname: os.hostname(), ...this.gatewayService.getCircuitStatus() },
      router: router.error ? { ok: false, error: router.error } : { ok: true, ...router },
      booking: ips.map((ip, i) => ({ ip, ok: !bookings[i].error, hostname: bookings[i].hostname || null })),
      inventory: inventory.error ? { ok: false, error: inventory.error } : { ok: true, ...inventory },
      queue: queue.error
        ? { ok: false, error: queue.error }
        : { ok: true, name: queue.name, durable: queue.durable, ready: queue.messages_ready ?? 0, unacked: queue.messages_unacknowledged ?? 0, consumers: queue.consumers ?? 0 },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('runtime')
  async getRuntime() {
    // Docker DNS trả về IP của TẤT CẢ bản sao booking-service -> hỏi từng bản sao một
    const bookingIps = await this.bookingIps();

    const [inventory, ...bookings] = await Promise.all([
      fetchJson(`${this.inventoryHttp}/lab/runtime`),
      ...bookingIps.map((ip) => fetchJson(`http://${ip}:${this.bookingPort}/lab/runtime`)),
    ]);

    return {
      services: [getRuntimeInfo('api-gateway'), inventory, ...bookings],
      bookingReplicas: bookingIps.length,
      timestamp: new Date().toISOString(),
    };
  }

  // Đổi chiến lược khoá của inventory-service trên máy này (pessimistic | optimistic)
  @Post('lock-strategy')
  async setLockStrategy(@Query('mode') mode: string) {
    try {
      const res = await fetch(`${this.inventoryHttp}/lab/lock-strategy?mode=${encodeURIComponent(mode || '')}`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      return await res.json();
    } catch (err) {
      return { error: err.message };
    }
  }

  @Get('slow')
  async slow(@Query('ms') msRaw: string, @Query('id') id: string) {
    const ms = clampMs(msRaw);
    const startedAt = new Date().toISOString();
    await delay(ms);
    return { mode: 'slow', id: id || null, delayMs: ms, startedAt, finishedAt: new Date().toISOString() };
  }

  @Get('block')
  block(@Query('ms') msRaw: string) {
    const ms = clampMs(msRaw);
    const startedAt = new Date().toISOString();
    console.log(`[API-GATEWAY] [TIME: ${startedAt}] LAB block: running ${ms}ms CPU work ON the event-loop thread`);
    const t0 = Date.now();
    busyWork(ms);
    return { mode: 'block', thread: 'main (event loop)', requestedMs: ms, tookMs: Date.now() - t0, startedAt, finishedAt: new Date().toISOString() };
  }

  @Get('offload')
  async offload(@Query('ms') msRaw: string) {
    const ms = clampMs(msRaw);
    const startedAt = new Date().toISOString();
    console.log(`[API-GATEWAY] [TIME: ${startedAt}] LAB offload: running ${ms}ms CPU work in a worker thread`);
    const t0 = Date.now();
    const result = await new Promise<{ threadId: number }>((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { ms } });
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    return { mode: 'offload', thread: `worker #${result.threadId}`, requestedMs: ms, tookMs: Date.now() - t0, startedAt, finishedAt: new Date().toISOString() };
  }
}
