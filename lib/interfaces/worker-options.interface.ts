import type { WorkerOptions } from 'groupmq';

/**
 * Worker options accepted by `@Processor()`. The `queue` and `handler` members
 * are supplied by the explorer at runtime, so they are omitted here.
 */
export type NestWorkerOptions<T = any> = Omit<
  WorkerOptions<T>,
  'queue' | 'handler'
>;
