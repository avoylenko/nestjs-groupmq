import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GroupMqModule,
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
  type Job,
  type Queue,
  type ReservedJob,
} from '../lib';
import {
  connection,
  probeRedis,
  sleep,
  uniqueNamespace,
  waitFor,
  waitForAsync,
} from './redis-test-utils';

const redisAvailable = await probeRedis();

async function bootApp(moduleClass: any): Promise<TestingModule> {
  const app = await Test.createTestingModule({
    imports: [moduleClass],
  }).compile();
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Ordering: out-of-order arrivals are reordered by orderMs (orderingDelayMs).
// Mirrors groupmq test/queue.ordering.test.ts.
// ---------------------------------------------------------------------------
const orderingState = { processed: [] as number[] };

@Processor('ordering', { concurrency: 1, blockingTimeoutSec: 1 })
class OrderingProcessor extends WorkerHost {
  async process(job: ReservedJob<{ n: number }>): Promise<void> {
    orderingState.processed.push(job.data.n);
  }
}

@Injectable()
class OrderingService {
  constructor(@InjectQueue('ordering') readonly queue: Queue<{ n: number }>) {}
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'ordering',
      namespace: uniqueNamespace('ordering'),
      orderingDelayMs: 150,
    }),
  ],
  providers: [OrderingProcessor, OrderingService],
})
class OrderingModule {}

// ---------------------------------------------------------------------------
// Concurrency: distinct groups process in parallel (concurrency > 1).
// Mirrors groupmq test/queue.concurrency.test.ts.
// ---------------------------------------------------------------------------
const concurrencyState = { active: 0, maxActive: 0, processed: [] as string[] };

@Processor('concurrency', { concurrency: 3, blockingTimeoutSec: 1 })
class ConcurrencyProcessor extends WorkerHost {
  async process(job: ReservedJob<{ id: string }>): Promise<void> {
    concurrencyState.active += 1;
    concurrencyState.maxActive = Math.max(
      concurrencyState.maxActive,
      concurrencyState.active,
    );
    await sleep(200);
    concurrencyState.active -= 1;
    concurrencyState.processed.push(job.data.id);
  }
}

@Injectable()
class ConcurrencyService {
  constructor(
    @InjectQueue('concurrency') readonly queue: Queue<{ id: string }>,
  ) {}
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'concurrency',
      namespace: uniqueNamespace('concurrency'),
    }),
  ],
  providers: [ConcurrencyProcessor, ConcurrencyService],
})
class ConcurrencyModule {}

// ---------------------------------------------------------------------------
// Retry: backoff + retries; failed event on dead-letter; FIFO preserved.
// Mirrors groupmq test/queue.retry.test.ts.
// ---------------------------------------------------------------------------
interface RetryData {
  id: string;
  flaky?: boolean;
  always?: boolean;
}
const retryState = {
  attempts: {} as Record<string, number>,
  processedOrder: [] as string[],
  failed: [] as string[],
};

@Processor('retry', {
  concurrency: 1,
  blockingTimeoutSec: 1,
  backoff: () => 20,
  schedulerIntervalMs: 50,
})
class RetryProcessor extends WorkerHost {
  async process(job: ReservedJob<RetryData>): Promise<void> {
    const { id } = job.data;
    retryState.attempts[id] = (retryState.attempts[id] ?? 0) + 1;
    if (job.data.always) {
      throw new Error(`always-fails:${id}`);
    }
    if (job.data.flaky && retryState.attempts[id] < 2) {
      throw new Error(`flaky:${id}`);
    }
    retryState.processedOrder.push(id);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RetryData>): void {
    if (job.data?.id) {
      retryState.failed.push(job.data.id);
    }
  }
}

@Injectable()
class RetryService {
  constructor(@InjectQueue('retry') readonly queue: Queue<RetryData>) {}
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'retry',
      namespace: uniqueNamespace('retry'),
      maxAttempts: 5,
    }),
  ],
  providers: [RetryProcessor, RetryService],
})
class RetryModule {}

// ---------------------------------------------------------------------------
// Delay: delayed jobs become available later than immediate ones.
// Mirrors groupmq test/queue.delay.test.ts.
// ---------------------------------------------------------------------------
const delayState = { processedAt: {} as Record<string, number> };

@Processor('delay', {
  concurrency: 2,
  blockingTimeoutSec: 1,
  schedulerIntervalMs: 50,
})
class DelayProcessor extends WorkerHost {
  async process(job: ReservedJob<{ id: string }>): Promise<void> {
    delayState.processedAt[job.data.id] = Date.now();
  }
}

@Injectable()
class DelayService {
  constructor(@InjectQueue('delay') readonly queue: Queue<{ id: string }>) {}
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'delay',
      namespace: uniqueNamespace('delay'),
    }),
  ],
  providers: [DelayProcessor, DelayService],
})
class DelayModule {}

// ---------------------------------------------------------------------------
// Repeatable: declarative repeatableJobs re-run on an interval.
// Mirrors groupmq test/queue.cron.test.ts (repeat: { every }).
// ---------------------------------------------------------------------------
const repeatState = { count: 0 };

@Processor('repeat', {
  concurrency: 1,
  blockingTimeoutSec: 1,
  schedulerIntervalMs: 50,
})
class RepeatProcessor extends WorkerHost {
  async process(): Promise<void> {
    repeatState.count += 1;
  }
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'repeat',
      namespace: uniqueNamespace('repeat'),
      repeatableJobs: [
        { groupId: 'r', data: { kind: 'tick' }, repeat: { every: 100 } },
      ],
    }),
  ],
  providers: [RepeatProcessor],
})
class RepeatModule {}

// ---------------------------------------------------------------------------
// Graceful shutdown: in-flight jobs finish when the app shuts down.
// Mirrors groupmq test/queue.graceful-shutdown.test.ts.
// ---------------------------------------------------------------------------
const shutdownState = { started: false, completed: [] as string[] };

@Processor('shutdown', { concurrency: 1, blockingTimeoutSec: 1 })
class ShutdownProcessor extends WorkerHost {
  async process(job: ReservedJob<{ id: string }>): Promise<void> {
    shutdownState.started = true;
    await sleep(400);
    shutdownState.completed.push(job.data.id);
  }
}

@Injectable()
class ShutdownService {
  constructor(@InjectQueue('shutdown') readonly queue: Queue<{ id: string }>) {}
}

@Module({
  imports: [
    GroupMqModule.forRoot({ connection }),
    GroupMqModule.registerQueue({
      name: 'shutdown',
      namespace: uniqueNamespace('shutdown'),
    }),
  ],
  providers: [ShutdownProcessor, ShutdownService],
})
class ShutdownModule {}

describe.skipIf(!redisAvailable)('groupmq behaviors via NestJS (e2e)', () => {
  describe('ordering', () => {
    let app: TestingModule;
    beforeEach(() => {
      orderingState.processed = [];
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('reorders out-of-order arrivals within a group by orderMs', async () => {
      app = await bootApp(OrderingModule);
      const queue = app.get(OrderingService).queue;
      const base = Date.now();

      // Added newest-first; expected to process by ascending orderMs (1,2,3).
      await queue.add({ groupId: 'g', data: { n: 3 }, orderMs: base + 3 });
      await queue.add({ groupId: 'g', data: { n: 2 }, orderMs: base + 2 });
      await queue.add({ groupId: 'g', data: { n: 1 }, orderMs: base + 1 });

      await waitFor(() => orderingState.processed.length === 3);
      expect(orderingState.processed).toEqual([1, 2, 3]);
    });
  });

  describe('concurrency', () => {
    let app: TestingModule;
    beforeEach(() => {
      concurrencyState.active = 0;
      concurrencyState.maxActive = 0;
      concurrencyState.processed = [];
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('processes distinct groups in parallel', async () => {
      app = await bootApp(ConcurrencyModule);
      const queue = app.get(ConcurrencyService).queue;

      // One job per group -> all eligible to run at once.
      await queue.add({ groupId: 'a', data: { id: 'a' } });
      await queue.add({ groupId: 'b', data: { id: 'b' } });
      await queue.add({ groupId: 'c', data: { id: 'c' } });

      await waitFor(() => concurrencyState.processed.length === 3);
      expect(concurrencyState.processed.sort()).toEqual(['a', 'b', 'c']);
      expect(concurrencyState.maxActive).toBeGreaterThanOrEqual(2);
    });
  });

  describe('retry', () => {
    let app: TestingModule;
    beforeEach(() => {
      retryState.attempts = {};
      retryState.processedOrder = [];
      retryState.failed = [];
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('retries with backoff, preserves FIFO, and dead-letters after maxAttempts', async () => {
      app = await bootApp(RetryModule);
      const queue = app.get(RetryService).queue;

      // FIFO group: middle job fails once before succeeding.
      await queue.add({ groupId: 'fifo', data: { id: '1' } });
      await queue.add({ groupId: 'fifo', data: { id: '2', flaky: true } });
      await queue.add({ groupId: 'fifo', data: { id: '3' } });
      // Poisoned group: always fails, capped at 2 attempts.
      await queue.add({
        groupId: 'dead',
        data: { id: 'x', always: true },
        maxAttempts: 2,
      });

      await waitFor(() => retryState.processedOrder.length === 3, 15_000);
      // Wait until the poisoned group is fully dead-lettered (no pending work).
      await waitForAsync(async () => {
        const counts = await queue.getJobCounts();
        return (
          retryState.failed.includes('x') &&
          counts.active === 0 &&
          counts.waiting === 0 &&
          counts.delayed === 0
        );
      }, 15_000);

      // FIFO preserved across the in-group retry of job "2".
      expect(retryState.processedOrder).toEqual(['1', '2', '3']);
      // Flaky job retried once before succeeding.
      expect(retryState.attempts['2']).toBeGreaterThanOrEqual(2);
      // Poisoned job was retried and eventually dead-lettered (failed event fired).
      expect(retryState.attempts['x']).toBeGreaterThanOrEqual(2);
      expect(retryState.failed).toContain('x');
    });
  });

  describe('delay', () => {
    let app: TestingModule;
    beforeEach(() => {
      delayState.processedAt = {};
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('runs delayed jobs after immediate ones', async () => {
      app = await bootApp(DelayModule);
      const queue = app.get(DelayService).queue;
      const base = Date.now();

      await queue.add({ groupId: 'now', data: { id: 'now' } });
      await queue.add({ groupId: 'later', data: { id: 'later' }, delay: 800 });

      await waitFor(
        () =>
          delayState.processedAt['now'] !== undefined &&
          delayState.processedAt['later'] !== undefined,
      );

      expect(delayState.processedAt['now'] - base).toBeLessThan(600);
      expect(delayState.processedAt['later'] - base).toBeGreaterThanOrEqual(600);
    });
  });

  describe('repeatable jobs', () => {
    let app: TestingModule;
    beforeEach(() => {
      repeatState.count = 0;
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('re-runs declarative repeatable jobs on an interval', async () => {
      app = await bootApp(RepeatModule);
      await waitFor(() => repeatState.count >= 2, 10_000);
      expect(repeatState.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('graceful shutdown', () => {
    let app: TestingModule;
    beforeEach(() => {
      shutdownState.started = false;
      shutdownState.completed = [];
    });
    afterEach(async () => {
      await app?.close().catch(() => undefined);
    });

    it('lets an in-flight job finish during shutdown', async () => {
      app = await bootApp(ShutdownModule);
      const queue = app.get(ShutdownService).queue;
      await queue.add({ groupId: 'g', data: { id: 'long' } });

      await waitFor(() => shutdownState.started);
      // app.close() triggers onApplicationShutdown -> worker.close() (graceful).
      await app.close();

      expect(shutdownState.completed).toContain('long');
    });
  });
});
