// ts.LanguageService を worker thread で動かすエントリ。
// Program 構築や semantic check は同期 CPU バウンドのため、
// メインスレッドで実行すると /api/file 等の応答をブロックしてしまう。
import { parentPort, workerData } from 'node:worker_threads';

import { TsService } from './service.js';

interface RequestMessage {
  id?: number;
  method: 'hover' | 'diagnostics' | 'definition' | 'references' | 'warmup' | 'invalidateFile';
  params: never;
}

const port = parentPort;
if (!port) throw new Error('ts worker must be started as a worker thread');

const service = new TsService((workerData as { repoRoot: string }).repoRoot);

port.on('message', (message: RequestMessage) => {
  const { id, method, params } = message;
  try {
    let result: unknown = null;
    switch (method) {
      case 'hover':
        result = service.hover(params);
        break;
      case 'diagnostics':
        result = service.diagnostics(params);
        break;
      case 'definition':
        result = service.definition(params);
        break;
      case 'references':
        result = service.references(params);
        break;
      case 'warmup':
        service.warmup((params as { paths: string[] }).paths);
        break;
      case 'invalidateFile':
        service.invalidateFile((params as { path: string }).path);
        break;
    }
    if (id !== undefined) port.postMessage({ id, result });
  } catch (error) {
    if (id !== undefined) {
      port.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
});
