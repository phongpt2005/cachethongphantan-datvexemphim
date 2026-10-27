import { Controller, Get } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { asUnavailable } from './common/db-unavailable';
import * as os from 'os';
import { BookingService } from './booking.service';
import { getRuntimeInfo } from './common/runtime-info';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'booking-service',
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
    };
  }

  // Demo Chương 3: luồng nhân, namespace, cgroups của container này
  @Get('lab/runtime')
  getRuntime() {
    return getRuntimeInfo('booking-service');
  }

  @GrpcMethod('BookingService', 'CreateBooking')
  async createBooking(data: { showtimeId: string; seatId: string; userName: string }) {
    return this.bookingService.createBooking(data.showtimeId, data.seatId, data.userName).catch((e) => { throw asUnavailable(e); });
  }

  @GrpcMethod('BookingService', 'GetBooking')
  async getBooking(data: { bookingId: string }) {
    return this.bookingService.getBooking(data.bookingId);
  }

  @GrpcMethod('BookingService', 'ResetData')
  async resetData() {
    return this.bookingService.resetData().catch((e) => { throw asUnavailable(e); });
  }
}
