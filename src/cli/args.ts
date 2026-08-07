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
 * - なし            → HEAD vs working tree (全 uncommitted)
 * - working         → unstaged changes
 * - staged [base]   → base(既定 HEAD) vs index
 * - <commit>        → <commit>^ vs <commit> (そのコミットの diff)
 * - <target> <base> → base vs target
 */
export function resolveRange(target: string | undefined, base: string | undefined): RangeSpec {
  if (!target) {
    return { target: '.', base: 'HEAD' };
  }
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
