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
    const [branches, log, defaultBranch, pullRequests] = await Promise.all([
      this.getBranches(),
      this.getRecentCommits(),
      this.getDefaultBranch(),
      this.pulls.list(),
    ]);
    return { branches, recentCommits: log, defaultBranch, pullRequests };
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
