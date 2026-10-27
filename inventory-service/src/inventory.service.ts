import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import Redis from 'ioredis';
import * as os from 'os';
import { Showtime } from './entities/showtime.entity';
import { Seat } from './entities/seat.entity';

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger('InventoryService');
  private readonly hostname = os.hostname();
  private readonly nodeId = process.env.NODE_ID || 'node1';

  private redisWrite: Redis | null = null;
  private redisRead: Redis | null = null;

  // Bộ đếm phục vụ demo: cache-aside hit/miss, số lần đọc ở Standby, số lần ghi ở Primary
  private readonly stats = { cacheHits: 0, cacheMisses: 0, replicaReads: 0, primaryWrites: 0 };
  // Ping Redis Master mỗi giây: máy chứa Master tắt nguồn thì TCP không báo đứt ngay
  private redisMasterAlive = false;

  constructor(
    @InjectRepository(Showtime)
    private readonly showtimeRepo: Repository<Showtime>,
    @InjectRepository(Seat)
    private readonly seatRepo: Repository<Seat>,
    @InjectDataSource()
    private readonly masterDataSource: DataSource,

    @InjectRepository(Showtime, 'replica')
    private readonly showtimeReadRepo: Repository<Showtime>,
    @InjectRepository(Seat, 'replica')
    private readonly seatReadRepo: Repository<Seat>,
    @InjectDataSource('replica')
    private readonly replicaDataSource: DataSource,
  ) {}

  // Khởi tạo từ biến môi trường, có thể đổi lúc chạy qua POST /lab/lock-strategy (phục vụ demo)
  private lockStrategy: 'pessimistic' | 'optimistic' =
    (process.env.LOCK_STRATEGY || 'pessimistic').toLowerCase() === 'optimistic' ? 'optimistic' : 'pessimistic';

  getLockStrategy(): 'pessimistic' | 'optimistic' {
    return this.lockStrategy;
  }

  setLockStrategy(mode: string) {
    this.lockStrategy = mode === 'optimistic' ? 'optimistic' : 'pessimistic';
    console.log(`[INVENTORY] [${this.nodeId}] LOCK_STRATEGY -> ${this.lockStrategy.toUpperCase()}`);
    return { nodeId: this.nodeId, lockStrategy: this.lockStrategy };
  }

  async onModuleInit() {
    const masterRedisHost = process.env.REDIS_MASTER_HOST || 'redis';
    const masterRedisPort = Number(process.env.REDIS_MASTER_PORT || 6379);
    const localRedisHost = process.env.REDIS_LOCAL_HOST || masterRedisHost;
    const localRedisPort = Number(process.env.REDIS_LOCAL_PORT || masterRedisPort);

    try {
      this.redisWrite = new Redis({
        host: masterRedisHost,
        port: masterRedisPort,
        lazyConnect: true,
        commandTimeout: 800, // Redis Master ở máy khác chết -> bỏ qua cache thay vì treo
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.redisWrite.on('error', (err) => {
        // Log quietly so optional Redis does not crash service
      });
      await this.redisWrite.connect().catch(() => {});
    } catch (e) {}

    try {
      this.redisRead = new Redis({
        host: localRedisHost,
        port: localRedisPort,
        lazyConnect: true,
        commandTimeout: 800,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.redisRead.on('error', (err) => {
        // Log quietly
      });
      await this.redisRead.connect().catch(() => {});
    } catch (e) {}

    setInterval(() => {
      const wasAlive = this.redisMasterAlive;
      (this.redisWrite ? this.redisWrite.ping() : Promise.reject())
        .then(() => { this.redisMasterAlive = true; })
        .catch(() => { this.redisMasterAlive = false; })
        .finally(() => {
          if (wasAlive !== this.redisMasterAlive) {
            console.log(`[INVENTORY] [${this.nodeId}] Redis Master ${this.redisMasterAlive ? 'OK -> dùng lại cache' : 'MẤT LIÊN LẠC -> bỏ qua cache, đọc thẳng CSDL'}`);
          }
        });
    }, 1000).unref();

    console.log(`[INVENTORY] [${this.nodeId}] Current LOCK_STRATEGY = ${this.getLockStrategy().toUpperCase()}`);
    console.log(`[INVENTORY] [${this.nodeId}] Redis connected: Write->${masterRedisHost}:${masterRedisPort}, Read->${localRedisHost}:${localRedisPort}`);
    await this.seedData();
  }

  async seedData() {
    try {
      let showtime = await this.showtimeRepo.findOne({ where: { id: '1' } });
      if (!showtime) {
        showtime = this.showtimeRepo.create({
          id: '1',
          movieName: 'Avengers: Secret Wars',
          room: 'Cinema Hall 1',
          showTime: '2026-10-01T19:30:00Z',
        });
        await this.showtimeRepo.save(showtime);
        console.log('[INVENTORY] Seed showtime created.');
      }

      const count = await this.seatRepo.count({ where: { showtimeId: '1' } });
      if (count === 0) {
        const seats: Seat[] = [];
        for (let i = 1; i <= 20; i++) {
          seats.push(
            this.seatRepo.create({
              id: `${i}`,
              showtimeId: '1',
              seatCode: `A${i}`,
              status: i === 20 ? 'available' : 'booked',
              version: 1,
            }),
          );
        }
        await this.seatRepo.save(seats);
        console.log('[INVENTORY] 20 seed seats created (A20 available).');
      }
    } catch (err) {
      console.error(`Seed error: ${err.message}`);
    }
  }

  async resetData() {
    for (let i = 1; i <= 20; i++) {
      await this.seatRepo.update(
        { id: `${i}` },
        { status: i === 20 ? 'available' : 'booked', version: 1 },
      );
    }
    if (this.redisWrite) {
      try {
        await this.redisWrite.del('seats:1');
      } catch (e) {}
    }
    return { success: true, message: 'Reset data completed.' };
  }

  async getShowtime(showtimeId: string) {
    const showtime = await this.showtimeReadRepo.findOne({ where: { id: showtimeId } });
    if (!showtime) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Showtime ${showtimeId} not found` });
    }
    return showtime;
  }

  async listSeats(showtimeId: string) {
    const cacheKey = `seats:${showtimeId}`;
    // Mất liên lạc với Redis Master thì lệnh xoá cache (DEL) không còn tới được bản sao:
    // không tin cache nữa, đọc thẳng CSDL để tránh "vé ma" trong lúc failover
    const masterReachable = this.redisMasterAlive;
    if (this.redisRead && masterReachable) {
      try {
        const cached = await this.redisRead.get(cacheKey);
        if (cached) {
          this.stats.cacheHits++;
          return { seats: JSON.parse(cached) };
        }
      } catch (e) {}
    }

    this.stats.cacheMisses++;
    this.stats.replicaReads++;
    const seats = await this.seatReadRepo.find({ where: { showtimeId }, order: { id: 'ASC' } });
    if (this.redisWrite) {
      try {
        await this.redisWrite.setex(cacheKey, 15, JSON.stringify(seats));
      } catch (e) {}
    }
    return { seats };
  }

  async reserveSeat(seatId: string, showtimeId: string, userName: string) {
    const strategy = this.getLockStrategy();
    console.log(`[INVENTORY-SERVICE] [HOST: ${this.hostname}] [TIME: ${new Date().toISOString()}] Reserve request user=${userName} seat=${seatId} lock=${strategy}`);
    const showtime = await this.showtimeRepo.findOne({ where: { id: showtimeId } });
    if (!showtime) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Showtime ${showtimeId} not found` });
    }

    if (strategy === 'pessimistic') {
      return this.reserveSeatPessimistic(seatId, showtime, userName);
    } else {
      return this.reserveSeatOptimistic(seatId, showtime, userName);
    }
  }

  // ✅ GIỮ NGUYÊN 100%: THUẬT TOÁN PESSIMISTIC LOCKING (SELECT FOR UPDATE)
  private async reserveSeatPessimistic(seatId: string, showtime: Showtime, userName: string) {
    const queryRunner = this.masterDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const seat = await queryRunner.manager.findOne(Seat, {
        where: { id: seatId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!seat || seat.status !== 'available') {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: `Seat ${seat?.seatCode || seatId} is already booked`,
        });
      }

      seat.status = 'booked';
      await queryRunner.manager.save(seat);
      await queryRunner.commitTransaction();
      this.stats.primaryWrites++;

      // Xoá cache trên Redis Master -> tự đồng bộ sang Redis Replica của cả 2 node
      if (this.redisWrite) {
        try {
          await this.redisWrite.del(`seats:${showtime.id}`);
        } catch (e) {}
      }

      return {
        success: true,
        message: `Seat ${seat.seatCode} reserved successfully via Pessimistic Lock`,
        seatId: seat.id,
        seatCode: seat.seatCode,
        movieName: showtime.movieName,
        showtimeId: showtime.id,
        processedByHost: this.hostname,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ✅ GIỮ NGUYÊN 100%: THUẬT TOÁN OPTIMISTIC LOCKING (VERSION COLUMN ATOMIC CHECK)
  private async reserveSeatOptimistic(seatId: string, showtime: Showtime, userName: string) {
    const seat = await this.seatRepo.findOne({ where: { id: seatId } });
    if (!seat || seat.status !== 'available') {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: `Seat ${seat?.seatCode || seatId} is already booked`,
      });
    }

    const currentVersion = seat.version;
    const updateResult = await this.seatRepo
      .createQueryBuilder()
      .update(Seat)
      .set({ status: 'booked', version: () => 'version + 1' })
      .where('id = :id AND version = :version AND status = :status', {
        id: seatId,
        version: currentVersion,
        status: 'available',
      })
      .execute();

    if (updateResult.affected === 0) {
      throw new RpcException({
        code: status.ABORTED,
        message: `Optimistic Lock Conflict: Seat ${seat.seatCode} was updated by a concurrent transaction (version conflict)`,
      });
    }
    this.stats.primaryWrites++;

    if (this.redisWrite) {
      try {
        await this.redisWrite.del(`seats:${showtime.id}`);
      } catch (e) {}
    }

    return {
      success: true,
      message: `Seat ${seat.seatCode} reserved successfully via Optimistic Lock`,
      seatId: seat.id,
      seatCode: seat.seatCode,
      movieName: showtime.movieName,
      showtimeId: showtime.id,
      processedByHost: this.hostname,
      timestamp: new Date().toISOString(),
    };
  }

  // Demo: vai trò thật của từng kết nối CSDL / Redis (Primary hay Standby, Master hay Replica)
  async getClusterInfo() {
    const pgInfo = async (ds: DataSource) => {
      try {
        const [r] = await ds.query(
          `SELECT inet_server_addr()::text AS ip, pg_is_in_recovery() AS standby,
                  (SELECT count(*)::int FROM pg_stat_replication) AS replicas,
                  (SELECT status FROM seats WHERE id = '20') AS a20`,
        );
        return { ok: true, ip: r.ip.replace(/\/32$/, ''), role: r.standby ? 'STANDBY' : 'PRIMARY', streamingReplicas: r.replicas, seatA20: r.a20 };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    };
    const redisInfo = async (client: Redis | null) => {
      if (!client) return { ok: false, error: 'not configured' };
      try {
        const text = await client.info('replication');
        const role = /role:(\w+)/.exec(text)?.[1] || 'unknown';
        const replicas = Number(/connected_slaves:(\d+)/.exec(text)?.[1] || 0);
        const link = /master_link_status:(\w+)/.exec(text)?.[1];
        return { ok: true, host: client.options.host, role: role === 'slave' ? 'REPLICA' : role.toUpperCase(), replicas, link: link || null, cachedSeats: await client.exists('seats:1') === 1 };
      } catch (err) {
        return { ok: false, host: client.options.host, error: err.message };
      }
    };
    const [write, read, redisWrite, redisRead] = await Promise.all([
      pgInfo(this.masterDataSource),
      pgInfo(this.replicaDataSource),
      redisInfo(this.redisWrite),
      redisInfo(this.redisRead),
    ]);
    return {
      service: 'inventory-service',
      nodeId: this.nodeId,
      hostname: this.hostname,
      lockStrategy: this.getLockStrategy(),
      db: { write, read },
      redis: { write: redisWrite, read: redisRead },
      stats: this.stats,
      cacheTrusted: this.redisMasterAlive,
      timestamp: new Date().toISOString(),
    };
  }
}
