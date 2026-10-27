import { Controller, Get, Post, Query } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { asUnavailable } from './common/db-unavailable';
import { InventoryService } from './inventory.service';
import { getRuntimeInfo } from './common/runtime-info';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'inventory-service',
      nodeId: process.env.NODE_ID || 'node1',
      lockStrategy: this.inventoryService.getLockStrategy(),
      timestamp: new Date().toISOString(),
    };
  }

  // Demo Chương 3: luồng nhân, namespace, cgroups của container này
  @Get('lab/runtime')
  getRuntime() {
    return getRuntimeInfo('inventory-service');
  }

  // Demo hệ phân tán: vai trò Primary/Standby, Redis Master/Replica, thống kê cache
  @Get('lab/cluster')
  async getCluster() {
    return this.inventoryService.getClusterInfo();
  }

  @Post('lab/lock-strategy')
  setLockStrategy(@Query('mode') mode: string) {
    return this.inventoryService.setLockStrategy(mode);
  }

  @GrpcMethod('InventoryService', 'GetShowtime')
  async getShowtime(data: { showtimeId: string }) {
    return this.inventoryService.getShowtime(data.showtimeId);
  }

  @GrpcMethod('InventoryService', 'ListSeats')
  async listSeats(data: { showtimeId: string }) {
    return this.inventoryService.listSeats(data.showtimeId);
  }

  @GrpcMethod('InventoryService', 'ReserveSeat')
  async reserveSeat(data: { seatId: string; showtimeId: string; userName: string }) {
    return this.inventoryService.reserveSeat(data.seatId, data.showtimeId, data.userName).catch((e) => { throw asUnavailable(e); });
  }

  @GrpcMethod('InventoryService', 'ResetData')
  async resetData() {
    return this.inventoryService.resetData().catch((e) => { throw asUnavailable(e); });
  }
}
