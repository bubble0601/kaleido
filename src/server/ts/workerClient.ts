import { totalmem } from 'node:os';
import { Worker } from 'node:worker_threads';

import type { DefinitionLocation, Diagnostic, HoverResponse } from '../../shared/types.js';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const CALL_TIMEOUT_MS = 30_000;

// CLI の --max-old-space-size ではなく resourceLimits で指定するのは、
// メモリを食うのは TS worker だけでメインスレッドの上限を上げる必要がないため
const WORKER_HEAP_MB = Math.min(8192, Math.floor(totalmem() / 1024 / 1024 / 2));

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
 * worker が終了した場合 (OOM 等) は次の呼び出しで作り直す。
 */
export class TsWorkerClient {
  private worker: Worker | null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();

  constructor(private repoRoot: string) {
    this.worker = this.spawn();
  }

  // 終了済みの Worker への postMessage は例外も出さず無視されるため、必ずこれを経由して送る。
  // exit 直後に即再起動しないのは、起動直後に再び OOM になる場合の再起動ループを避けるため
  private getWorker(): Worker {
    this.worker ??= this.spawn();
    return this.worker;
  }

  private spawn(): Worker {
    const { url, execArgv } = resolveWorker();
    const worker = new Worker(url, {
      workerData: { repoRoot: this.repoRoot },
      execArgv,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    worker.unref();

    worker.on('message', (message: { id: number; result?: unknown; error?: string }) => {
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        call.reject(new Error(message.error));
      } else {
        call.resolve(message.result);
      }
    });
    worker.on('error', (error: unknown) => {
      console.error('[kaleido] ts worker error:', error);
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
    });
    worker.on('exit', (code) => {
      if (this.worker === worker) this.worker = null;
      this.rejectAll(new Error(`ts worker exited with code ${code}`));
    });
    return worker;
  }

  private rejectAll(error: Error): void {
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
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
      this.getWorker().postMessage({ id, method, params });
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

  definition(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): Promise<DefinitionLocation[]> {
    return this.call('definition', params);
  }

  references(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): Promise<DefinitionLocation[]> {
    return this.call('references', params);
  }

  warmup(paths: string[]): void {
    this.getWorker().postMessage({ method: 'warmup', params: { paths } });
  }

  invalidateFile(path: string): void {
    this.getWorker().postMessage({ method: 'invalidateFile', params: { path } });
  }
}
