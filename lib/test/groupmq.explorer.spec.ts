import 'reflect-metadata';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Scope } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { GroupMqExplorer } from '../groupmq.explorer';
import { GroupMqMetadataAccessor } from '../groupmq.metadata.accessor';
import { groupMqClassRegistry } from '../groupmq.class-registry';
import { groupMqModuleState } from '../groupmq.module-state';
import { Processor } from '../decorators/processor.decorator';
import { OnWorkerEvent } from '../decorators/on-worker-event.decorator';
import { WorkerHost } from '../hosts/worker-host.class';
import { InvalidProcessorClassError } from '../errors/invalid-processor-class.error';
import { getQueueOptionsToken } from '../utils/get-queue-options-token.util';

const createdWorkers: FakeWorker[] = [];

class FakeWorker {
  static last: FakeWorker;
  listeners = new Map<string, (...args: any[]) => void>();
  run = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  on = vi.fn((event: string, listener: (...args: any[]) => void) => {
    this.listeners.set(event, listener);
  });

  constructor(public opts: any) {
    createdWorkers.push(this);
    FakeWorker.last = this;
  }
}

@Processor('orders', { concurrency: 4 })
class OrdersProcessor extends WorkerHost {
  processed: any[] = [];
  completedWith: any;

  async process(job: any): Promise<string> {
    this.processed.push(job);
    return 'done';
  }

  @OnWorkerEvent('completed')
  onCompleted(job: any): void {
    this.completedWith = job;
  }
}

function staticWrapper(partial: Record<string, any>) {
  return { isDependencyTreeStatic: () => true, ...partial };
}

describe('GroupMqExplorer', () => {
  const fakeQueue = { add: vi.fn().mockResolvedValue({}) };
  let originalWorkerClass: typeof groupMqClassRegistry.workerClass;
  let processorInstance: OrdersProcessor;
  let moduleRef: any;
  let explorer: GroupMqExplorer;

  beforeEach(() => {
    createdWorkers.length = 0;
    fakeQueue.add.mockClear();
    groupMqModuleState.manualRegistration = false;

    originalWorkerClass = groupMqClassRegistry.workerClass;
    groupMqClassRegistry.workerClass = FakeWorker as any;

    processorInstance = new OrdersProcessor();

    const processorWrapper = staticWrapper({
      name: 'OrdersProcessor',
      metatype: OrdersProcessor,
      instance: processorInstance,
    });
    const optionsWrapper = staticWrapper({
      name: getQueueOptionsToken('orders'),
      metatype: Object,
      instance: {
        name: 'orders',
        repeatableJobs: [
          { groupId: 'reports', data: { kind: 'daily' }, repeat: { every: 1000 } },
        ],
      },
    });

    const discoveryService = {
      getProviders: () => [processorWrapper, optionsWrapper],
    } as any;
    moduleRef = {
      get: vi.fn(() => fakeQueue),
      resolve: vi.fn(),
      registerRequestByContextId: vi.fn(),
    };

    explorer = new GroupMqExplorer(
      discoveryService,
      new GroupMqMetadataAccessor(new Reflector()),
      new MetadataScanner(),
      moduleRef,
    );
  });

  afterEach(() => {
    groupMqClassRegistry.workerClass = originalWorkerClass;
  });

  it('creates one worker per @Processor, wired to the resolved queue and worker options', () => {
    explorer.onModuleInit();

    expect(createdWorkers).toHaveLength(1);
    expect(FakeWorker.last.opts.queue).toBe(fakeQueue);
    expect(FakeWorker.last.opts.concurrency).toBe(4);
    expect(typeof FakeWorker.last.opts.handler).toBe('function');
    expect(processorInstance.worker).toBe(FakeWorker.last);
  });

  it('binds the host process() method as the worker handler', async () => {
    explorer.onModuleInit();
    const job = { id: '1', groupId: 'g' };

    await FakeWorker.last.opts.handler(job);

    expect(processorInstance.processed).toEqual([job]);
  });

  it('registers @OnWorkerEvent methods as worker event listeners', () => {
    explorer.onModuleInit();

    expect(FakeWorker.last.on).toHaveBeenCalledWith(
      'completed',
      expect.any(Function),
    );
    const job = { id: '1' };
    FakeWorker.last.listeners.get('completed')!(job);
    expect(processorInstance.completedWith).toBe(job);
  });

  it('starts workers and enqueues repeatable jobs on bootstrap', async () => {
    explorer.onModuleInit();
    await explorer.onApplicationBootstrap();

    expect(FakeWorker.last.run).toHaveBeenCalledTimes(1);
    expect(fakeQueue.add).toHaveBeenCalledWith({
      groupId: 'reports',
      data: { kind: 'daily' },
      repeat: { every: 1000 },
    });
  });

  it('does not auto-start workers when manualRegistration is enabled', async () => {
    groupMqModuleState.manualRegistration = true;
    explorer.onModuleInit();
    await explorer.onApplicationBootstrap();

    expect(FakeWorker.last.run).not.toHaveBeenCalled();

    await explorer.register();
    expect(FakeWorker.last.run).toHaveBeenCalledTimes(1);
  });

  it('closes all workers on shutdown', async () => {
    explorer.onModuleInit();
    await explorer.onApplicationShutdown();

    expect(FakeWorker.last.close).toHaveBeenCalledTimes(1);
  });
});

describe('GroupMqExplorer (edge cases)', () => {
  let originalWorkerClass: typeof groupMqClassRegistry.workerClass;

  beforeEach(() => {
    createdWorkers.length = 0;
    groupMqModuleState.manualRegistration = false;
    originalWorkerClass = groupMqClassRegistry.workerClass;
    groupMqClassRegistry.workerClass = FakeWorker as any;
  });

  afterEach(() => {
    groupMqClassRegistry.workerClass = originalWorkerClass;
  });

  function buildExplorer(providers: any[], moduleRef: any): GroupMqExplorer {
    return new GroupMqExplorer(
      { getProviders: () => providers } as any,
      new GroupMqMetadataAccessor(new Reflector()),
      new MetadataScanner(),
      moduleRef,
    );
  }

  it('throws InvalidProcessorClassError for a @Processor without process()', () => {
    @Processor('broken')
    class BrokenProcessor {}

    const wrapper = staticWrapper({
      name: 'BrokenProcessor',
      metatype: BrokenProcessor,
      instance: new BrokenProcessor(),
    });
    const explorer = buildExplorer([wrapper], {
      get: vi.fn(() => ({})),
      resolve: vi.fn(),
      registerRequestByContextId: vi.fn(),
    });

    expect(() => explorer.onModuleInit()).toThrow(InvalidProcessorClassError);
  });

  it('resolves a fresh instance per job for request-scoped processors', async () => {
    @Processor('scoped', { scope: Scope.REQUEST })
    class ScopedProcessor extends WorkerHost {
      processed: any[] = [];
      async process(job: any): Promise<string> {
        this.processed.push(job);
        return 'ok';
      }
    }

    const scopedInstance = new ScopedProcessor();
    const fakeQueue = { add: vi.fn() };
    const wrapper = {
      name: 'ScopedProcessor',
      metatype: ScopedProcessor,
      instance: null,
      isDependencyTreeStatic: () => false,
    };
    const moduleRef = {
      get: vi.fn(() => fakeQueue),
      resolve: vi.fn().mockResolvedValue(scopedInstance),
      registerRequestByContextId: vi.fn(),
    };

    const explorer = buildExplorer([wrapper], moduleRef);
    explorer.onModuleInit();

    expect(createdWorkers).toHaveLength(1);

    const job = { id: '1', groupId: 'g' };
    await FakeWorker.last.opts.handler(job);

    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledTimes(1);
    expect(moduleRef.resolve).toHaveBeenCalledWith(
      ScopedProcessor,
      expect.anything(),
      { strict: false },
    );
    expect(scopedInstance.processed).toEqual([job]);
  });
});
