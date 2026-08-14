import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import { rangeKey, type MetaResponse, type RangeSpec } from '../shared/types.js';
import type { AppContext } from './context.js';

const VERSION = '0.1.0';

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

  app.get('/api/meta', (c) => {
    const meta: MetaResponse = {
      repoRoot: ctx.repoRoot,
      repoId: ctx.repoId,
      initialRange: ctx.initialRange,
      version: VERSION,
    };
    return c.json(meta);
  });

  app.get('/api/ranges', async (c) => {
    return c.json(await ctx.gitRefs.getRanges());
  });

  app.get('/api/files', async (c) => {
    return c.json({ paths: await ctx.gitDiff.listRepoFiles() });
  });

  app.get('/api/diff', zValidator('query', rangeSchema), async (c) => {
    const range = toRange(c.req.valid('query'));
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
      return c.json(await runEslintForFiles(ctx.repoRoot, paths));
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
      const resolvedBase = await ctx.gitDiff.resolveBase(range);
      const contents = await ctx.gitContent.getFileContents({
        range,
        resolvedBase,
        path: q.path,
        oldPath: q.oldPath,
        status: q.status,
      });
      return c.json(contents);
    },
  );

  app.post(
    '/api/file/save',
    zValidator('json', z.object({ path: z.string().min(1), content: z.string() })),
    async (c) => {
      const { path, content } = c.req.valid('json');
      await ctx.gitContent.writeWorkingFile(path, content);
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
