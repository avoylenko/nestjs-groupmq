import { Injectable } from '@nestjs/common';
// In your own project import from '@avoylenko/nestjs-groupmq'.
import { InjectQueue } from '../lib';
import type { Queue } from '../lib';
import type { OrderData } from './order.model';

@Injectable()
export class OrdersService {
  constructor(
    @InjectQueue('orders') private readonly queue: Queue<OrderData>,
  ) {}

  enqueue(order: OrderData) {
    // Jobs sharing a groupId are processed strictly in FIFO order.
    return this.queue.add({ groupId: `user:${order.userId}`, data: order });
  }

  counts() {
    return this.queue.getJobCounts();
  }
}
