import { simpleGit, type SimpleGit } from 'simple-git';

import type { RangesResponse } from '../../shared/types.js';
import type { GitPulls } from './pulls.js';

export class GitRefs {
  private git: SimpleGit;

  constructor(
    repoRoot: string,
    private pulls: GitPulls,
  ) {
    this.git = simpleGit(repoRoot);
  }

  async getRanges(): Promise<RangesResponse> {
    const [branches, log, defaultBranch, pullRequests, githubRepoUrl] = await Promise.all([
      this.getBranches(),
      this.getRecentCommits(),
      this.getDefaultBranch(),
      this.pulls.list(),
      this.getGithubRepoUrl(),
    ]);
    return { branches, recentCommits: log, defaultBranch, pullRequests, githubRepoUrl };
  }

  private async getGithubRepoUrl(): Promise<string | null> {
    try {
      const out = await this.git.raw(['remote', 'get-url', 'origin']);
      return parseGithubRepoUrl(out.trim());
    } catch {
      return null;
    }
  }

  private async getBranches(): Promise<string[]> {
    const summary = await this.git.branch(['--sort=-committerdate']);
    // fetch 済みの PR head (origin/pr/N) は Pull requests として別に出すのでブランチ一覧からは外す
    return summary.all.filter(
      (b) =>
        (!b.startsWith('remotes/') || b.startsWith('remotes/origin/')) &&
        !b.startsWith('remotes/origin/pr/'),
    );
  }

  private async getRecentCommits(): Promise<RangesResponse['recentCommits']> {
    const log = await this.git.log({ maxCount: 50 });
    return log.all.map((c) => ({
      sha: c.hash,
      shortSha: c.hash.slice(0, 7),
      subject: c.message,
      date: c.date,
    }));
  }

  private async getDefaultBranch(): Promise<string | null> {
    try {
      const out = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      return out.trim().replace('refs/remotes/', '');
    } catch {
      for (const name of ['main', 'master']) {
        try {
          await this.git.revparse(['--verify', `refs/heads/${name}`]);
          return name;
        } catch {
          // try next
        }
      }
      return null;
    }
  }
}

/**
 * git リモート URL を GitHub のリポジトリページ URL にする。
 * https://github.com/o/r.git, git@github.com:o/r.git, ssh://git@github.com/o/r.git に対応。
 * ホストが github.com / *.ghe.com / github.* でなければ GitHub ではないとみなして null
 */
export function parseGithubRepoUrl(remote: string): string | null {
  const match =
    /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^:/]+)(?::\d+)?[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remote);
  if (!match) return null;
  const [, host, owner, repo] = match;
  if (!host || !owner || !repo) return null;
  const isGithubHost = host === 'github.com' || host.endsWith('.ghe.com') || host.startsWith('github.');
  return isGithubHost ? `https://${host}/${owner}/${repo}` : null;
}
