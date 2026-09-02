import { DynamicModule, Module, Provider } from '@nestjs/common';
import { Queue, Worker } from 'groupmq';
import { groupMqClassRegistry } from './groupmq.class-registry';
import { GroupMqCoreModule } from './groupmq-core.module';
import { groupMqModuleState } from './groupmq.module-state';
import {
  createAsyncQueueOptionsProviders,
  createAsyncSharedConfigProviders,
  createQueueOptionProviders,
  createQueueProviders,
  createSharedConfigProvider,
} from './groupmq.providers';
import type {
  RegisterQueueAsyncOptions,
  RegisterQueueOptions,
} from './interfaces/register-queue-options.interface';
import type {
  SharedGroupMqAsyncConfiguration,
  SharedGroupMqConfiguration,
} from './interfaces/shared-groupmq-config.interface';
import { getQueueToken } from './utils/get-queue-token.util';
import { getSharedConfigToken } from './utils/get-shared-config-token.util';

@Module({})
export class GroupMqModule {
  /** Override the underlying groupmq `Queue` implementation. */
  static set queueClass(cls: typeof Queue) {
    groupMqClassRegistry.queueClass = cls;
  }

  /** Override the underlying groupmq `Worker` implementation. */
  static set workerClass(cls: typeof Worker) {
    groupMqClassRegistry.workerClass = cls;
  }

  static forRoot(config: SharedGroupMqConfiguration): DynamicModule;
  static forRoot(
    configKey: string,
    config: SharedGroupMqConfiguration,
  ): DynamicModule;
  static forRoot(
    keyOrConfig: string | SharedGroupMqConfiguration,
    maybeConfig?: SharedGroupMqConfiguration,
  ): DynamicModule {
    const { configKey, config } = GroupMqModule.normalizeRootArgs(
      keyOrConfig,
      maybeConfig,
    );
    GroupMqModule.applyManualRegistration(config.manualRegistration);

    const provider = createSharedConfigProvider(config, configKey);
    return {
      global: true,
      module: GroupMqModule,
      imports: [GroupMqCoreModule],
      providers: [provider],
      exports: [getSharedConfigToken(configKey)],
    };
  }

  static forRootAsync(config: SharedGroupMqAsyncConfiguration): DynamicModule;
  static forRootAsync(
    configKey: string,
    config: SharedGroupMqAsyncConfiguration,
  ): DynamicModule;
  static forRootAsync(
    keyOrConfig: string | SharedGroupMqAsyncConfiguration,
    maybeConfig?: SharedGroupMqAsyncConfiguration,
  ): DynamicModule {
    const { configKey, config } = GroupMqModule.normalizeRootArgs(
      keyOrConfig,
      maybeConfig,
    );
    GroupMqModule.applyManualRegistration(config.manualRegistration);

    const providers = createAsyncSharedConfigProviders(config, configKey);
    return {
      global: true,
      module: GroupMqModule,
      imports: [GroupMqCoreModule, ...(config.imports ?? [])],
      providers,
      exports: [getSharedConfigToken(configKey)],
    };
  }

  static registerQueue(...options: RegisterQueueOptions[]): DynamicModule {
    const optionProviders = createQueueOptionProviders(options);
    const queueProviders = createQueueProviders(options);
    return {
      module: GroupMqModule,
      imports: [GroupMqCoreModule],
      providers: [...optionProviders, ...queueProviders],
      exports: options.map((option) => getQueueToken(option.name)),
    };
  }

  static registerQueueAsync(
    ...options: RegisterQueueAsyncOptions[]
  ): DynamicModule {
    const optionProviders = createAsyncQueueOptionsProviders(options);
    // Only the wiring fields: the namespace resolves later, via the async
    // options token that each queue provider injects.
    const queueProviders = createQueueProviders(
      options.map((option) => ({
        name: option.name,
        configKey: option.configKey,
      })),
    );

    const imports = options.reduce<DynamicModule['imports']>(
      (acc, option) => (option.imports ? [...acc!, ...option.imports] : acc),
      [GroupMqCoreModule],
    );
    const extraProviders = options.reduce<Provider[]>(
      (acc, option) =>
        option.extraProviders ? [...acc, ...option.extraProviders] : acc,
      [],
    );

    return {
      module: GroupMqModule,
      imports,
      providers: [...optionProviders, ...queueProviders, ...extraProviders],
      exports: options.map((option) => getQueueToken(option.name)),
    };
  }

  private static normalizeRootArgs<T>(
    keyOrConfig: string | T,
    maybeConfig?: T,
  ): { configKey?: string; config: T } {
    return typeof keyOrConfig === 'string'
      ? { configKey: keyOrConfig, config: maybeConfig as T }
      : { configKey: undefined, config: keyOrConfig };
  }

  private static applyManualRegistration(manualRegistration?: boolean): void {
    if (manualRegistration) {
      groupMqModuleState.manualRegistration = true;
    }
  }
}
