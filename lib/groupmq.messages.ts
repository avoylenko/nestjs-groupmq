export function getQueueNotFoundWarning(queueName: string): string {
  return (
    `No Queue was found for the "${queueName}" processor. ` +
    `Make sure you registered the queue with GroupMqModule.registerQueue({ name: "${queueName}" }) ` +
    `and that it is imported in the same module context as the processor.`
  );
}

export function getWorkerHostNotInitializedMessage(): string {
  return (
    '"Worker" has not yet been initialized. Make sure to interact with worker instances ' +
    'after the "onApplicationBootstrap" lifecycle hook is triggered, or if "manualRegistration" ' +
    'is set to true make sure to call "GroupMqRegistrar.register()".'
  );
}

export function getRequestScopedEventListenerWarning(
  processorName: string,
): string {
  return (
    `Warning! "${processorName}" is a request-scoped processor. ` +
    '"@OnWorkerEvent" handlers are not supported on request-scoped processors and will be ignored.'
  );
}
