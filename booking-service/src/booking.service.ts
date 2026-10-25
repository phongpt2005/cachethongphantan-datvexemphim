import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientGrpc, ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import { Booking } from './entities/booking.entity';

interface InventoryGrpcService {
  reserveSeat(data: { seatId: string; showtimeId: string; userName: string }): Observable<any>;
  resetData(data: any): Observable<any>;
}

@Injectable()
export class BookingService implements OnModuleInit {
  private readonly logger = new Logger('BookingService');
  private readonly hostname = os.hostname();
  private readonly nodeId = process.env.NODE_ID || 'node1';
  private inventoryGrpc: InventoryGrpcService;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @Inject('INVENTORY_PACKAGE')
    private readonly clientGrpc: ClientGrpc,
    @Inject('RABBITMQ_CLIENT')
    private readonly rabbitClient: ClientProxy,
  ) {}

  onModuleInit() {
    this.inventoryGrpc = this.clientGrpc.getService<InventoryGrpcService>('InventoryService');
    console.log(`[BOOKING-SERVICE] [${this.nodeId}] Initialized on ${this.hostname}. Connected to Inventory gRPC & RabbitMQ.`);
  }

  async createBooking(showtimeId: string, seatId: string, userName: string) {
    // 1. Gọi Inventory gRPC để giữ chỗ ghế
    let reserveRes: any;
    try {
      reserveRes = await firstValueFrom(
        this.inventoryGrpc.reserveSeat({ seatId, showtimeId, userName }),
      );
    } catch (err) {
      throw new RpcException({
        code: err.code || 2,
        message: err.message || err.details || 'Failed to reserve seat in inventory',
      });
    }

    // 2. Lưu Booking vào Database Master
    const booking = this.bookingRepo.create({
      id: uuidv4(),
      seatId,
      showtimeId,
      userName,
      status: 'CONFIRMED',
    });
    await this.bookingRepo.save(booking);

    // 3. Bắn event sang RabbitMQ Quorum Queue (Asynchronous Decoupling)
    const eventPayload = {
      bookingId: booking.id,
      seatId,
      seatCode: reserveRes.seatCode,
      movieName: reserveRes.movieName,
      showtimeId,
      userName,
      status: 'CONFIRMED',
      createdAt: booking.createdAt ? booking.createdAt.toISOString() : new Date().toISOString(),
      processedByHost: this.hostname,
      timestamp: new Date().toISOString(),
    };

    try {
      this.rabbitClient.emit('booking.confirmed', eventPayload);
    } catch (err) {
      console.error(`RabbitMQ publish error: ${err.message}`);
    }

    return {
      success: true,
      bookingId: booking.id,
      seatId,
      seatCode: reserveRes.seatCode,
      movieName: reserveRes.movieName,
      showtimeId,
      userName,
      status: 'CONFIRMED',
      createdAt: booking.createdAt ? booking.createdAt.toISOString() : new Date().toISOString(),
      processedByHost: this.hostname,
      timestamp: new Date().toISOString(),
    };
  }

  async getBooking(bookingId: string) {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      throw new RpcException({ code: 5, message: `Booking ${bookingId} not found` });
    }
    return {
      id: booking.id,
      seatId: booking.seatId,
      showtimeId: booking.showtimeId,
      userName: booking.userName,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      processedByHost: this.hostname,
    };
  }

  async resetData() {
    await this.bookingRepo.clear();
    return { success: true, message: 'Booking data reset successfully' };
  }
}
