import {
  DEFAULT_QUEUE_NAME,
  GROUPMQ_QUEUE_TOKEN_PREFIX,
} from '../groupmq.constants';

/**
 * Returns the injection token for a groupmq Queue with the given name.
 * Used by the `@InjectQueue()` decorator and the queue providers.
 */
export function getQueueToken(name: string = DEFAULT_QUEUE_NAME): string {
  return `${GROUPMQ_QUEUE_TOKEN_PREFIX}_${name}`;
}
