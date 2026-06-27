import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { GroupMqMetadataAccessor } from '../groupmq.metadata.accessor';
import { Processor } from '../decorators/processor.decorator';
import { OnWorkerEvent } from '../decorators/on-worker-event.decorator';
import { WorkerHost } from '../hosts/worker-host.class';

@Processor('orders', { concurrency: 4 })
class OrdersProcessor extends WorkerHost {
  async process(): Promise<string> {
    return 'ok';
  }

  @OnWorkerEvent('completed')
  onCompleted(): void {}
}

class PlainProvider {}

describe('GroupMqMetadataAccessor', () => {
  let accessor: GroupMqMetadataAccessor;

  beforeEach(() => {
    accessor = new GroupMqMetadataAccessor(new Reflector());
  });

  it('detects @Processor classes', () => {
    expect(accessor.isProcessor(OrdersProcessor)).toBe(true);
    expect(accessor.isProcessor(PlainProvider)).toBe(false);
  });

  it('reads processor options (queue name)', () => {
    expect(accessor.getProcessorMetadata(OrdersProcessor)).toEqual({
      name: 'orders',
    });
  });

  it('reads worker options passed to @Processor', () => {
    expect(accessor.getWorkerOptionsMetadata(OrdersProcessor)).toEqual({
      concurrency: 4,
    });
  });

  it('reads @OnWorkerEvent metadata from a method', () => {
    const metadata = accessor.getOnWorkerEventMetadata(
      OrdersProcessor.prototype.onCompleted,
    );
    expect(metadata).toEqual({ eventName: 'completed' });
  });
});
