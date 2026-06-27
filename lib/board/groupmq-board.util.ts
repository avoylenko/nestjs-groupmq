import {
  BullBoardGroupMQAdapter,
  type GroupMQBullBoardAdapterOptions,
  type Queue,
} from 'groupmq';

/**
 * Thin helper that wraps an injected groupmq `Queue` in a Bull Board adapter.
 * Use it together with `@InjectQueue()` to expose queues in a Bull Board UI.
 *
 * @example
 * \@Injectable()
 * export class BoardService {
 *   constructor(@InjectQueue('orders') queue: Queue) {
 *     createBullBoard({
 *       queues: [createGroupMqBoardAdapter(queue, { displayName: 'Orders' })],
 *       serverAdapter,
 *     });
 *   }
 * }
 */
export function createGroupMqBoardAdapter<T = any>(
  queue: Queue<T>,
  options?: GroupMQBullBoardAdapterOptions,
): BullBoardGroupMQAdapter<T> {
  return new BullBoardGroupMQAdapter<T>(queue, options);
}
