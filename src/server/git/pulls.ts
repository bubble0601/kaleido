import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  pullRange,
  pullRequestRef,
  type PullConversationItem,
  type PullDetail,
  type PullFetchResponse,
  type PullRequestMeta,
  type PullReviewThread,
  type PullState,
  type ReviewState,
} from '../../shared/types.js';

const execFileAsync = promisify(execFile);

const PR_JSON_FIELDS =
  'number,title,state,headRefName,baseRefName,baseRefOid,author,isDraft,url,updatedAt';

/** 本文・会話・行コメントをまとめて引く。件数は first:100 で打ち切る (それ以上は稀) */
const PR_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number title body state isDraft url createdAt updatedAt
      baseRefName baseRefOid headRefName headRefOid additions deletions changedFiles
      author { login }
      comments(first: 100) {
        nodes { id author { login } body createdAt url }
      }
      reviews(first: 100) {
        nodes { id author { login } body state createdAt url }
      }
      reviewThreads(first: 100) {
        nodes {
          id path line startLine originalLine originalStartLine diffSide isResolved isOutdated
          comments(first: 100) {
            nodes { id author { login } body createdAt url diffHunk }
          }
        }
      }
    }
  }
}`;

interface GhActor {
  login: string;
}

interface GhPullDetail {
  number: number;
  title: string;
  body: string;
  state: PullState;
  isDraft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  baseRefName: string;
  baseRefOid: string;
  headRefName: string;
  headRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: GhActor | null;
  comments: { nodes: { id: string; author: GhActor | null; body: string; createdAt: string; url: string }[] };
  reviews: {
    nodes: {
      id: string;
      author: GhActor | null;
      body: string;
      state: ReviewState;
      createdAt: string;
      url: string;
    }[];
  };
  reviewThreads: {
    nodes: {
      id: string;
      path: string;
      line: number | null;
      startLine: number | null;
      originalLine: number | null;
      originalStartLine: number | null;
      diffSide: 'LEFT' | 'RIGHT';
      isResolved: boolean;
      isOutdated: boolean;
      comments: {
        nodes: {
          id: string;
          author: GhActor | null;
          body: string;
          createdAt: string;
          url: string;
          diffHunk: string;
        }[];
      };
    }[];
  };
}

function toDetail(pr: GhPullDetail): PullDetail {
  const conversation: PullConversationItem[] = [
    ...pr.comments.nodes.map((c) => ({
      id: c.id,
      kind: 'comment' as const,
      author: c.author?.login ?? '',
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
    })),
    // 本文のない COMMENTED レビューは行コメントの入れ物でしかないので会話には出さない
    ...pr.reviews.nodes
      .filter((r) => r.body.trim().length > 0 || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')
      .map((r) => ({
        id: r.id,
        kind: 'review' as const,
        author: r.author?.login ?? '',
        body: r.body,
        createdAt: r.createdAt,
        url: r.url,
        reviewState: r.state,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const reviewThreads: PullReviewThread[] = pr.reviewThreads.nodes.map((t) => ({
    id: t.id,
    path: t.path,
    side: t.diffSide === 'LEFT' ? 'original' : 'modified',
    line: t.line,
    startLine: t.startLine,
    originalLine: t.originalLine,
    originalStartLine: t.originalStartLine,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    diffHunk: t.comments.nodes[0]?.diffHunk ?? '',
    comments: t.comments.nodes.map((c) => ({
      id: c.id,
      author: c.author?.login ?? '',
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
    })),
  }));

  return {
    number: pr.number,
    title: pr.title,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    baseRefOid: pr.baseRefOid,
    author: pr.author?.login ?? '',
    isDraft: pr.isDraft,
    url: pr.url,
    updatedAt: pr.updatedAt,
    body: pr.body,
    state: pr.state,
    createdAt: pr.createdAt,
    headRefOid: pr.headRefOid,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    conversation,
    reviewThreads,
  };
}

/** gh の --json 出力 (必要なフィールドのみ) */
interface GhPullRequest {
  number: number;
  title: string;
  state: PullState;
  headRefName: string;
  baseRefName: string;
  baseRefOid: string;
  author: { login: string } | null;
  isDraft: boolean;
  url: string;
  updatedAt: string;
}

function toMeta(pr: GhPullRequest): PullRequestMeta {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    baseRefOid: pr.baseRefOid,
    author: pr.author?.login ?? '',
    isDraft: pr.isDraft,
    url: pr.url,
    updatedAt: pr.updatedAt,
  };
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function stderrOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    return String(error.stderr).trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * 引数を PR 番号に解釈する。`123` / `#123` / `pull/123` / GitHub の PR URL を受け付ける。
 * 解釈できなければ null
 */
export function parsePullNumber(input: string): number | null {
  const match =
    /^#?(\d+)$/.exec(input) ??
    /^(?:pr|pull)\/(\d+)$/.exec(input) ??
    /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)(?:[/?#].*)?$/.exec(input);
  return match ? Number(match[1]) : null;
}

/**
 * GitHub の pull request を gh CLI 経由で扱う。
 * head は `refs/pull/<N>/head` を `origin/pr/<N>` に fetch し、base ブランチと merge-base 比較する。
 */
export class GitPulls {
  /** gh が未インストールなら以後は問い合わせない */
  private isGhMissing = false;

  constructor(private repoRoot: string) {}

  private async gh(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('gh', args, {
      cwd: this.repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
    });
    return stdout;
  }

  /**
   * open な PR (最大 30 件) と最近 merge された PR (最大 10 件)。
   * gh が使えない・GitHub リポジトリでない・オフラインなら空
   */
  async list(): Promise<PullRequestMeta[]> {
    if (this.isGhMissing) return [];
    try {
      const [open, merged] = await Promise.all([
        this.listByState('open', 30),
        this.listByState('merged', 10),
      ]);
      return [...open, ...merged];
    } catch (error) {
      if (isEnoent(error)) this.isGhMissing = true;
      return [];
    }
  }

  private async listByState(state: 'open' | 'merged', limit: number): Promise<PullRequestMeta[]> {
    const out = await this.gh([
      'pr',
      'list',
      '--state',
      state,
      '--limit',
      String(limit),
      '--json',
      PR_JSON_FIELDS,
    ]);
    const prs: GhPullRequest[] = JSON.parse(out);
    return prs.map(toMeta);
  }

  async view(number: number): Promise<PullRequestMeta> {
    try {
      const out = await this.gh(['pr', 'view', String(number), '--json', PR_JSON_FIELDS]);
      const pr: GhPullRequest = JSON.parse(out);
      return toMeta(pr);
    } catch (error) {
      if (isEnoent(error)) {
        throw new Error('GitHub CLI (gh) is required to open pull requests: https://cli.github.com/');
      }
      throw new Error(`Could not read PR #${number}: ${stderrOf(error)}`);
    }
  }

  private nameWithOwner: string | null = null;

  /** origin が指す GitHub リポジトリの owner/name (gh が解決する)。一度引いたら使い回す */
  private async getNameWithOwner(): Promise<{ owner: string; name: string }> {
    if (this.nameWithOwner === null) {
      const out = await this.gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
      this.nameWithOwner = out.trim();
    }
    const [owner, name] = this.nameWithOwner.split('/');
    if (!owner || !name) throw new Error(`Unexpected repository name: ${this.nameWithOwner}`);
    return { owner, name };
  }

  /** PR の本文・会話 (issue コメント / レビュー)・行コメントのスレッド */
  async detail(number: number): Promise<PullDetail> {
    try {
      const { owner, name } = await this.getNameWithOwner();
      const out = await this.gh([
        'api',
        'graphql',
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `number=${number}`,
        '-f',
        `query=${PR_DETAIL_QUERY}`,
      ]);
      const parsed: { data?: { repository?: { pullRequest?: GhPullDetail | null } } } = JSON.parse(out);
      const pr = parsed.data?.repository?.pullRequest;
      if (!pr) throw new Error('not found');
      return toDetail(pr);
    } catch (error) {
      if (isEnoent(error)) {
        throw new Error('GitHub CLI (gh) is required to read pull requests: https://cli.github.com/');
      }
      throw new Error(`Could not read PR #${number}: ${stderrOf(error)}`);
    }
  }

  /** PR の head と base ブランチを origin から取り直し、比較範囲を返す */
  async fetch(number: number): Promise<PullFetchResponse> {
    const pull = await this.view(number);
    try {
      await execFileAsync(
        'git',
        [
          'fetch',
          '--no-tags',
          'origin',
          `+refs/pull/${number}/head:refs/remotes/${pullRequestRef(number)}`,
          `+refs/heads/${pull.baseRefName}:refs/remotes/origin/${pull.baseRefName}`,
        ],
        {
          cwd: this.repoRoot,
          encoding: 'utf8',
          // 認証が必要なときは対話せずに失敗させる (サーバー内で固まらないように)
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        },
      );
    } catch (error) {
      throw new Error(`Could not fetch PR #${number} from origin: ${stderrOf(error)}`);
    }
    // merge 済みの base コミットは通常 base ブランチの履歴にあるが、
    // 無ければ (force push 後など) コミット単位で取りに行く
    if (pull.state !== 'OPEN' && !(await this.hasCommit(pull.baseRefOid))) {
      try {
        await execFileAsync('git', ['fetch', '--no-tags', 'origin', pull.baseRefOid], {
          cwd: this.repoRoot,
          encoding: 'utf8',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
      } catch (error) {
        throw new Error(
          `Could not fetch the base commit ${pull.baseRefOid.slice(0, 7)} of PR #${number}: ${stderrOf(error)}`,
        );
      }
    }
    return { range: pullRange(pull), pull };
  }

  private async hasCommit(sha: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: this.repoRoot });
      return true;
    } catch {
      return false;
    }
  }
}
