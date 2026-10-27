import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as os from 'os';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const rmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
  const hostname = os.hostname();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationModule, {
    transport: Transport.RMQ,
    options: {
      urls: rmqUrl.split(','), // nút tại chỗ trước, nút máy khác để dự phòng
      queue: 'booking.confirmed',
      noAck: false, // Manual ACK ensures message durability when worker fails
      queueOptions: {
        durable: true,
        // Phải khai báo giống hệt bên booking-service (quorum queue, nhân bản Raft trên 3 nút)
        arguments: { 'x-queue-type': 'quorum' },
      },
    },
  });

  await app.listen();
  console.log(`[NOTIFICATION-SERVICE] [HOST: ${hostname}] Worker started and listening on RabbitMQ queue: "booking.confirmed" (durable: true)`);
}
bootstrap();
