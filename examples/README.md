# Example app

A minimal NestJS app demonstrating `@avoylenko/nestjs-groupmq`:

- `GroupMqModule.forRoot()` + `registerQueue('orders')`
- An `OrdersProcessor` (`@Processor` + `WorkerHost`) with `@OnWorkerEvent` handlers
- An `OrdersService` injecting the queue via `@InjectQueue('orders')`
- An HTTP controller to enqueue jobs and read stats

> The example imports the library from `../lib` (source) so it runs without a
> build step. In a real project you would `import { ... } from '@avoylenko/nestjs-groupmq'`.

## Prerequisites

A Redis server reachable at `127.0.0.1:6379` (override with `REDIS_HOST` /
`REDIS_PORT`). For example:

```bash
docker run --rm -p 6379:6379 redis
```

## Run

From the repository root:

```bash
npm install
npm run example:start
```

On boot it seeds 6 demo orders (3 each for two users) so you can watch per-group
FIFO processing in the logs. Disable the seed with `SEED=false`.

## Try it

```bash
# enqueue an order for user 42
curl -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{"userId":"42","amount":999}'

# queue counts
curl http://localhost:3000/orders/stats
```

Stop with `Ctrl+C` — shutdown hooks close the workers gracefully.
