import { Injectable, SetMetadata } from '@nestjs/common';
import {
  PROCESSOR_METADATA,
  SCOPE_OPTIONS_METADATA,
  WORKER_METADATA,
} from '../groupmq.constants';
import type { NestWorkerOptions } from '../interfaces/worker-options.interface';
import type { ProcessorOptions } from '../interfaces/groupmq-processor.interface';

/**
 * Marks a class as a groupmq processor for a given queue. The class must extend
 * `WorkerHost` and implement `process()`. Optional groupmq worker options
 * (e.g. `concurrency`) can be supplied as the second argument.
 *
 * @example
 * \@Processor('orders', { concurrency: 8 })
 * export class OrdersProcessor extends WorkerHost { ... }
 */
export function Processor(queueName: string): ClassDecorator;
export function Processor(
  queueName: string,
  workerOptions: NestWorkerOptions,
): ClassDecorator;
export function Processor(processorOptions: ProcessorOptions): ClassDecorator;
export function Processor(
  processorOptions: ProcessorOptions,
  workerOptions: NestWorkerOptions,
): ClassDecorator;
export function Processor(
  queueNameOrOptions: string | ProcessorOptions,
  maybeWorkerOptions?: NestWorkerOptions,
): ClassDecorator {
  const options: ProcessorOptions =
    typeof queueNameOrOptions === 'object'
      ? queueNameOrOptions
      : { name: queueNameOrOptions };

  const workerOptions = maybeWorkerOptions ?? {};

  return (target: Function) => {
    SetMetadata(SCOPE_OPTIONS_METADATA, options)(target);
    SetMetadata(PROCESSOR_METADATA, options)(target);
    SetMetadata(WORKER_METADATA, workerOptions)(target);
    Injectable({ scope: options.scope })(target as any);
  };
}
