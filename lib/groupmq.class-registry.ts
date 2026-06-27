import { Queue, Worker } from 'groupmq';

/**
 * Holds the concrete `Queue` / `Worker` implementations used by the module.
 * Exposed through `GroupMqModule.queueClass` / `GroupMqModule.workerClass`
 * setters so consumers can substitute custom subclasses (e.g. for telemetry).
 */
export const groupMqClassRegistry: {
  queueClass: typeof Queue;
  workerClass: typeof Worker;
} = {
  queueClass: Queue,
  workerClass: Worker,
};
