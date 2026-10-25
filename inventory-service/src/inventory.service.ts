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
  ) {}

  private getLockStrategy(): 'pessimistic' | 'optimistic' {
    const strategy = (process.env.LOCK_STRATEGY || 'pessimistic').toLowerCase();
    return strategy === 'optimistic' ? 'optimistic' : 'pessimistic';
  }

  async onModuleInit() {
    const masterRedisHost = process.env.REDIS_MASTER_HOST || '10.0.0.1';
    const localRedisHost = process.env.REDIS_LOCAL_HOST || 'localhost';

    try {
      this.redisWrite = new Redis({
        host: masterRedisHost,
        port: 6379,
        lazyConnect: true,
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
        port: 6379,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.redisRead.on('error', (err) => {
        // Log quietly
      });
      await this.redisRead.connect().catch(() => {});
    } catch (e) {}

    console.log(`[INVENTORY] [${this.nodeId}] Current LOCK_STRATEGY = ${this.getLockStrategy().toUpperCase()}`);
    console.log(`[INVENTORY] [${this.nodeId}] Redis connected: Write->${masterRedisHost}:6379, Read->${localRedisHost}:6379`);
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
    if (this.redisRead) {
      try {
        const cached = await this.redisRead.get(cacheKey);
        if (cached) return { seats: JSON.parse(cached) };
      } catch (e) {}
    }

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
}
