export class InMemoryEventQueue {
  constructor() {
    this.messages = [];
  }

  async enqueue(message) {
    this.messages.push(structuredClone(message));
  }

  async consume(handler) {
    const results = [];
    while (this.messages.length > 0) {
      const message = this.messages.shift();
      results.push(await handler(message));
    }
    return results;
  }
}
