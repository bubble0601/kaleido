import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  pullRange,
  pullRequestRef,
  type PullFetchResponse,
  type PullRequestMeta,
} from '../../shared/types.js';

const execFileAsync = promisify(execFile);

const PR_JSON_FIELDS = 'number,title,headRefName,baseRefName,author,isDraft,url,updatedAt';

/** gh の --json 出力 (必要なフィールドのみ) */
interface GhPullRequest {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string } | null;
  isDraft: boolean;
  url: string;
  updatedAt: string;
}

function toMeta(pr: GhPullRequest): PullRequestMeta {
  return {
    number: pr.number,
    title: pr.title,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
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

  /** open な PR 一覧。gh が使えない・GitHub リポジトリでない・オフラインなら空 */
  async list(): Promise<PullRequestMeta[]> {
    if (this.isGhMissing) return [];
    try {
      const out = await this.gh(['pr', 'list', '--state', 'open', '--limit', '30', '--json', PR_JSON_FIELDS]);
      const prs: GhPullRequest[] = JSON.parse(out);
      return prs.map(toMeta);
    } catch (error) {
      if (isEnoent(error)) this.isGhMissing = true;
      return [];
    }
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
    return { range: pullRange(pull), pull };
  }
}
