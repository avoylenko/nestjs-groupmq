import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  createContextId,
  DiscoveryService,
  MetadataScanner,
  ModuleRef,
} from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { Queue, ReservedJob, Worker } from 'groupmq';
import { groupMqClassRegistry } from './groupmq.class-registry';
import {
  DEFAULT_QUEUE_NAME,
  GROUPMQ_QUEUE_OPTIONS_TOKEN_PREFIX,
} from './groupmq.constants';
import { GroupMqMetadataAccessor } from './groupmq.metadata.accessor';
import { groupMqModuleState } from './groupmq.module-state';
import {
  getQueueNotFoundWarning,
  getRequestScopedEventListenerWarning,
} from './groupmq.messages';
import { InvalidProcessorClassError } from './errors/invalid-processor-class.error';
import type { WorkerHost } from './hosts/worker-host.class';
import type { RegisterQueueOptions } from './interfaces/register-queue-options.interface';
import { getQueueToken } from './utils/get-queue-token.util';

interface RepeatableJobRegistration {
  queue: Queue;
  jobs: NonNullable<RegisterQueueOptions['repeatableJobs']>;
}

@Injectable()
export class GroupMqExplorer
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GroupMqExplorer.name);
  private readonly workers: Worker[] = [];
  private readonly repeatableJobRegistrations: RepeatableJobRegistration[] = [];
  private started = false;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataAccessor: GroupMqMetadataAccessor,
    private readonly metadataScanner: MetadataScanner,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.createWorkers();
    this.collectRepeatableJobs();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (groupMqModuleState.manualRegistration) {
      return;
    }
    await this.register();
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.workers.map((worker) =>
        worker.close().catch((err) => {
          this.logger.warn(`Error while closing a worker: ${String(err)}`);
        }),
      ),
    );
  }

  /**
   * Starts every discovered worker and enqueues declarative repeatable jobs.
   * Idempotent. Invoked automatically on bootstrap unless `manualRegistration`
   * is enabled, in which case `GroupMqRegistrar.register()` calls it.
   */
  async register(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    for (const worker of this.workers) {
      // worker.run() resolves only when the worker is closed, so it must not be awaited.
      void worker.run().catch((err) => {
        this.logger.error(`Worker run loop failed: ${String(err)}`);
      });
    }
    await this.enqueueRepeatableJobs();
  }

  private createWorkers(): void {
    const processors = this.discoveryService
      .getProviders()
      .filter(
        (wrapper) =>
          wrapper.metatype &&
          this.metadataAccessor.isProcessor(wrapper.metatype),
      );

    for (const wrapper of processors) {
      const { metatype } = wrapper;
      if (!metatype) {
        continue;
      }

      // Request/transient-scoped providers have no singleton instance; their
      // handler resolves a fresh instance per job. Static providers must already
      // be instantiated.
      const isStatic = wrapper.isDependencyTreeStatic();
      if (isStatic && !wrapper.instance) {
        continue;
      }

      if (typeof metatype.prototype?.process !== 'function') {
        throw new InvalidProcessorClassError(metatype.name);
      }

      const processorMetadata =
        this.metadataAccessor.getProcessorMetadata(metatype);
      const queueName = processorMetadata?.name;
      const workerOptions =
        this.metadataAccessor.getWorkerOptionsMetadata(metatype) ?? {};

      const queue = this.resolveQueue(queueName);
      if (!queue) {
        this.logger.warn(getQueueNotFoundWarning(queueName ?? DEFAULT_QUEUE_NAME));
        continue;
      }

      const handler = this.createHandler(wrapper);
      const worker = new groupMqClassRegistry.workerClass({
        ...workerOptions,
        queue,
        handler,
      });
      this.workers.push(worker);

      if (isStatic) {
        (wrapper.instance as WorkerHost).worker = worker;
        this.registerWorkerEventListeners(wrapper, worker);
      } else {
        this.logger.warn(getRequestScopedEventListenerWarning(metatype.name));
      }
    }
  }

  private createHandler(
    wrapper: InstanceWrapper,
  ): (job: ReservedJob) => Promise<unknown> {
    const { instance } = wrapper;
    const metatype = wrapper.metatype!;

    if (wrapper.isDependencyTreeStatic()) {
      const host = instance as WorkerHost;
      return host.process.bind(host);
    }

    // Request-scoped: resolve a fresh instance per job.
    return async (job: ReservedJob): Promise<unknown> => {
      const contextId = createContextId();
      this.moduleRef.registerRequestByContextId({ job }, contextId);
      const contextInstance = (await this.moduleRef.resolve(
        metatype,
        contextId,
        { strict: false },
      )) as WorkerHost;
      return contextInstance.process(job);
    };
  }

  private registerWorkerEventListeners(
    wrapper: InstanceWrapper,
    worker: Worker,
  ): void {
    const { instance } = wrapper;
    const prototype = Object.getPrototypeOf(instance);

    this.metadataScanner
      .getAllMethodNames(prototype)
      .forEach((methodName: string) => {
        const metadata = this.metadataAccessor.getOnWorkerEventMetadata(
          (instance as Record<string, any>)[methodName],
        );
        if (!metadata) {
          return;
        }
        worker.on(metadata.eventName as any, (...args: unknown[]) =>
          (instance as Record<string, any>)[methodName].apply(instance, args),
        );
      });
  }

  private collectRepeatableJobs(): void {
    const optionWrappers = this.discoveryService
      .getProviders()
      .filter(
        (wrapper) =>
          typeof wrapper.name === 'string' &&
          wrapper.name.startsWith(GROUPMQ_QUEUE_OPTIONS_TOKEN_PREFIX) &&
          !!wrapper.instance,
      );

    for (const wrapper of optionWrappers) {
      const options = wrapper.instance as RegisterQueueOptions;
      if (!options.repeatableJobs?.length) {
        continue;
      }
      const queue = this.resolveQueue(options.name);
      if (!queue) {
        continue;
      }
      this.repeatableJobRegistrations.push({
        queue,
        jobs: options.repeatableJobs,
      });
    }
  }

  private async enqueueRepeatableJobs(): Promise<void> {
    for (const { queue, jobs } of this.repeatableJobRegistrations) {
      for (const job of jobs) {
        try {
          await queue.add(job);
        } catch (err) {
          this.logger.error(
            `Failed to enqueue repeatable job for group "${job.groupId}": ${String(err)}`,
          );
        }
      }
    }
  }

  private resolveQueue(queueName?: string): Queue | undefined {
    try {
      return this.moduleRef.get<Queue>(getQueueToken(queueName), {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }
}
