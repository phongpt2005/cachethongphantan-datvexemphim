import { Injectable, OnModuleInit, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable, timeout } from 'rxjs';
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

// Hạn chót cho mỗi lời gọi gRPC: dịch vụ chết thì lỗi sau vài giây chứ không treo request mãi mãi
const GRPC_DEADLINE_MS = Number(process.env.GRPC_DEADLINE_MS || 3000);
const call = <T>(obs: Observable<T>): Promise<T> => firstValueFrom(obs.pipe(timeout(GRPC_DEADLINE_MS)));

@Injectable()
export class GatewayService implements OnModuleInit {
  private inventoryGrpc: InventoryGrpcService;
  private bookingGrpc: BookingGrpcService;
  private readonly hostname = os.hostname();
  private readonly nodeId = process.env.NODE_ID || 'node1';

  private readonly circuitThreshold = Number(process.env.CIRCUIT_FAILURE_THRESHOLD || 5);
  private readonly circuitResetMs = Number(process.env.CIRCUIT_RESET_MS || 30000);
  private inventoryCircuit = new CircuitBreaker('inventory-grpc', this.circuitThreshold, this.circuitResetMs);
  private bookingCircuit = new CircuitBreaker('booking-grpc', this.circuitThreshold, this.circuitResetMs);

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
    // Bỏ tiền tố "6 ALREADY_EXISTS: " mà gRPC gắn vào thông điệp khi lỗi đi qua nhiều service
    const message = String(err.details || err.message || 'Internal RPC Error').replace(/^(\d+ [A-Z_]+: )+/, '');

    if (code === 6 || code === 10) {
      return new HttpException({ statusCode: HttpStatus.CONFLICT, error: 'Conflict', message, timestamp }, HttpStatus.CONFLICT);
    }
    if (code === 5) {
      return new HttpException({ statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message, timestamp }, HttpStatus.NOT_FOUND);
    }
    if (code === 3) {
      return new HttpException({ statusCode: HttpStatus.BAD_REQUEST, error: 'Bad Request', message, timestamp }, HttpStatus.BAD_REQUEST);
    }
    if (err?.name === 'TimeoutError' || code === 4) {
      return new HttpException({ statusCode: HttpStatus.GATEWAY_TIMEOUT, error: 'Gateway Timeout', message: `Dịch vụ không phản hồi trong ${GRPC_DEADLINE_MS} ms`, timestamp }, HttpStatus.GATEWAY_TIMEOUT);
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
            call(this.inventoryGrpc.getShowtime({ showtimeId })),
            call(this.inventoryGrpc.listSeats({ showtimeId })),
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
        message: `Dịch vụ rạp phim đang quá tải hoặc gặp sự cố, vui lòng thử lại sau ${Math.round(this.circuitResetMs / 1000)} giây.`,
        gatewayHost: this.hostname,
        nodeId: this.nodeId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  async bookTicket(showtimeId: string, seatId: string, userName: string) {
    console.log(`[API-GATEWAY] [HOST: ${this.hostname}] [TIME: ${new Date().toISOString()}] Forwarding booking user=${userName} seat=${seatId} -> booking-lb (gRPC)`);
    return this.bookingCircuit.execute(async () => {
      try {
        const result = await call(
          this.bookingGrpc.createBooking({ showtimeId, seatId, userName }),
        );
        return { ...result, gatewayHost: this.hostname, nodeId: this.nodeId };
      } catch (err) {
        throw this.mapGrpcError(err);
      }
    }, () => {
      // Mạch đang mở: từ chối ngay (fail-fast) thay vì để request treo chờ dịch vụ hỏng
      throw new HttpException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Circuit Breaker Open',
        message: `Hệ thống đặt vé đang gặp sự cố, vui lòng thử lại sau ${Math.round(this.circuitResetMs / 1000)} giây.`,
        timestamp: new Date().toISOString(),
      }, HttpStatus.SERVICE_UNAVAILABLE);
    });
  }

  async getBooking(bookingId: string) {
    try {
      const result = await call(this.bookingGrpc.getBooking({ bookingId }));
      return { ...result, gatewayHost: this.hostname, nodeId: this.nodeId };
    } catch (err) {
      throw this.mapGrpcError(err);
    }
  }

  async resetAllDemoData() {
    try {
      const [invReset, bookReset] = await Promise.all([
        call(this.inventoryGrpc.resetData({})),
        call(this.bookingGrpc.resetData({})),
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
