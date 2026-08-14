import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import envPaths from 'env-paths';
import { nanoid } from 'nanoid';

import type { Comment, CommentCreateRequest, ViewedState } from '../../shared/types.js';

export function computeRepoId(repoRoot: string): string {
  return createHash('sha256').update(realpathSync(repoRoot)).digest('hex').slice(0, 16);
}

/** repoRoot から repoId を導出して ReviewStore を開く (CLI サブコマンド用) */
export function openReviewStore(repoRoot: string): ReviewStore {
  const realRoot = realpathSync(repoRoot);
  return new ReviewStore(computeRepoId(realRoot), realRoot);
}

const STORE_VERSION = 1;

interface ViewedFile {
  version: number;
  entries: ViewedState['entries'];
}

interface CommentsFile {
  version: number;
  comments: Comment[];
}

/**
 * コメントとレビュー済みマークの永続化。
 * <dataDir>/reviews/<repoId>/
 *   ├── meta.json               # { repoRoot } (可読性のため)
 *   ├── viewed.json             # repo 単位・range 横断 (contentHash キー)
 *   └── comments/<rangeKey>.json
 */
export class ReviewStore {
  private baseDir: string;

  constructor(repoId: string, repoRoot: string) {
    this.baseDir = join(envPaths('kaleido', { suffix: '' }).data, 'reviews', repoId);
    mkdirSync(join(this.baseDir, 'comments'), { recursive: true });
    this.writeAtomic(join(this.baseDir, 'meta.json'), { repoRoot });
  }

  private readJson<T>(path: string): T | null {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private writeAtomic(path: string, data: unknown): void {
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, path);
  }

  // --- viewed ---

  private get viewedPath(): string {
    return join(this.baseDir, 'viewed.json');
  }

  getViewed(): ViewedState {
    const data = this.readJson<ViewedFile>(this.viewedPath);
    if (!data || data.version !== STORE_VERSION) return { entries: {} };
    return { entries: data.entries };
  }

  setViewed(path: string, hash: string, isViewed: boolean): void {
    const state = this.getViewed();
    if (isViewed) {
      state.entries[path] = { hash, viewedAt: new Date().toISOString() };
    } else {
      delete state.entries[path];
    }
    this.writeAtomic(this.viewedPath, { version: STORE_VERSION, entries: state.entries });
  }

  // --- comments ---

  private commentsPath(rangeKey: string): string {
    const safe = rangeKey.replace(/[^a-zA-Z0-9_.~-]/g, '_');
    return join(this.baseDir, 'comments', `${safe}.json`);
  }

  getComments(rangeKey: string): Comment[] {
    const data = this.readJson<CommentsFile>(this.commentsPath(rangeKey));
    if (!data || data.version !== STORE_VERSION) return [];
    return data.comments;
  }

  private saveComments(rangeKey: string, comments: Comment[]): void {
    this.writeAtomic(this.commentsPath(rangeKey), { version: STORE_VERSION, comments });
  }

  addComment(rangeKey: string, req: CommentCreateRequest): Comment {
    const now = new Date().toISOString();
    const comment: Comment = { id: nanoid(10), ...req, createdAt: now, updatedAt: now };
    const comments = this.getComments(rangeKey);
    comments.push(comment);
    this.saveComments(rangeKey, comments);
    return comment;
  }

  updateComment(rangeKey: string, id: string, body: string): Comment | null {
    const comments = this.getComments(rangeKey);
    const target = comments.find((c) => c.id === id);
    if (!target) return null;
    target.body = body;
    target.updatedAt = new Date().toISOString();
    this.saveComments(rangeKey, comments);
    return target;
  }

  /** 範囲のコメントを全削除し、削除したものを返す (クライアント側 Undo 用) */
  clearComments(rangeKey: string): Comment[] {
    const comments = this.getComments(rangeKey);
    this.saveComments(rangeKey, []);
    return comments;
  }

  /** クリアの Undo 用。id 重複は既存を優先して復元する */
  restoreComments(rangeKey: string, comments: Comment[]): void {
    const existing = this.getComments(rangeKey);
    const existingIds = new Set(existing.map((c) => c.id));
    const restored = [...existing, ...comments.filter((c) => !existingIds.has(c.id))];
    this.saveComments(rangeKey, restored);
  }

  deleteComment(rangeKey: string, id: string): boolean {
    const comments = this.getComments(rangeKey);
    const next = comments.filter((c) => c.id !== id);
    if (next.length === comments.length) return false;
    this.saveComments(rangeKey, next);
    return true;
  }
}
