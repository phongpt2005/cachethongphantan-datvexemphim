import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as os from 'os';
import * as path from 'path';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule);

  // Demo Console (trang web điều khiển demo) tại http://localhost:3000/
  app.useStaticAssets(path.join(__dirname, '..', 'public'));

  // Enable class-validator global pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const hostname = os.hostname();
  console.log(`========================================================================`);
  console.log(`🚀 [API-GATEWAY] [HOST: ${hostname}] started successfully on port ${port}`);
  console.log(`   • Health Check   : GET  http://localhost:${port}/health`);
  console.log(`   • View Movies    : GET  http://localhost:${port}/movies/1`);
  console.log(`   • Book Ticket    : POST http://localhost:${port}/booking`);
  console.log(`   • Reset Demo     : POST http://localhost:${port}/dev/reset`);
  console.log(`   • Demo Console   : GET  http://localhost:${port}/`);
  console.log(`   • Lab runtime    : GET  http://localhost:${port}/lab/runtime`);
  console.log(`========================================================================`);
}
bootstrap();
