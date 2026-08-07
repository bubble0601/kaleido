import type { ServerEvent } from '../shared/types.js';

interface SseClient {
  write: (event: string, data: string) => Promise<void>;
}

/** SSE クライアント管理 + 全クライアント切断時の自動終了フック */
export class EventBus {
  private clients = new Set<SseClient>();
  private shutdownTimer: NodeJS.Timeout | null = null;

  constructor(private options: { isKeepAlive: boolean; onShutdown?: () => void }) {}

  register(client: SseClient): void {
    this.clients.add(client);
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
  }

  unregister(client: SseClient): void {
    this.clients.delete(client);
    if (this.clients.size === 0 && !this.options.isKeepAlive) {
      this.shutdownTimer = setTimeout(() => {
        if (this.clients.size === 0) {
          console.log('kaleido: all clients disconnected, shutting down');
          if (this.options.onShutdown) {
            this.options.onShutdown();
          } else {
            process.exit(0);
          }
        }
      }, 5000);
    }
  }

  broadcast(event: ServerEvent): void {
    for (const client of this.clients) {
      void client.write(event.type, JSON.stringify(event)).catch(() => {
        this.clients.delete(client);
      });
    }
  }
}
