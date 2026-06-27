import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GroupMqModule,
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
  type Queue,
  type ReservedJob,
} from '../lib';
import {
  REDIS_HOST,
  REDIS_PORT,
  probeRedis,
  waitFor,
} from './redis-test-utils';

const redisAvailable = await probeRedis();

const results = { processed: [] as string[], completed: 0 };

@Processor('orders', { concurrency: 1, blockingTimeoutSec: 1 })
class OrdersProcessor extends WorkerHost {
  async process(job: ReservedJob<{ id: string }>): Promise<string> {
    results.processed.push(job.data.id);
    return 'ok';
  }

  @OnWorkerEvent('completed')
  onCompleted(): void {
    results.completed += 1;
  }
}

@Injectable()
class OrdersService {
  constructor(@InjectQueue('orders') readonly queue: Queue<{ id: string }>) {}
}

const namespace = `orders-e2e-${Date.now()}`;

@Module({
  imports: [
    GroupMqModule.forRoot({
      connection: { host: REDIS_HOST, port: REDIS_PORT },
    }),
    GroupMqModule.registerQueue({ name: 'orders', namespace }),
  ],
  providers: [OrdersProcessor, OrdersService],
})
class AppModule {}

describe.skipIf(!redisAvailable)('GroupMqModule (e2e)', () => {
  let app: TestingModule;
  let service: OrdersService;

  beforeAll(async () => {
    results.processed = [];
    results.completed = 0;
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
    service = app.get(OrdersService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('processes enqueued jobs and emits the completed event', async () => {
    await service.queue.add({ groupId: 'user:1', data: { id: 'a' } });
    await service.queue.add({ groupId: 'user:1', data: { id: 'b' } });

    await waitFor(() => results.processed.length === 2);

    // per-group FIFO ordering is preserved
    expect(results.processed).toEqual(['a', 'b']);
    expect(results.completed).toBe(2);
  });
});

const asyncResults = { processed: [] as string[] };

@Processor('orders-async', { concurrency: 1, blockingTimeoutSec: 1 })
class AsyncOrdersProcessor extends WorkerHost {
  async process(job: ReservedJob<{ id: string }>): Promise<string> {
    asyncResults.processed.push(job.data.id);
    return 'ok';
  }
}

@Injectable()
class AsyncOrdersService {
  constructor(
    @InjectQueue('orders-async') readonly queue: Queue<{ id: string }>,
  ) {}
}

const asyncNamespace = `orders-async-e2e-${Date.now()}`;

@Module({
  imports: [
    GroupMqModule.forRootAsync({
      useFactory: () => ({
        connection: { host: REDIS_HOST, port: REDIS_PORT },
      }),
    }),
    GroupMqModule.registerQueueAsync({
      name: 'orders-async',
      useFactory: () => ({ namespace: asyncNamespace }),
    }),
  ],
  providers: [AsyncOrdersProcessor, AsyncOrdersService],
})
class AsyncAppModule {}

describe.skipIf(!redisAvailable)('GroupMqModule async registration (e2e)', () => {
  let app: TestingModule;

  beforeAll(async () => {
    asyncResults.processed = [];
    app = await Test.createTestingModule({
      imports: [AsyncAppModule],
    }).compile();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('wires forRootAsync + registerQueueAsync and processes jobs', async () => {
    const service = app.get(AsyncOrdersService);
    await service.queue.add({ groupId: 'g1', data: { id: 'x' } });

    await waitFor(() => asyncResults.processed.length === 1);
    expect(asyncResults.processed).toEqual(['x']);
  });
});
