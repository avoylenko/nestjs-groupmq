import type { ModuleMetadata, Type } from '@nestjs/common';
import type { QueueOptions } from 'groupmq';
import type { Redis, RedisOptions } from 'ioredis';

/**
 * groupmq queue options minus the members the module supplies itself
 * (`redis` connection and `namespace`).
 */
export type GroupMqQueueOptions = Omit<QueueOptions, 'redis' | 'namespace'>;

export interface SharedGroupMqConfiguration {
  /**
   * ioredis connection options (the module constructs and owns the client) or an
   * existing `Redis` instance (reused as-is and never closed by the module).
   */
  connection: Redis | RedisOptions;
  /**
   * Default groupmq queue options merged into every queue registered against this
   * configuration. Per-queue options take precedence.
   */
  defaultJobOptions?: Partial<GroupMqQueueOptions>;
  /**
   * When true, workers are not started automatically on bootstrap; call
   * `GroupMqRegistrar.register(app)` to start them manually.
   */
  manualRegistration?: boolean;
}

export interface SharedGroupMqConfigurationFactory {
  createSharedConfiguration():
    | Promise<SharedGroupMqConfiguration>
    | SharedGroupMqConfiguration;
}

export interface SharedGroupMqAsyncConfiguration
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<SharedGroupMqConfigurationFactory>;
  useClass?: Type<SharedGroupMqConfigurationFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<SharedGroupMqConfiguration> | SharedGroupMqConfiguration;
  inject?: any[];
  /**
   * When true, workers are not started automatically on bootstrap; call
   * `GroupMqRegistrar.register(app)` to start them manually.
   */
  manualRegistration?: boolean;
}
