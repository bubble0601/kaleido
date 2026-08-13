import { execSync } from 'node:child_process';

import type { RangeSpec } from '../shared/types.js';

export function getGitRoot(cwd: string): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('Not a git repository (or any of the parent directories)');
  }
}

/**
 * 位置引数を RangeSpec に解決する。
 * - working         → unstaged changes
 * - staged [base]   → base(既定 HEAD) vs index
 * - <commit>        → <commit>^ vs <commit> (そのコミットの diff)
 * - <target> <base> → base vs target
 */
export function resolveRange(target: string, base: string | undefined): RangeSpec {
  if (target === 'working') {
    return { target: 'working', base: 'HEAD' };
  }
  if (target === 'staged' || target === '.') {
    return { target, base: base ?? 'HEAD' };
  }
  if (base) {
    return { target, base };
  }
  return { target, base: `${target}^` };
}

/**
 * 引数なしのときの範囲をリポジトリの状態から決める。
 * 1. staged 変更あり                   → HEAD vs index (staged)
 * 2. working 変更あり (untracked 含む) → HEAD vs working tree (全 uncommitted)
 * 3. どちらもなし                      → HEAD^ vs HEAD (直近コミット)
 */
export function resolveDefaultRange(repoRoot: string): RangeSpec {
  const succeeds = (command: string): boolean => {
    try {
      execSync(command, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  };

  // --quiet は差分ありのとき exit 1
  if (!succeeds('git diff --cached --quiet')) {
    return { target: 'staged', base: 'HEAD' };
  }

  const hasUnstaged = !succeeds('git diff --quiet');
  const hasUntracked =
    execSync('git ls-files --others --exclude-standard', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().length > 0;
  if (hasUnstaged || hasUntracked) {
    return { target: '.', base: 'HEAD' };
  }

  // 直近コミット (initial commit しかない場合は空の uncommitted 表示へフォールバック)
  if (succeeds('git rev-parse --verify HEAD^')) {
    return { target: 'HEAD', base: 'HEAD^' };
  }
  return { target: '.', base: 'HEAD' };
}
