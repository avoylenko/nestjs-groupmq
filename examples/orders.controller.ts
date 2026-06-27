import { Body, Controller, Get, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { OrderData } from './order.model';

let counter = 0;

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @Body() body: { userId?: string; amount?: number },
  ): Promise<{ enqueued: OrderData; jobId: string }> {
    const order: OrderData = {
      orderId: `order-${++counter}`,
      userId: body.userId ?? 'user-1',
      amount: body.amount ?? 100,
    };
    const job = await this.orders.enqueue(order);
    return { enqueued: order, jobId: job.id };
  }

  @Get('stats')
  stats() {
    return this.orders.counts();
  }
}
