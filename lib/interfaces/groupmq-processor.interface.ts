import type { Scope } from '@nestjs/common';
import type { WorkerEvents } from 'groupmq';

export interface ProcessorOptions {
  /** Name of the queue to which this processor subscribes. */
  name?: string;
  /** Injection scope of the processor. */
  scope?: Scope;
  /** Shared configuration key the underlying queue was registered against. */
  configKey?: string;
}

/** Union of the worker event names emitted by a groupmq Worker. */
export type GroupMqWorkerEvent = keyof WorkerEvents;

export interface OnWorkerEventMetadata {
  eventName: GroupMqWorkerEvent;
}
