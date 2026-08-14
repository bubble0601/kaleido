import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import {
  rangeKey,
  type DiffResponse,
  type MetaResponse,
  type RangesResponse,
  type RangeSpec,
} from '../shared/types.js';
import type { AppContext } from './context.js';
import { applyExcludes, listDirectoryFiles, listDocumentFiles } from './files/tree.js';

const VERSION = '0.1.0';

const MAX_RAW_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

/** /api/raw で配信を許可する拡張子と Content-Type (画像のみ) */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

/** /preview で配信する Content-Type。不明な拡張子は octet-stream にして実行させない */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ...IMAGE_CONTENT_TYPES,
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function extensionOf(path: string): string {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index).toLowerCase();
}

const rangeSchema = z.object({
  target: z.string().min(1),
  base: z.string().min(1),
  baseMode: z.enum(['direct', 'merge-base']).optional(),
});

function toRange(query: z.infer<typeof rangeSchema>): RangeSpec {
  return { target: query.target, base: query.base, baseMode: query.baseMode };
}

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  });

  /*
   * /preview で配信したページはスクリプトを実行できるので、そこから API を
   * 叩かれないようにする。sandbox の iframe は opaque origin なので
   * Origin: null が付き、ビューア本体 (同一オリジン) とは区別できる。
   */
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('Origin');
    if (origin !== undefined && origin !== new URL(c.req.url).origin) {
      return c.json({ error: 'Cross-origin request is not allowed' }, 403);
    }
    await next();
  });

  /*
   * HTML プレビュー用に、ルート配下のファイルをそのまま配信する。
   * 相対パスの CSS / JS / 画像をページ自身が読めるようにするための経路で、
   * iframe 側は sandbox (allow-same-origin なし) で読み込む。
   */
  app.get('/preview/*', async (c) => {
    const path = decodeURIComponent(c.req.path.slice('/preview/'.length));
    if (path.length === 0) return c.json({ error: 'File not found' }, 404);
    let buf: Buffer;
    try {
      buf = await ctx.fileContent.readBlob('working', path);
    } catch {
      return c.json({ error: 'File not found' }, 404);
    }
    if (buf.length > MAX_PREVIEW_BYTES) return c.json({ error: 'File too large' }, 413);
    return c.body(new Uint8Array(buf), 200, {
      'Content-Type': PREVIEW_CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      // opaque origin のページが自分のファイルを fetch できるようにする
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
  });

  app.get('/api/meta', (c) => {
    const meta: MetaResponse = {
      rootDir: ctx.rootDir,
      isGitRepo: ctx.isGitRepo,
      repoId: ctx.repoId,
      initialRange: ctx.initialRange,
      version: VERSION,
    };
    return c.json(meta);
  });

  app.get('/api/ranges', async (c) => {
    if (!ctx.gitRefs) {
      const empty: RangesResponse = { branches: [], recentCommits: [], defaultBranch: null };
      return c.json(empty);
    }
    return c.json(await ctx.gitRefs.getRanges());
  });

  // ルート配下の全ファイル (Files タブ / Quick Open)。
  // git 管理下なら ls-files (gitignore 済み)、それ以外はディレクトリ走査。
  app.get('/api/files', async (c) => {
    if (ctx.gitDiff) {
      return c.json(applyExcludes(await ctx.gitDiff.listRepoFiles(), ctx.config));
    }
    return c.json(await listDirectoryFiles(ctx.rootDir, ctx.config));
  });

  // Docs タブ用。git の管理状態を見ずに走査するので gitignore されたものも含む
  app.get('/api/docs', async (c) => {
    return c.json(await listDocumentFiles(ctx.rootDir, ctx.config));
  });

  app.get('/api/diff', zValidator('query', rangeSchema), async (c) => {
    const range = toRange(c.req.valid('query'));
    if (!ctx.gitDiff || range.target === 'browse') {
      const empty: DiffResponse = {
        files: [],
        label: 'Files',
        resolvedBase: 'browse',
        resolvedTarget: 'working',
      };
      return c.json(empty);
    }
    const diff = await ctx.gitDiff.getDiff(range);
    ctx.tsService.warmup(diff.files.map((f) => f.path));
    return c.json(diff);
  });

  app.post(
    '/api/lang/hover',
    zValidator(
      'json',
      z.object({
        path: z.string().min(1),
        line: z.number().int().min(1),
        column: z.number().int().min(1),
        content: z.string().optional(),
      }),
    ),
    async (c) => {
      return c.json(await ctx.tsService.hover(c.req.valid('json')));
    },
  );

  app.post(
    '/api/lang/definition',
    zValidator(
      'json',
      z.object({
        path: z.string().min(1),
        line: z.number().int().min(1),
        column: z.number().int().min(1),
        content: z.string().optional(),
      }),
    ),
    async (c) => {
      return c.json(await ctx.tsService.definition(c.req.valid('json')));
    },
  );

  app.post(
    '/api/lang/references',
    zValidator(
      'json',
      z.object({
        path: z.string().min(1),
        line: z.number().int().min(1),
        column: z.number().int().min(1),
        content: z.string().optional(),
      }),
    ),
    async (c) => {
      return c.json(await ctx.tsService.references(c.req.valid('json')));
    },
  );

  app.post(
    '/api/lint',
    zValidator('json', z.object({ paths: z.array(z.string().min(1)).max(500) })),
    async (c) => {
      const { paths } = c.req.valid('json');
      const { runEslintForFiles } = await import('./eslint.js');
      return c.json(await runEslintForFiles(ctx.rootDir, paths));
    },
  );

  app.post(
    '/api/lang/diagnostics',
    zValidator(
      'json',
      z.object({
        path: z.string().min(1),
        content: z.string().optional(),
      }),
    ),
    async (c) => {
      return c.json(await ctx.tsService.diagnostics(c.req.valid('json')));
    },
  );

  app.get(
    '/api/file',
    zValidator(
      'query',
      rangeSchema.extend({
        path: z.string().min(1),
        oldPath: z.string().optional(),
        status: z.string().default('modified'),
      }),
    ),
    async (c) => {
      const q = c.req.valid('query');
      const range = toRange(q);
      const resolvedBase =
        ctx.gitDiff && range.target !== 'browse' ? await ctx.gitDiff.resolveBase(range) : range.base;
      const contents = await ctx.fileContent.getFileContents({
        range,
        resolvedBase,
        path: q.path,
        oldPath: q.oldPath,
        status: q.status,
      });
      return c.json(contents);
    },
  );

  // Markdown プレビューから参照される画像。
  // HTML など実行され得る型は返さない (同一オリジンで配信するため)
  app.get(
    '/api/raw',
    zValidator('query', z.object({ path: z.string().min(1) })),
    async (c) => {
      const { path } = c.req.valid('query');
      const contentType = IMAGE_CONTENT_TYPES[extensionOf(path)];
      if (!contentType) return c.json({ error: 'Unsupported file type' }, 415);
      let buf: Buffer;
      try {
        buf = await ctx.fileContent.readBlob('working', path);
      } catch {
        return c.json({ error: 'File not found' }, 404);
      }
      if (buf.length > MAX_RAW_BYTES) return c.json({ error: 'File too large' }, 413);
      return c.body(new Uint8Array(buf), 200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'no-cache',
      });
    },
  );

  app.post(
    '/api/file/save',
    zValidator('json', z.object({ path: z.string().min(1), content: z.string() })),
    async (c) => {
      const { path, content } = c.req.valid('json');
      await ctx.fileContent.writeWorkingFile(path, content);
      return c.json({ ok: true });
    },
  );

  const commentBodySchema = z
    .object({
      path: z.string().min(1),
      side: z.enum(['original', 'modified']),
      // startLine/endLine 省略時はファイル全体へのコメント
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      body: z.string().min(1),
      codeSnapshot: z.string().optional(),
    })
    .refine((v) => (v.startLine === undefined) === (v.endLine === undefined), {
      message: 'startLine and endLine must be provided together',
    });

  app.get('/api/comments', zValidator('query', rangeSchema), (c) => {
    return c.json(ctx.reviewStore.getComments(rangeKey(toRange(c.req.valid('query')))));
  });

  app.post(
    '/api/comments',
    zValidator('query', rangeSchema),
    zValidator('json', commentBodySchema),
    (c) => {
      const key = rangeKey(toRange(c.req.valid('query')));
      return c.json(ctx.reviewStore.addComment(key, c.req.valid('json')));
    },
  );

  app.patch(
    '/api/comments/:id',
    zValidator('query', rangeSchema),
    zValidator('json', z.object({ body: z.string().min(1) })),
    (c) => {
      const key = rangeKey(toRange(c.req.valid('query')));
      const updated = ctx.reviewStore.updateComment(key, c.req.param('id'), c.req.valid('json').body);
      if (!updated) return c.json({ error: 'Comment not found' }, 404);
      return c.json(updated);
    },
  );

  // 全クリア (削除したコメントを返す。クライアント側で Undo に使う)
  app.delete('/api/comments', zValidator('query', rangeSchema), (c) => {
    const key = rangeKey(toRange(c.req.valid('query')));
    return c.json({ comments: ctx.reviewStore.clearComments(key) });
  });

  const storedCommentSchema = commentBodySchema.safeExtend({
    id: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  });

  app.post(
    '/api/comments/restore',
    zValidator('query', rangeSchema),
    zValidator('json', z.object({ comments: z.array(storedCommentSchema).max(1000) })),
    (c) => {
      const key = rangeKey(toRange(c.req.valid('query')));
      ctx.reviewStore.restoreComments(key, c.req.valid('json').comments);
      return c.json({ ok: true });
    },
  );

  app.delete('/api/comments/:id', zValidator('query', rangeSchema), (c) => {
    const key = rangeKey(toRange(c.req.valid('query')));
    const isDeleted = ctx.reviewStore.deleteComment(key, c.req.param('id'));
    if (!isDeleted) return c.json({ error: 'Comment not found' }, 404);
    return c.json({ ok: true });
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      let isAborted = false;
      const client = {
        write: (event: string, data: string) => stream.writeSSE({ event, data }),
      };
      ctx.eventBus.register(client);
      stream.onAbort(() => {
        isAborted = true;
        ctx.eventBus.unregister(client);
      });
      await stream.writeSSE({ event: 'connected', data: '{}' });
      while (!isAborted) {
        await stream.sleep(15_000);
        if (isAborted) break;
        await stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => {
          isAborted = true;
        });
      }
    }),
  );

  app.get('/api/viewed', (c) => c.json(ctx.reviewStore.getViewed()));

  app.put(
    '/api/viewed',
    zValidator(
      'json',
      z.object({ path: z.string().min(1), hash: z.string().min(1), viewed: z.boolean() }),
    ),
    (c) => {
      const { path, hash, viewed } = c.req.valid('json');
      ctx.reviewStore.setViewed(path, hash, viewed);
      return c.json({ ok: true });
    },
  );

  return app;
}
