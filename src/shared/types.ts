/** commit-ish、または特殊キーワード working / staged */
export type RefSpec = string;

export const SPECIAL_TARGETS = ['working', 'staged', '.'] as const;

/**
 * 比較範囲。target が特殊キーワードの場合の意味:
 * - 'working': unstaged changes (index vs working tree)。base は無視される
 * - 'staged':  staged changes (base vs index)
 * - '.':       全 uncommitted changes (base vs working tree)
 */
export interface RangeSpec {
  target: RefSpec;
  base: RefSpec;
  baseMode?: 'direct' | 'merge-base';
}

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface DiffFileMeta {
  path: string;
  oldPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  /** unified diff 本文の sha256。viewed 引き継ぎのキー */
  contentHash: string;
}

export interface DiffResponse {
  files: DiffFileMeta[];
  /** 表示用ラベル (例: "abc1234 vs Working Directory") */
  label: string;
  resolvedBase: string;
  resolvedTarget: string;
}

export interface FileSide {
  content: string;
  /** 'working' | 'staged' | commit sha */
  ref: string;
}

export interface FileContentResponse {
  original: FileSide | null;
  modified: FileSide | null;
  isTooLarge: boolean;
}

export interface MetaResponse {
  repoRoot: string;
  repoId: string;
  initialRange: RangeSpec;
  version: string;
}

export interface RangesResponse {
  branches: string[];
  recentCommits: { sha: string; shortSha: string; subject: string; date: string }[];
  defaultBranch: string | null;
}

export interface HoverRequest {
  path: string;
  /** 1-based */
  line: number;
  /** 1-based */
  column: number;
  /** staged/commit 比較時に表示中の全文を overlay するために添付 */
  content?: string;
}

export interface HoverResponse {
  /** markdown 文字列の配列 */
  contents: string[];
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface DefinitionLocation {
  /** repo 相対パス */
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface Diagnostic {
  source: 'ts' | 'eslint';
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface LintResponse {
  /** eslint バイナリが見つからなかった場合 false (UI は静かに無効化) */
  available: boolean;
  results: Record<string, Diagnostic[]>;
}

export type CommentSide = 'original' | 'modified';

export interface Comment {
  id: string;
  path: string;
  side: CommentSide;
  /** 省略時はファイル全体へのコメント */
  startLine?: number;
  endLine?: number;
  body: string;
  /** 作成時点の対象行テキスト (範囲切替後の参照用) */
  codeSnapshot?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentCreateRequest {
  path: string;
  side: CommentSide;
  startLine?: number;
  endLine?: number;
  body: string;
  codeSnapshot?: string;
}

export function isFileLevelComment(comment: { startLine?: number }): boolean {
  return comment.startLine === undefined;
}

export interface ViewedState {
  /** path → viewed とマークした時点の contentHash */
  entries: Record<string, { hash: string; viewedAt: string }>;
}

export type ServerEvent = { type: 'files-changed' } | { type: 'connected' };

export function rangeKey(range: RangeSpec): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const mode = range.baseMode === 'merge-base' ? '~mb' : '';
  return `${sanitize(range.base)}${mode}__${sanitize(range.target)}`;
}

export function describeRange(range: RangeSpec): string {
  if (range.target === 'working') return 'unstaged changes';
  if (range.target === 'staged') return `${range.base}..staged`;
  if (range.target === '.') return `${range.base}..working tree`;
  const sep = range.baseMode === 'merge-base' ? '...' : '..';
  return `${range.base}${sep}${range.target}`;
}
