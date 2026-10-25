import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import * as path from 'path';
import * as fs from 'fs';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking } from './entities/booking.entity';

// Resolve proto path
let protoPath = process.env.INVENTORY_PROTO_PATH;
if (!protoPath) {
  const candidatePaths = [
    path.resolve(__dirname, '../../shared/protos/inventory.proto'),
    path.resolve(__dirname, '../shared/protos/inventory.proto'),
    path.resolve(process.cwd(), 'shared/protos/inventory.proto'),
    path.resolve(process.cwd(), '../shared/protos/inventory.proto'),
  ];
  protoPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_MASTER_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_MASTER_PORT || process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'booking_db',
      entities: [Booking],
      synchronize: true, // Auto-create tables for demo
    }),
    TypeOrmModule.forFeature([Booking]),
    ClientsModule.register([
      {
        name: 'INVENTORY_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'inventory',
          protoPath,
          url: process.env.INVENTORY_GRPC_URL || 'inventory-service:50052',
        },
      },
      {
        name: 'RABBITMQ_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672'],
          queue: 'booking.confirmed',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
