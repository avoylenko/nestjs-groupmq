import { Injectable, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ON_WORKER_EVENT_METADATA,
  PROCESSOR_METADATA,
  WORKER_METADATA,
} from './groupmq.constants';
import type { NestWorkerOptions } from './interfaces/worker-options.interface';
import type {
  OnWorkerEventMetadata,
  ProcessorOptions,
} from './interfaces/groupmq-processor.interface';

@Injectable()
export class GroupMqMetadataAccessor {
  constructor(private readonly reflector: Reflector) {}

  isProcessor(target: Type<unknown> | Function): boolean {
    if (!target) {
      return false;
    }
    return !!this.reflector.get(PROCESSOR_METADATA, target);
  }

  getProcessorMetadata(
    target: Type<unknown> | Function,
  ): ProcessorOptions | undefined {
    return this.reflector.get(PROCESSOR_METADATA, target);
  }

  getWorkerOptionsMetadata(
    target: Type<unknown> | Function,
  ): NestWorkerOptions | undefined {
    return this.reflector.get(WORKER_METADATA, target);
  }

  getOnWorkerEventMetadata(
    target: Type<unknown> | Function,
  ): OnWorkerEventMetadata | undefined {
    return this.reflector.get(ON_WORKER_EVENT_METADATA, target);
  }
}
