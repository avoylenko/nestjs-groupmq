import {
  DEFAULT_QUEUE_NAME,
  GROUPMQ_QUEUE_OPTIONS_TOKEN_PREFIX,
} from '../groupmq.constants';

/**
 * Returns the injection token holding the resolved options for a queue.
 */
export function getQueueOptionsToken(name: string = DEFAULT_QUEUE_NAME): string {
  return `${GROUPMQ_QUEUE_OPTIONS_TOKEN_PREFIX}_${name}`;
}
