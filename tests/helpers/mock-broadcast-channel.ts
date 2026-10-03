type MessageListener = (event: MessageEvent) => void;

export class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  static silencedTabIds = new Set<string>();

  readonly name: string;
  closed = false;
  private listeners = new Set<MessageListener>();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  static reset() {
    MockBroadcastChannel.instances = [];
    MockBroadcastChannel.silencedTabIds.clear();
  }

  static silenceTab(tabId: string) {
    MockBroadcastChannel.silencedTabIds.add(tabId);
  }

  static unsilenceTab(tabId: string) {
    MockBroadcastChannel.silencedTabIds.delete(tabId);
  }

  postMessage(message: unknown) {
    const tabId = (message as { tabId?: string } | null)?.tabId;
    if (tabId && MockBroadcastChannel.silencedTabIds.has(tabId)) {
      return;
    }

    const targets = MockBroadcastChannel.instances.filter(
      (instance) => instance !== this && instance.name === this.name
    );

    queueMicrotask(() => {
      for (const target of targets) {
        if (target.closed) {
          continue;
        }

        for (const listener of target.listeners) {
          listener({ data: message } as MessageEvent);
        }
      }
    });
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: MessageListener) {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  close() {
    this.closed = true;
  }
}
