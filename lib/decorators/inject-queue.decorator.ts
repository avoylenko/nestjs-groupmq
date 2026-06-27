import { Inject } from '@nestjs/common';
import { getQueueToken } from '../utils/get-queue-token.util';

/**
 * Injects a groupmq `Queue` instance by name.
 *
 * @example
 * constructor(@InjectQueue('orders') private readonly queue: Queue) {}
 */
export const InjectQueue = (name?: string): ParameterDecorator =>
  Inject(getQueueToken(name));
