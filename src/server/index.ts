import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import type { RangeSpec } from '../shared/types.js';
import { createApp } from './app.js';
import { createAppContext } from './context.js';
import { startWatcher } from './watcher.js';

export interface StartServerOptions {
  /** 表示対象のルートディレクトリ (git リポジトリならその toplevel) */
  rootDir: string;
  isGitRepo: boolean;
  initialRange: RangeSpec;
  /** CLI から追加する除外パターン */
  excludes?: string[];
  port: number;
  host: string;
  /** false の場合、全クライアント切断から5秒後にプロセスを終了する */
  isKeepAlive: boolean;
  /** 自動終了時に呼ばれる (コメントのターミナル出力など)。未指定なら process.exit(0) */
  onShutdown?: () => void;
}

export interface StartedServer {
  port: number;
  url: string;
  server: ServerType;
}

export async function startServer(options: StartServerOptions): Promise<StartedServer> {
  const ctx = createAppContext(options.rootDir, options.initialRange, {
    isGitRepo: options.isGitRepo,
    isKeepAlive: options.isKeepAlive,
    excludes: options.excludes,
    onShutdown: options.onShutdown,
  });
  const app = createApp(ctx);

  void startWatcher(ctx.rootDir, (paths) => {
    for (const path of paths) {
      ctx.tsService.invalidateFile(path);
    }
    ctx.eventBus.broadcast({ type: 'files-changed' });
  }).catch((error: unknown) => {
    console.warn('kaleido: file watcher unavailable:', error);
  });

  // 本番ビルドでは dist/client を配信する (dist/server/index.js から見て ../client)
  const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'client');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.use('/*', serveStatic({ root: relativizeForServeStatic(clientDir) }));
    app.get('*', serveStatic({ path: join(relativizeForServeStatic(clientDir), 'index.html') }));
  }

  const port = await findAvailablePort(options.port, options.host);
  const server = serve({ fetch: app.fetch, port, hostname: options.host });
  const url = `http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${port}`;
  return { port, url, server };
}

/** serve-static は cwd 相対パスを要求するため変換する */
function relativizeForServeStatic(absDir: string): string {
  return relative(process.cwd(), absDir) || '.';
}

async function findAvailablePort(startPort: number, host: string): Promise<number> {
  const { createServer } = await import('node:net');
  for (let port = startPort; port < startPort + 100; port++) {
    const isFree = await new Promise<boolean>((resolvePromise) => {
      const probe = createServer();
      probe.once('error', () => resolvePromise(false));
      probe.once('listening', () => probe.close(() => resolvePromise(true)));
      probe.listen(port, host);
    });
    if (isFree) return port;
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + 99}`);
}
