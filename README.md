# @avoylenko/nestjs-groupmq

NestJS module for [groupmq](https://github.com/Openpanel-dev/groupmq) — a fast,
Redis-backed **per-group FIFO** queue with guaranteed in-group ordering and
parallel processing across groups.

The API mirrors [`@nestjs/bullmq`](https://github.com/nestjs/bull) as closely as
groupmq allows, so if you know `@nestjs/bullmq` you already know this package.

## Features

- `GroupMqModule.forRoot()` / `forRootAsync()` — shared Redis connection + defaults
- `GroupMqModule.registerQueue()` / `registerQueueAsync()` — DI-injectable queues
- `@InjectQueue()`, `@Processor()`, `WorkerHost`, `@OnWorkerEvent()`
- Automatic worker lifecycle (start on bootstrap, graceful close on shutdown)
- Request-scoped processors
- Declarative repeatable jobs
- Bull Board helper

## Installation

```bash
npm i @avoylenko/nestjs-groupmq groupmq ioredis
```

`@nestjs/common`, `@nestjs/core`, `groupmq` and `ioredis` are peer dependencies.

## Quick start

### 1. Register the module

```ts
import { Module } from '@nestjs/common';
import { GroupMqModule } from '@avoylenko/nestjs-groupmq';

@Module({
  imports: [
    GroupMqModule.forRoot({
      // ioredis options (the module creates & owns the client) or an existing Redis instance
      connection: { host: 'localhost', port: 6379 },
      // optional groupmq defaults merged into every queue
      defaultJobOptions: { maxAttempts: 5 },
    }),
    GroupMqModule.registerQueue({
      name: 'orders', // injection token + default namespace ("orders")
      jobTimeoutMs: 30_000,
    }),
  ],
})
export class AppModule {}
```

### 2. Define a processor

A processor is a class decorated with `@Processor()` that extends `WorkerHost`
and implements `process()`. The returned promise is used as the groupmq worker
handler; jobs within the same `groupId` are processed strictly in order.

```ts
import { Processor, WorkerHost, OnWorkerEvent } from '@avoylenko/nestjs-groupmq';
import type { Job, ReservedJob } from '@avoylenko/nestjs-groupmq';

interface OrderData {
  userId: string;
  amount: number;
}

@Processor('orders', { concurrency: 8 })
export class OrdersProcessor extends WorkerHost {
  async process(job: ReservedJob<OrderData>): Promise<void> {
    // do work; per-group FIFO is guaranteed by groupmq
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<OrderData>) {}

  @OnWorkerEvent('failed')
  onFailed(job: Job<OrderData>) {}
}
```

Register the processor as a provider in the same module that imports the queue:

```ts
@Module({
  imports: [GroupMqModule.registerQueue({ name: 'orders' })],
  providers: [OrdersProcessor],
})
export class OrdersModule {}
```

### 3. Enqueue jobs

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@avoylenko/nestjs-groupmq';
import type { Queue } from '@avoylenko/nestjs-groupmq';

@Injectable()
export class OrdersService {
  constructor(@InjectQueue('orders') private readonly queue: Queue<OrderData>) {}

  enqueue(data: OrderData) {
    return this.queue.add({ groupId: `user:${data.userId}`, data });
  }
}
```

## Async configuration

```ts
GroupMqModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: { host: config.get('REDIS_HOST'), port: config.get('REDIS_PORT') },
  }),
});

GroupMqModule.registerQueueAsync({
  name: 'orders',
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    jobTimeoutMs: config.get('ORDERS_TIMEOUT'),
  }),
});
```

## Multiple connections (`configKey`)

Register several independent shared configurations and bind a queue to one:

```ts
GroupMqModule.forRoot('analytics', { connection: { host: 'analytics-redis' } });
GroupMqModule.registerQueue({ name: 'events', configKey: 'analytics' });
```

A queue may also override the connection directly:

```ts
GroupMqModule.registerQueue({
  name: 'events',
  connection: { host: 'other-redis', port: 6380 },
});
```

## Worker events

`@OnWorkerEvent(eventName)` registers a method as a listener on the underlying
groupmq worker. Supported events: `completed`, `failed`, `ready`, `error`,
`closed`, `graceful-timeout`, `stalled`, `ioredis:close`.

> Not supported on request-scoped processors.

## Repeatable jobs

Declare repeatable jobs on the queue; they are enqueued automatically on
application bootstrap.

```ts
GroupMqModule.registerQueue({
  name: 'reports',
  repeatableJobs: [
    { groupId: 'reports', data: { kind: 'daily' }, repeat: { every: 60_000 } },
    { groupId: 'emails', data: { kind: 'digest' }, repeat: { pattern: '0 9 * * 1-5' } },
  ],
});
```

## Bull Board

```ts
import { createBullBoard } from '@bull-board/api';
import { createGroupMqBoardAdapter, InjectQueue } from '@avoylenko/nestjs-groupmq';
import type { Queue } from '@avoylenko/nestjs-groupmq';

@Injectable()
export class BoardService {
  constructor(@InjectQueue('orders') queue: Queue) {
    createBullBoard({
      queues: [createGroupMqBoardAdapter(queue, { displayName: 'Orders' })],
      serverAdapter,
    });
  }
}
```

## Manual worker registration

By default workers start during `onApplicationBootstrap`. To control this
yourself, enable `manualRegistration` and call `GroupMqRegistrar.register()`:

```ts
GroupMqModule.forRoot({ connection: {/* ... */}, manualRegistration: true });

const app = await NestFactory.createApplicationContext(AppModule);
// ...warm caches, run migrations, etc.
await GroupMqRegistrar.register(app);
```

## Differences from `@nestjs/bullmq`

groupmq has no `FlowProducer` and no separate `QueueEvents` class, so this
package intentionally omits `registerFlowProducer*`, `@InjectFlowProducer`,
`@QueueEventsListener` and `@OnQueueEvent`. Job names do not exist in groupmq, so
there is a single `process()` method per processor (no named `@Process`).
Connections are ioredis-based: `forRoot({ connection })` accepts `RedisOptions`
or an existing `Redis` instance.

## Development

```bash
npm install
npm run build
npm test            # unit tests
npm run test:e2e    # e2e tests (requires Redis at 127.0.0.1:6379)
```

The e2e suite exercises the integration end-to-end against a real Redis,
including module wiring (sync + async registration) and the groupmq behaviours
the wrapper surfaces — per-group FIFO ordering, cross-group concurrency,
retry/backoff with the `failed` event, delayed jobs, declarative repeatable
jobs, and graceful shutdown of in-flight jobs.

## License

MIT
