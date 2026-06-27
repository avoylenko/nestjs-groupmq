import { Provider } from '@nestjs/common';
import { Queue } from 'groupmq';
import { DEFAULT_QUEUE_NAME } from './groupmq.constants';
import { groupMqClassRegistry } from './groupmq.class-registry';
import { GroupMqConnectionManager } from './groupmq-connection.manager';
import type {
  GroupMqQueueOptions,
  SharedGroupMqAsyncConfiguration,
  SharedGroupMqConfiguration,
  SharedGroupMqConfigurationFactory,
} from './interfaces/shared-groupmq-config.interface';
import type {
  RegisterQueueAsyncOptions,
  RegisterQueueOptions,
  RegisterQueueOptionsFactory,
} from './interfaces/register-queue-options.interface';
import { getQueueOptionsToken } from './utils/get-queue-options-token.util';
import { getQueueToken } from './utils/get-queue-token.util';
import { getSharedConfigToken } from './utils/get-shared-config-token.util';
import {
  createConditionalDepHolder,
  IConditionalDepHolder,
} from './utils/helpers';

function extractQueueOptions(
  options: RegisterQueueOptions,
): GroupMqQueueOptions {
  const { name, namespace, configKey, connection, repeatableJobs, ...rest } =
    options;
  void name;
  void namespace;
  void configKey;
  void connection;
  void repeatableJobs;
  return rest;
}

function buildQueue(
  options: RegisterQueueOptions,
  connectionManager: GroupMqConnectionManager,
  sharedConfig?: SharedGroupMqConfiguration,
): Queue {
  const connectionDef = options.connection ?? sharedConfig?.connection;
  const queueName = options.name ?? DEFAULT_QUEUE_NAME;
  if (!connectionDef) {
    throw new Error(
      `No Redis connection configured for queue "${queueName}". Provide a "connection" ` +
        'via GroupMqModule.forRoot() or in GroupMqModule.registerQueue().',
    );
  }
  const redis = connectionManager.resolve(connectionDef);
  const namespace = options.namespace ?? queueName;
  return new groupMqClassRegistry.queueClass({
    ...(sharedConfig?.defaultJobOptions ?? {}),
    ...extractQueueOptions(options),
    redis,
    namespace,
  });
}

export function createQueueOptionProviders(
  options: RegisterQueueOptions[],
): Provider[] {
  return options.map((option) => ({
    provide: getQueueOptionsToken(option.name),
    useValue: option,
  }));
}

export function createQueueProviders(
  options: RegisterQueueOptions[],
): Provider[] {
  return options.reduce<Provider[]>((providers, option) => {
    const queueName = option.name ?? DEFAULT_QUEUE_NAME;
    const DepHolder = createConditionalDepHolder<SharedGroupMqConfiguration>(
      getSharedConfigToken(option.configKey),
      getSharedConfigToken(),
      (callerName) =>
        new Error(
          `The shared configuration "${option.configKey}" requested by queue "${callerName}" ` +
            `was not found. Did you forget to call GroupMqModule.forRoot("${option.configKey}", ...)?`,
        ),
    );

    providers.push(DepHolder);
    providers.push({
      provide: getQueueToken(option.name),
      useFactory: (
        depHolder: IConditionalDepHolder<SharedGroupMqConfiguration>,
        connectionManager: GroupMqConnectionManager,
        resolvedOptions: RegisterQueueOptions,
      ) =>
        buildQueue(
          resolvedOptions,
          connectionManager,
          depHolder.getDependencyRef(queueName),
        ),
      inject: [
        DepHolder,
        GroupMqConnectionManager,
        getQueueOptionsToken(option.name),
      ],
    });
    return providers;
  }, []);
}

export function createAsyncQueueOptionsProviders(
  optionsList: RegisterQueueAsyncOptions[],
): Provider[] {
  return optionsList.reduce<Provider[]>((providers, options) => {
    providers.push(createAsyncQueueOptionsProvider(options));
    if (options.useClass) {
      providers.push({ provide: options.useClass, useClass: options.useClass });
    }
    return providers;
  }, []);
}

function createAsyncQueueOptionsProvider(
  options: RegisterQueueAsyncOptions,
): Provider {
  const identity = {
    name: options.name,
    namespace: options.namespace,
    configKey: options.configKey,
  };

  if (options.useFactory) {
    return {
      provide: getQueueOptionsToken(options.name),
      useFactory: async (...args: unknown[]): Promise<RegisterQueueOptions> => {
        const factoryOptions = await options.useFactory!(...args);
        return { ...factoryOptions, ...identity };
      },
      inject: options.inject || [],
    };
  }

  const factoryToken = options.useExisting ?? options.useClass;
  return {
    provide: getQueueOptionsToken(options.name),
    useFactory: async (
      factory: RegisterQueueOptionsFactory,
    ): Promise<RegisterQueueOptions> => {
      const factoryOptions = await factory.createRegisterQueueOptions();
      return { ...factoryOptions, ...identity };
    },
    inject: [factoryToken!],
  };
}

export function createSharedConfigProvider(
  config: SharedGroupMqConfiguration,
  configKey?: string,
): Provider {
  return { provide: getSharedConfigToken(configKey), useValue: config };
}

export function createAsyncSharedConfigProviders(
  asyncConfig: SharedGroupMqAsyncConfiguration,
  configKey?: string,
): Provider[] {
  const token = getSharedConfigToken(configKey);

  if (asyncConfig.useFactory) {
    return [
      {
        provide: token,
        useFactory: asyncConfig.useFactory,
        inject: asyncConfig.inject || [],
      },
    ];
  }

  const factoryToken = asyncConfig.useExisting ?? asyncConfig.useClass;
  const providers: Provider[] = [
    {
      provide: token,
      useFactory: (factory: SharedGroupMqConfigurationFactory) =>
        factory.createSharedConfiguration(),
      inject: [factoryToken!],
    },
  ];
  if (asyncConfig.useClass) {
    providers.push({
      provide: asyncConfig.useClass,
      useClass: asyncConfig.useClass,
    });
  }
  return providers;
}
