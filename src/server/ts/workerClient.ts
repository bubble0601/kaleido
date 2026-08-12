import { Worker } from 'node:worker_threads';

import type { Diagnostic, HoverResponse } from '../../shared/types.js';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const CALL_TIMEOUT_MS = 30_000;

// 開発時 (tsx) はこのファイルが .ts のまま動くので worker も .ts + tsx ローダで起動する。
// ビルド後は dist/cli/index.js にバンドルされるため、dist/server/ts/worker.js を参照する。
function resolveWorker(): { url: URL; execArgv: string[] } {
  if (import.meta.url.endsWith('.ts')) {
    return { url: new URL('./worker.ts', import.meta.url), execArgv: ['--import', 'tsx'] };
  }
  return { url: new URL('../server/ts/worker.js', import.meta.url), execArgv: [] };
}

/**
 * worker thread 上の TsService への RPC クライアント。
 * hover / diagnostics は Promise、warmup / invalidateFile は fire-and-forget。
 */
export class TsWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();

  constructor(repoRoot: string) {
    const { url, execArgv } = resolveWorker();
    this.worker = new Worker(url, { workerData: { repoRoot }, execArgv });
    this.worker.unref();

    this.worker.on('message', (message: { id: number; result?: unknown; error?: string }) => {
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        call.reject(new Error(message.error));
      } else {
        call.resolve(message.result);
      }
    });
    this.worker.on('error', (error: unknown) => {
      console.error('[kaleido] ts worker error:', error);
      const wrapped = error instanceof Error ? error : new Error(String(error));
      for (const call of this.pending.values()) call.reject(wrapped);
      this.pending.clear();
    });
    this.worker.on('exit', (code) => {
      const error = new Error(`ts worker exited with code ${code}`);
      for (const call of this.pending.values()) call.reject(error);
      this.pending.clear();
    });
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ts worker call timed out: ${method}`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
      this.worker.postMessage({ id, method, params });
    });
  }

  hover(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): Promise<HoverResponse | null> {
    return this.call('hover', params);
  }

  diagnostics(params: { path: string; content?: string }): Promise<Diagnostic[]> {
    return this.call('diagnostics', params);
  }

  warmup(paths: string[]): void {
    this.worker.postMessage({ method: 'warmup', params: { paths } });
  }

  invalidateFile(path: string): void {
    this.worker.postMessage({ method: 'invalidateFile', params: { path } });
  }
}
