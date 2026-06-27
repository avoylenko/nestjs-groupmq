export class InvalidProcessorClassError extends Error {
  constructor(name: string) {
    super(
      `The "${name}" class is decorated with @Processor() but does not extend ` +
        '"WorkerHost" / implement a "process" method. Every processor must provide ' +
        'a "process(job)" method to be used as the groupmq Worker handler.',
    );
    this.name = 'InvalidProcessorClassError';
  }
}
