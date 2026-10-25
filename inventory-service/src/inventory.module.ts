import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Showtime } from './entities/showtime.entity';
import { Seat } from './entities/seat.entity';

@Module({
  imports: [
    // Connection Master (Dành cho ghi & transaction khoá)
    TypeOrmModule.forRoot({
      name: 'default',
      type: 'postgres',
      host: process.env.DB_MASTER_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_MASTER_PORT || process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'inventory_db',
      entities: [Showtime, Seat],
      synchronize: true,
    }),
    // Connection Replica (Dành cho đọc phân tán)
    TypeOrmModule.forRoot({
      name: 'replica',
      type: 'postgres',
      host: process.env.DB_REPLICA_HOST || process.env.DB_MASTER_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_REPLICA_PORT || process.env.DB_MASTER_PORT || process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'inventory_db',
      entities: [Showtime, Seat],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([Showtime, Seat]),
    TypeOrmModule.forFeature([Showtime, Seat], 'replica'),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
