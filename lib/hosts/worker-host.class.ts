import type { ReservedJob, Worker } from 'groupmq';
import { getWorkerHostNotInitializedMessage } from '../groupmq.messages';

/**
 * Base class for groupmq processors. Extend it and implement `process()` — the
 * explorer wires the returned promise up as the groupmq Worker `handler`.
 *
 * The `worker` property is assigned by the explorer during
 * `onApplicationBootstrap`; accessing it earlier throws.
 */
export abstract class WorkerHost<WorkerType extends Worker = Worker> {
  private _worker: WorkerType | undefined;

  get worker(): WorkerType {
    if (!this._worker) {
      throw new Error(getWorkerHostNotInitializedMessage());
    }
    return this._worker;
  }

  set worker(value: WorkerType) {
    this._worker = value;
  }

  abstract process(job: ReservedJob, token?: string): Promise<unknown>;
}
