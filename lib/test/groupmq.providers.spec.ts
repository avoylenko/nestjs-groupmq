import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FactoryProvider } from '@nestjs/common';
import { groupMqClassRegistry } from '../groupmq.class-registry';
import {
  createAsyncQueueOptionsProviders,
  createAsyncSharedConfigProviders,
  createQueueOptionProviders,
  createQueueProviders,
  createSharedConfigProvider,
} from '../groupmq.providers';
import { createConditionalDepHolder } from '../utils/helpers';
import { getQueueToken } from '../utils/get-queue-token.util';
import { getQueueOptionsToken } from '../utils/get-queue-options-token.util';
import { getSharedConfigToken } from '../utils/get-shared-config-token.util';

class FakeQueue {
  constructor(public opts: any) {}
}

const REDIS_FROM_SHARED = { __shared: true };
const REDIS_FROM_OVERRIDE = { __override: true };
const connectionManager = {
  resolve: vi.fn((conn: any) =>
    conn && conn.__override ? REDIS_FROM_OVERRIDE : REDIS_FROM_SHARED,
  ),
} as any;

function queueFactoryFor(options: any): FactoryProvider {
  const providers = createQueueProviders([options]);
  return providers.find(
    (p: any) => p.provide === getQueueToken(options.name),
  ) as FactoryProvider;
}

describe('token helpers', () => {
  it('builds stable, name-scoped tokens', () => {
    expect(getQueueToken('orders')).toBe('GroupMqQueue_orders');
    expect(getQueueToken()).toBe('GroupMqQueue_default');
    expect(getQueueOptionsToken('orders')).toBe('GroupMqQueueOptions_orders');
    expect(getSharedConfigToken()).toBe('GROUPMQ_CONFIG_DEFAULT');
    expect(getSharedConfigToken('analytics')).toBe('GROUPMQ_CONFIG_analytics');
  });
});

describe('config / option providers', () => {
  it('exposes registered options under the options token', () => {
    const [provider] = createQueueOptionProviders([
      { name: 'orders', jobTimeoutMs: 5000 },
    ]) as any[];
    expect(provider.provide).toBe(getQueueOptionsToken('orders'));
    expect(provider.useValue).toEqual({ name: 'orders', jobTimeoutMs: 5000 });
  });

  it('exposes the shared configuration under the shared-config token', () => {
    const config = { connection: { host: 'localhost' } } as any;
    const provider = createSharedConfigProvider(config, 'analytics') as any;
    expect(provider.provide).toBe(getSharedConfigToken('analytics'));
    expect(provider.useValue).toBe(config);
  });
});

describe('queue factory (buildQueue)', () => {
  let originalQueueClass: typeof groupMqClassRegistry.queueClass;

  beforeEach(() => {
    connectionManager.resolve.mockClear();
    originalQueueClass = groupMqClassRegistry.queueClass;
    groupMqClassRegistry.queueClass = FakeQueue as any;
  });

  afterEach(() => {
    groupMqClassRegistry.queueClass = originalQueueClass;
  });

  it('merges shared defaults under per-queue options and injects redis + namespace', () => {
    const provider = queueFactoryFor({
      name: 'orders',
      jobTimeoutMs: 1000,
    });
    const sharedConfig = {
      connection: { host: 'localhost' },
      defaultJobOptions: { jobTimeoutMs: 9999, maxAttempts: 5 },
    };
    const depHolder = { getDependencyRef: () => sharedConfig };

    const queue: FakeQueue = provider.useFactory(
      depHolder,
      connectionManager,
      { name: 'orders', jobTimeoutMs: 1000 },
    );

    expect(queue.opts.maxAttempts).toBe(5); // from shared defaults
    expect(queue.opts.jobTimeoutMs).toBe(1000); // per-queue overrides shared
    expect(queue.opts.namespace).toBe('orders');
    expect(queue.opts.redis).toBe(REDIS_FROM_SHARED);
    // Nest-specific keys must not leak into groupmq's QueueOptions.
    expect(queue.opts.name).toBeUndefined();
    expect(queue.opts.configKey).toBeUndefined();
  });

  it('prefers a per-queue connection override over the shared connection', () => {
    const provider = queueFactoryFor({ name: 'orders' });
    const depHolder = {
      getDependencyRef: () => ({ connection: { host: 'shared' } }),
    };

    const queue: FakeQueue = provider.useFactory(depHolder, connectionManager, {
      name: 'orders',
      connection: REDIS_FROM_OVERRIDE,
    });

    expect(queue.opts.redis).toBe(REDIS_FROM_OVERRIDE);
  });

  it('defaults the namespace to the queue name and honours an explicit namespace', () => {
    const provider = queueFactoryFor({ name: 'orders', namespace: 'orders:v2' });
    const depHolder = {
      getDependencyRef: () => ({ connection: { host: 'shared' } }),
    };

    const queue: FakeQueue = provider.useFactory(depHolder, connectionManager, {
      name: 'orders',
      namespace: 'orders:v2',
    });

    expect(queue.opts.namespace).toBe('orders:v2');
  });
});

describe('async option / config providers', () => {
  it('registerQueueAsync useFactory resolves options under the options token, keeping name/configKey', async () => {
    const [provider] = createAsyncQueueOptionsProviders([
      {
        name: 'orders',
        configKey: 'analytics',
        useFactory: async () => ({ jobTimeoutMs: 1234 }),
        inject: [],
      },
    ]) as any[];

    expect(provider.provide).toBe(getQueueOptionsToken('orders'));
    await expect(provider.useFactory()).resolves.toMatchObject({
      name: 'orders',
      configKey: 'analytics',
      jobTimeoutMs: 1234,
    });
  });

  it('registerQueueAsync useFactory keeps a factory-provided namespace', async () => {
    const [provider] = createAsyncQueueOptionsProviders([
      {
        name: 'flow.actions',
        useFactory: async () => ({ namespace: 'flow.actions.v1' }),
        inject: [],
      },
    ]) as any[];

    await expect(provider.useFactory()).resolves.toMatchObject({
      name: 'flow.actions',
      namespace: 'flow.actions.v1',
    });
  });

  it('registerQueueAsync prefers a registration-site namespace over the factory one', async () => {
    const [provider] = createAsyncQueueOptionsProviders([
      {
        name: 'flow.actions',
        namespace: 'flow.actions.pinned',
        useFactory: async () => ({ namespace: 'flow.actions.v1' }),
        inject: [],
      },
    ]) as any[];

    await expect(provider.useFactory()).resolves.toMatchObject({
      namespace: 'flow.actions.pinned',
    });
  });

  it('registerQueueAsync never lets the factory override name/configKey', async () => {
    const [provider] = createAsyncQueueOptionsProviders([
      {
        name: 'orders',
        configKey: 'analytics',
        useFactory: async () =>
          ({ name: 'hijacked', configKey: 'hijacked' }) as any,
        inject: [],
      },
    ]) as any[];

    await expect(provider.useFactory()).resolves.toMatchObject({
      name: 'orders',
      configKey: 'analytics',
    });
  });

  it('registerQueueAsync useClass keeps a factory-provided namespace', async () => {
    class NamespacedOptionsFactory {
      createRegisterQueueOptions() {
        return { namespace: 'flow.actions.v1' };
      }
    }
    const providers = createAsyncQueueOptionsProviders([
      { name: 'flow.actions', useClass: NamespacedOptionsFactory },
    ]) as any[];
    const optionProvider = providers.find(
      (p) => p.provide === getQueueOptionsToken('flow.actions'),
    );

    await expect(
      optionProvider.useFactory(new NamespacedOptionsFactory()),
    ).resolves.toMatchObject({
      name: 'flow.actions',
      namespace: 'flow.actions.v1',
    });
  });

  it('registerQueueAsync useClass also provides the factory class', () => {
    class OrdersOptionsFactory {
      createRegisterQueueOptions() {
        return { jobTimeoutMs: 1 };
      }
    }
    const providers = createAsyncQueueOptionsProviders([
      { name: 'orders', useClass: OrdersOptionsFactory },
    ]) as any[];

    expect(providers.some((p) => p.useClass === OrdersOptionsFactory)).toBe(
      true,
    );
    const optionProvider = providers.find(
      (p) => p.provide === getQueueOptionsToken('orders'),
    );
    expect(optionProvider.inject).toEqual([OrdersOptionsFactory]);
  });

  it('forRootAsync useFactory wires the shared-config token', () => {
    const factory = () => ({ connection: {} });
    const [provider] = createAsyncSharedConfigProviders(
      { useFactory: factory, inject: ['DEP'] },
      'analytics',
    ) as any[];

    expect(provider.provide).toBe(getSharedConfigToken('analytics'));
    expect(provider.useFactory).toBe(factory);
    expect(provider.inject).toEqual(['DEP']);
  });

  it('forRootAsync useClass provides the factory and a wrapper that calls createSharedConfiguration', async () => {
    class ConfigFactory {
      createSharedConfiguration() {
        return { connection: { host: 'x' } };
      }
    }
    const providers = createAsyncSharedConfigProviders({
      useClass: ConfigFactory,
    }) as any[];

    expect(providers.some((p) => p.useClass === ConfigFactory)).toBe(true);
    const tokenProvider = providers.find(
      (p) => p.provide === getSharedConfigToken(),
    );
    expect(tokenProvider.inject).toEqual([ConfigFactory]);
    expect(await tokenProvider.useFactory(new ConfigFactory())).toEqual({
      connection: { host: 'x' },
    });
  });
});

describe('createConditionalDepHolder', () => {
  it('throws when a required (keyed) shared configuration is missing', () => {
    const Holder = createConditionalDepHolder(
      getSharedConfigToken('analytics'),
      getSharedConfigToken(),
      (name) => new Error(`missing for ${name}`),
    );
    const holder = new Holder(undefined as any);
    expect(() => holder.getDependencyRef('orders')).toThrow(
      'missing for orders',
    );
  });

  it('does not throw when the default shared configuration is optional', () => {
    const Holder = createConditionalDepHolder(
      getSharedConfigToken(),
      getSharedConfigToken(),
      () => new Error('should not be thrown'),
    );
    const holder = new Holder(undefined as any);
    expect(holder.getDependencyRef('orders')).toBeUndefined();
  });
});
