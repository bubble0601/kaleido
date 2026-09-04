/** commit-ish、または特殊キーワード working / staged / browse */
export type RefSpec = string;

export const SPECIAL_TARGETS = ['working', 'staged', '.', 'browse'] as const;

/**
 * 比較範囲。target が特殊キーワードの場合の意味:
 * - 'working': unstaged changes (index vs working tree)。base は無視される
 * - 'staged':  staged changes (base vs index)
 * - '.':       全 uncommitted changes (base vs working tree)
 * - 'browse':  比較なし。working tree のファイルをそのまま閲覧する (非 git ディレクトリの既定)
 */
export interface RangeSpec {
  target: RefSpec;
  base: RefSpec;
  baseMode?: 'direct' | 'merge-base';
}

/** 比較なしでファイルを閲覧するだけの擬似 range */
export const BROWSE_RANGE: RangeSpec = { target: 'browse', base: 'browse' };

export function isBrowseRange(range: RangeSpec | null): boolean {
  return range?.target === 'browse';
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
  /** 表示対象のルートディレクトリ (git リポジトリならその toplevel) */
  rootDir: string;
  /** ルートが git 管理下か。false なら比較機能は無効 */
  isGitRepo: boolean;
  repoId: string;
  initialRange: RangeSpec;
  version: string;
}

export interface FilesResponse {
  paths: string[];
  /** 件数上限で打ち切られた場合 true */
  isTruncated: boolean;
}

export interface DocFileMeta {
  path: string;
  /** 更新日時 (epoch ミリ秒)。更新日時順の並べ替えに使う */
  mtime: number;
}

export interface DocsResponse {
  files: DocFileMeta[];
  isTruncated: boolean;
}

export interface PullRequestMeta {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  author: string;
  isDraft: boolean;
  url: string;
  updatedAt: string;
}

export interface RangesResponse {
  branches: string[];
  recentCommits: { sha: string; shortSha: string; subject: string; date: string }[];
  defaultBranch: string | null;
  /** open な PR (gh が使えない・GitHub でないリポジトリでは空) */
  pullRequests: PullRequestMeta[];
  /** origin の GitHub リポジトリ URL (例: https://github.com/owner/repo)。GitHub でなければ null */
  githubRepoUrl: string | null;
}

/** PR を fetch した結果。range は origin/pr/<N> を base ブランチと merge-base 比較するもの */
export interface PullFetchResponse {
  range: RangeSpec;
  pull: PullRequestMeta;
}

export type PullState = 'OPEN' | 'CLOSED' | 'MERGED';

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';

/** PR の Conversation に並ぶもの: issue コメント、またはレビュー (approve など) の本文 */
export interface PullConversationItem {
  id: string;
  kind: 'comment' | 'review';
  author: string;
  /** Markdown */
  body: string;
  createdAt: string;
  url: string;
  reviewState?: ReviewState;
}

export interface PullReviewComment {
  id: string;
  author: string;
  /** Markdown */
  body: string;
  createdAt: string;
  url: string;
}

/** 行に付いたレビューコメントのスレッド */
export interface PullReviewThread {
  id: string;
  path: string;
  /** GitHub の LEFT (base 側) → original、RIGHT (head 側) → modified */
  side: CommentSide;
  /** 現在の head での行番号。コードが変わって追えなくなった (outdated) スレッドでは null */
  line: number | null;
  startLine: number | null;
  /** コメントした時点の行番号 (outdated のときの表示位置に使う) */
  originalLine: number | null;
  originalStartLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  /** コメント対象の diff の抜粋 (outdated のときに元のコードを見せる) */
  diffHunk: string;
  comments: PullReviewComment[];
}

export interface PullDetail extends PullRequestMeta {
  /** Markdown */
  body: string;
  state: PullState;
  createdAt: string;
  headRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  /** 作成日時順 */
  conversation: PullConversationItem[];
  reviewThreads: PullReviewThread[];
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

/**
 * PR の head を fetch するローカル ref (`refs/remotes/origin/pr/<N>` の短縮形)。
 * `+refs/pull/*\/head:refs/remotes/origin/pr/*` という広く使われる慣例に合わせている
 */
export function pullRequestRef(number: number): string {
  return `origin/pr/${number}`;
}

/** ref が PR の head ref なら PR 番号、そうでなければ null */
export function pullNumberOfRef(ref: string): number | null {
  const match = /^origin\/pr\/(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/** PR のページ URL と github.dev で開く URL (github.com 以外の GHE には github.dev が無いので null) */
export function pullRequestLinks(repoUrl: string, number: number): { html: string; dev: string | null } {
  const url = new URL(repoUrl);
  return {
    html: `${repoUrl}/pull/${number}`,
    dev: url.hostname === 'github.com' ? `https://github.dev${url.pathname}/pull/${number}` : null,
  };
}

/** PR の比較範囲: base ブランチとの merge-base から PR head まで */
export function pullRange(pull: Pick<PullRequestMeta, 'number' | 'baseRefName'>): RangeSpec {
  return {
    target: pullRequestRef(pull.number),
    base: `origin/${pull.baseRefName}`,
    baseMode: 'merge-base',
  };
}

export function rangeKey(range: RangeSpec): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const mode = range.baseMode === 'merge-base' ? '~mb' : '';
  return `${sanitize(range.base)}${mode}__${sanitize(range.target)}`;
}

export function describeRange(range: RangeSpec): string {
  if (range.target === 'browse') return 'files';
  if (range.target === 'working') return 'unstaged changes';
  if (range.target === 'staged') return `${range.base}..staged`;
  if (range.target === '.') return `${range.base}..working tree`;
  const pullNumber = pullNumberOfRef(range.target);
  if (pullNumber !== null) return `PR #${pullNumber} (${range.base}...${range.target})`;
  const sep = range.baseMode === 'merge-base' ? '...' : '..';
  return `${range.base}${sep}${range.target}`;
}
