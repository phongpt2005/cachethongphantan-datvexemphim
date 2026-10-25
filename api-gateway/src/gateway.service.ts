import { Injectable, OnModuleInit, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import * as os from 'os';
import { CircuitBreaker } from './common/circuit-breaker';
import { retryWithBackoff } from './common/retry';

interface InventoryGrpcService {
  getShowtime(data: { showtimeId: string }): Observable<any>;
  listSeats(data: { showtimeId: string }): Observable<any>;
  resetData(data: any): Observable<any>;
}

interface BookingGrpcService {
  createBooking(data: { showtimeId: string; seatId: string; userName: string }): Observable<any>;
  getBooking(data: { bookingId: string }): Observable<any>;
  resetData(data: any): Observable<any>;
}

@Injectable()
export class GatewayService implements OnModuleInit {
  private inventoryGrpc: InventoryGrpcService;
  private bookingGrpc: BookingGrpcService;
  private readonly hostname = os.hostname();
  private readonly nodeId = process.env.NODE_ID || 'node1';

  private inventoryCircuit = new CircuitBreaker('inventory-grpc', 5, 30000);
  private bookingCircuit = new CircuitBreaker('booking-grpc', 5, 30000);

  constructor(
    @Inject('INVENTORY_PACKAGE') private readonly inventoryClient: ClientGrpc,
    @Inject('BOOKING_PACKAGE') private readonly bookingClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.inventoryGrpc = this.inventoryClient.getService<InventoryGrpcService>('InventoryService');
    this.bookingGrpc = this.bookingClient.getService<BookingGrpcService>('BookingService');
    console.log(`[API-GATEWAY] [${this.nodeId}] [${this.hostname}] Connected to gRPC services with Circuit Breakers enabled.`);
  }

  private mapGrpcError(err: any): HttpException {
    const timestamp = new Date().toISOString();
    const code = err.code;
    const message = err.details || err.message || 'Internal RPC Error';

    if (code === 6 || code === 10) {
      return new HttpException({ statusCode: HttpStatus.CONFLICT, error: 'Conflict', message, timestamp }, HttpStatus.CONFLICT);
    }
    if (code === 5) {
      return new HttpException({ statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message, timestamp }, HttpStatus.NOT_FOUND);
    }
    if (code === 3) {
      return new HttpException({ statusCode: HttpStatus.BAD_REQUEST, error: 'Bad Request', message, timestamp }, HttpStatus.BAD_REQUEST);
    }
    if (code === 14) {
      return new HttpException({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, error: 'Service Unavailable', message, timestamp }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return new HttpException({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Internal Server Error', message, timestamp }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async getMovieDetails(showtimeId: string) {
    return this.inventoryCircuit.execute(
      () => retryWithBackoff(async () => {
        try {
          const [showtime, seatsRes] = await Promise.all([
            firstValueFrom(this.inventoryGrpc.getShowtime({ showtimeId })),
            firstValueFrom(this.inventoryGrpc.listSeats({ showtimeId })),
          ]);
          return {
            success: true,
            showtime,
            seats: seatsRes.seats,
            gatewayHost: this.hostname,
            nodeId: this.nodeId,
            timestamp: new Date().toISOString(),
          };
        } catch (err) {
          throw this.mapGrpcError(err);
        }
      }, { maxRetries: 2, baseDelay: 300 }),
      () => ({
        success: false,
        error: 'Circuit Breaker Open',
        message: 'Dịch vụ rạp phim đang quá tải hoặc gặp sự cố, vui lòng thử lại sau 30 giây.',
        gatewayHost: this.hostname,
        nodeId: this.nodeId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  async bookTicket(showtimeId: string, seatId: string, userName: string) {
    return this.bookingCircuit.execute(async () => {
      try {
        const result = await firstValueFrom(
          this.bookingGrpc.createBooking({ showtimeId, seatId, userName }),
        );
        return { ...result, gatewayHost: this.hostname, nodeId: this.nodeId };
      } catch (err) {
        throw this.mapGrpcError(err);
      }
    });
  }

  async getBooking(bookingId: string) {
    try {
      const result = await firstValueFrom(this.bookingGrpc.getBooking({ bookingId }));
      return { ...result, gatewayHost: this.hostname, nodeId: this.nodeId };
    } catch (err) {
      throw this.mapGrpcError(err);
    }
  }

  async resetAllDemoData() {
    try {
      const [invReset, bookReset] = await Promise.all([
        firstValueFrom(this.inventoryGrpc.resetData({})),
        firstValueFrom(this.bookingGrpc.resetData({})),
      ]);
      return {
        success: true,
        message: 'All services reset to initial demo state (A20 is available, all bookings cleared)',
        inventory: invReset,
        booking: bookReset,
        gatewayHost: this.hostname,
        nodeId: this.nodeId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      throw this.mapGrpcError(err);
    }
  }

  getCircuitStatus() {
    return {
      gatewayHost: this.hostname,
      nodeId: this.nodeId,
      circuits: {
        inventory: this.inventoryCircuit.getMetrics(),
        booking: this.bookingCircuit.getMetrics(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
