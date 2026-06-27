import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OrdersService } from './orders.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Ensures groupmq workers are closed gracefully on SIGINT/SIGTERM.
  app.enableShutdownHooks();
  await app.listen(3000);

  const logger = new Logger('Example');
  logger.log('Listening on http://localhost:3000');
  logger.log(
    'Enqueue: curl -X POST http://localhost:3000/orders -H "content-type: application/json" -d \'{"userId":"42","amount":999}\'',
  );
  logger.log('Stats:   curl http://localhost:3000/orders/stats');

  // Self-driving demo: enqueue a few jobs for two users so the per-group FIFO
  // behaviour is visible in the logs immediately. Disable with SEED=false.
  if (process.env.SEED !== 'false') {
    const orders = app.get(OrdersService);
    logger.log(
      'Seeding 6 demo orders (3 per user) — watch them process in per-group FIFO order.',
    );
    let n = 0;
    for (const userId of ['42', '7']) {
      for (let i = 0; i < 3; i++) {
        await orders.enqueue({
          orderId: `seed-${++n}`,
          userId,
          amount: (i + 1) * 100,
        });
      }
    }
  }
}

void bootstrap();
