import type { ModuleMetadata, Provider, Type } from '@nestjs/common';
import type { AddOptions } from 'groupmq';
import type { Redis, RedisOptions } from 'ioredis';
import type { GroupMqQueueOptions } from './shared-groupmq-config.interface';

/**
 * A declarative repeatable job enqueued automatically on application bootstrap.
 * `repeat` should be set (either `{ every }` or `{ pattern }`).
 */
export type RepeatableJobDefinition = AddOptions<any>;

export interface RegisterQueueOptions extends GroupMqQueueOptions {
  /** Queue name; also the injection token and (by default) the groupmq namespace. */
  name?: string;
  /** Overrides the groupmq namespace (defaults to `name`). */
  namespace?: string;
  /** Selects which `forRoot()` shared configuration to inherit from. */
  configKey?: string;
  /** Per-queue connection override (takes precedence over the shared configuration). */
  connection?: Redis | RedisOptions;
  /** Declarative repeatable jobs enqueued automatically on application bootstrap. */
  repeatableJobs?: RepeatableJobDefinition[];
}

export type RegisterQueueFactoryOptions = Omit<
  RegisterQueueOptions,
  'name' | 'configKey'
>;

export interface RegisterQueueOptionsFactory {
  createRegisterQueueOptions():
    | Promise<RegisterQueueFactoryOptions>
    | RegisterQueueFactoryOptions;
}

export interface RegisterQueueAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Queue name; also the injection token and (by default) the groupmq namespace. */
  name?: string;
  /** Overrides the groupmq namespace (defaults to `name`). */
  namespace?: string;
  /** Selects which `forRoot()` shared configuration to inherit from. */
  configKey?: string;
  useExisting?: Type<RegisterQueueOptionsFactory>;
  useClass?: Type<RegisterQueueOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<RegisterQueueFactoryOptions> | RegisterQueueFactoryOptions;
  inject?: any[];
  extraProviders?: Provider[];
}
