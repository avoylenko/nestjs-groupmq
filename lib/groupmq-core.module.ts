import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { GroupMqConnectionManager } from './groupmq-connection.manager';
import { GroupMqExplorer } from './groupmq.explorer';
import { GroupMqMetadataAccessor } from './groupmq.metadata.accessor';

/**
 * Internal, global module hosting the processor explorer, metadata accessor and
 * shared connection manager. Imported once by every `GroupMqModule` dynamic
 * module; deduplicated by Nest because it is a static module class.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    GroupMqExplorer,
    GroupMqMetadataAccessor,
    GroupMqConnectionManager,
  ],
  exports: [GroupMqConnectionManager],
})
export class GroupMqCoreModule {}
