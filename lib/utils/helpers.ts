import { Inject, Optional, Type } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';

export interface IConditionalDepHolder<T = any> {
  getDependencyRef(callerName: string): T;
}

/**
 * Creates a provider class that optionally injects a dependency (the shared
 * configuration). When the dependency is required (i.e. a `configKey` other than
 * the optional default was requested) but cannot be resolved, `errorFactory` is
 * thrown. Ported from the @nestjs/bull-shared package.
 */
export function createConditionalDepHolder<T = any>(
  depToken: string,
  optionalDepToken: string,
  errorFactory: (callerName: string) => Error,
): Type<IConditionalDepHolder<T>> {
  class ConditionalDepHolder {
    constructor(@Optional() @Inject(depToken) public _dependencyRef: T) {}

    getDependencyRef(callerName: string): T {
      if (depToken !== optionalDepToken && !this._dependencyRef) {
        throw errorFactory(callerName);
      }
      return this._dependencyRef;
    }
  }
  return ConditionalDepHolder as Type<IConditionalDepHolder<T>>;
}

export interface ResolvedConnection {
  client: Redis;
  /** true when this module constructed the client and therefore owns its lifecycle. */
  owned: boolean;
}

/** Duck-typed check for an existing ioredis client instance. */
export function isRedisInstance(value: unknown): value is Redis {
  if (value instanceof Redis) {
    return true;
  }
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Redis).connect === 'function' &&
    typeof (value as Redis).quit === 'function' &&
    typeof (value as Redis).duplicate === 'function'
  );
}

/**
 * Resolves a connection definition into a concrete ioredis client. When an
 * instance is supplied it is reused as-is (and never closed by the module); when
 * options are supplied a new client is constructed and owned by the module.
 */
export function resolveConnection(
  connection: Redis | RedisOptions,
): ResolvedConnection {
  if (isRedisInstance(connection)) {
    return { client: connection, owned: false };
  }
  return { client: new Redis(connection), owned: true };
}
