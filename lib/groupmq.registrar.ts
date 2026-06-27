import { INestApplicationContext } from '@nestjs/common';
import { GroupMqExplorer } from './groupmq.explorer';

/**
 * Starts groupmq workers manually. Use together with
 * `manualRegistration: true` on `GroupMqModule.forRoot()` when you need full
 * control over when workers begin processing (e.g. after warming caches).
 *
 * @example
 * const app = await NestFactory.createApplicationContext(AppModule);
 * await GroupMqRegistrar.register(app);
 */
export class GroupMqRegistrar {
  static async register(app: INestApplicationContext): Promise<void> {
    const explorer = app.get(GroupMqExplorer, { strict: false });
    await explorer.register();
  }
}
