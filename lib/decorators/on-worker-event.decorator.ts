import { SetMetadata } from '@nestjs/common';
import { ON_WORKER_EVENT_METADATA } from '../groupmq.constants';
import type {
  GroupMqWorkerEvent,
  OnWorkerEventMetadata,
} from '../interfaces/groupmq-processor.interface';

/**
 * Registers the decorated method as a listener for a groupmq Worker event
 * (`completed`, `failed`, `ready`, `error`, `closed`, `graceful-timeout`,
 * `stalled`, ...). The enclosing class must be annotated with `@Processor()`.
 *
 * Not supported on request-scoped processors.
 *
 * @example
 * \@OnWorkerEvent('completed')
 * onCompleted(job: Job) {}
 */
export const OnWorkerEvent = (
  eventName: GroupMqWorkerEvent,
): MethodDecorator =>
  SetMetadata(ON_WORKER_EVENT_METADATA, { eventName } as OnWorkerEventMetadata);
