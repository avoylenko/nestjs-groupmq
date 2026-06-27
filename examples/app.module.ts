import { Module } from '@nestjs/common';
// In your own project import from '@avoylenko/nestjs-groupmq'.
import { GroupMqModule } from '../lib';
import { OrdersController } from './orders.controller';
import { OrdersProcessor } from './orders.processor';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    GroupMqModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      defaultJobOptions: { maxAttempts: 3 },
    }),
    GroupMqModule.registerQueue({
      name: 'orders',
      namespace: 'examples:orders',
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersProcessor, OrdersService],
})
export class AppModule {}
