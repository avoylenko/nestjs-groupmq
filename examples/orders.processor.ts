import { Logger } from '@nestjs/common';
// In your own project import from '@avoylenko/nestjs-groupmq'.
import { OnWorkerEvent, Processor, WorkerHost } from '../lib';
import type { Job, ReservedJob } from '../lib';
import type { OrderData } from './order.model';

@Processor('orders', { concurrency: 20, blockingTimeoutSec: 2 })
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  async process(job: ReservedJob<OrderData>): Promise<{ ok: true }> {
    this.logger.log(
      `Processing ${job.data.orderId} for ${job.groupId} (amount: ${job.data.amount})`,
    );
    // Simulate work so concurrency / ordering is observable in the logs.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: true };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<OrderData>): void {
    this.logger.log(`✅ completed ${job.data?.orderId} for ${job.groupId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OrderData>): void {
    this.logger.warn(`❌ failed ${job.data?.orderId} for ${job.groupId}: ${job.failedReason}`);
  }
}
