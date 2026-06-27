import {
  GROUPMQ_CONFIG_DEFAULT_TOKEN,
  GROUPMQ_CONFIG_TOKEN_PREFIX,
} from '../groupmq.constants';

/**
 * Returns the injection token for the shared configuration registered via
 * `GroupMqModule.forRoot()` / `forRootAsync()`. When a `configKey` is provided,
 * multiple independent shared configurations can coexist.
 */
export function getSharedConfigToken(configKey?: string): string {
  return configKey
    ? `${GROUPMQ_CONFIG_TOKEN_PREFIX}_${configKey}`
    : GROUPMQ_CONFIG_DEFAULT_TOKEN;
}
