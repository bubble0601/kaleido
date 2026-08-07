import { simpleGit, type SimpleGit } from 'simple-git';

import type { RangesResponse } from '../../shared/types.js';

export class GitRefs {
  private git: SimpleGit;

  constructor(repoRoot: string) {
    this.git = simpleGit(repoRoot);
  }

  async getRanges(): Promise<RangesResponse> {
    const [branches, log, defaultBranch] = await Promise.all([
      this.getBranches(),
      this.getRecentCommits(),
      this.getDefaultBranch(),
    ]);
    return { branches, recentCommits: log, defaultBranch };
  }

  private async getBranches(): Promise<string[]> {
    const summary = await this.git.branch(['--sort=-committerdate']);
    return summary.all.filter((b) => !b.startsWith('remotes/') || b.startsWith('remotes/origin/'));
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
