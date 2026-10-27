import { Controller, Get, Post, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import * as os from 'os';
import { GatewayService } from './gateway.service';
import { CreateBookingDto } from './dtos/create-booking.dto';

@Controller()
export class GatewayController {
  private readonly hostname = os.hostname();
  private readonly nodeId = process.env.NODE_ID || 'node1';

  constructor(private readonly gatewayService: GatewayService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api-gateway',
      nodeId: this.nodeId,
      hostname: this.hostname,
      timestamp: new Date().toISOString(),
      architecture: 'Microservices: REST Gateway + gRPC + RabbitMQ + Redis cache-aside + PostgreSQL (database-per-service)',
    };
  }

  @Get('health/deep')
  getDeepHealth() {
    return {
      status: 'ok',
      ...this.gatewayService.getCircuitStatus(),
    };
  }

  @Get('movies/:showtimeId')
  async getMovieDetails(@Param('showtimeId') showtimeId: string) {
    return this.gatewayService.getMovieDetails(showtimeId);
  }

  @Post('booking')
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Body() body: CreateBookingDto) {
    return this.gatewayService.bookTicket(body.showtimeId, body.seatId, body.userName);
  }

  @Get('booking/:bookingId')
  async getBooking(@Param('bookingId') bookingId: string) {
    return this.gatewayService.getBooking(bookingId);
  }

  @Post('dev/reset')
  @HttpCode(HttpStatus.OK)
  async resetDemo() {
    return this.gatewayService.resetAllDemoData();
  }
}
