import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import * as path from 'path';
import * as fs from 'fs';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { LabController } from './lab.controller';

function resolveProto(fileName: string): string {
  const candidatePaths = [
    path.resolve(__dirname, `../../shared/protos/${fileName}`),
    path.resolve(__dirname, `../shared/protos/${fileName}`),
    path.resolve(process.cwd(), `shared/protos/${fileName}`),
    path.resolve(process.cwd(), `../shared/protos/${fileName}`),
  ];
  return candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
}

const inventoryProtoPath = process.env.INVENTORY_PROTO_PATH || resolveProto('inventory.proto');
const bookingProtoPath = process.env.BOOKING_PROTO_PATH || resolveProto('booking.proto');

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'INVENTORY_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'inventory',
          protoPath: inventoryProtoPath,
          url: process.env.INVENTORY_GRPC_URL || 'inventory-service:50052',
        },
      },
      {
        name: 'BOOKING_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'booking',
          protoPath: bookingProtoPath,
          // Points to Nginx gRPC Load Balancer (booking-lb:50051) or direct booking-service
          url: process.env.BOOKING_GRPC_URL || 'booking-lb:50051',
        },
      },
    ]),
  ],
  controllers: [GatewayController, LabController],
  providers: [GatewayService],
})
export class GatewayModule {}
