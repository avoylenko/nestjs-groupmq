import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { isRedisInstance } from './utils/helpers';

/**
 * Resolves connection definitions into concrete ioredis clients and owns the
 * lifecycle of the clients it constructs.
 *
 * - An existing `Redis` instance is reused as-is and never closed by the module.
 * - A `RedisOptions` object yields one client per options-object identity, so all
 *   queues inheriting the same shared configuration share a single connection.
 */
@Injectable()
export class GroupMqConnectionManager implements OnApplicationShutdown {
  private readonly logger = new Logger(GroupMqConnectionManager.name);
  private readonly ownedClients = new Set<Redis>();
  private readonly optionClients = new Map<RedisOptions, Redis>();

  resolve(connection: Redis | RedisOptions): Redis {
    if (isRedisInstance(connection)) {
      return connection;
    }
    const existing = this.optionClients.get(connection);
    if (existing) {
      return existing;
    }
    const client = new Redis(connection);
    this.optionClients.set(connection, client);
    this.ownedClients.add(client);
    return client;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.ownedClients].map((client) =>
        client.quit().catch((err) => {
          this.logger.warn(
            `Error while closing a module-owned Redis connection: ${String(err)}`,
          );
          client.disconnect();
        }),
      ),
    );
    this.ownedClients.clear();
    this.optionClients.clear();
  }
}
