import { execFileSync, execSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { BROWSE_RANGE, type RangeSpec } from '../shared/types.js';

/** git の toplevel を返す。git 管理下でなければ null */
export function findGitRoot(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function isCommitish(gitRoot: string, ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd: gitRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface ViewerTarget {
  /** 表示対象のルートディレクトリ */
  rootDir: string;
  /** rootDir が git の toplevel か。false なら比較機能は無効 */
  isGitRepo: boolean;
  range: RangeSpec;
}

/**
 * 位置引数・オプションから「どこを・どの範囲で開くか」を決める。
 *
 * - `--dir` か、ディレクトリとして存在する位置引数 → そのディレクトリを root にする。
 *   git の toplevel と一致すれば diff 機能あり、一致しなければ閲覧のみ (browse)
 * - それ以外 → cwd の git toplevel を root にし、位置引数を commit-ish として解釈する
 * - git 管理下でなければ引数なしで browse
 *
 * commit-ish とディレクトリ名が衝突する場合は commit-ish を優先する
 * (`working` / `staged` / `.` は常に特殊キーワード)。
 */
export function resolveViewerTarget(params: {
  cwd: string;
  dir?: string;
  target?: string;
  base?: string;
}): ViewerTarget {
  const { cwd, target, base } = params;

  if (params.dir !== undefined) {
    const dir = resolve(cwd, params.dir);
    if (!isDirectory(dir)) throw new Error(`Not a directory: ${params.dir}`);
    return forExplicitRoot(dir, target, base);
  }

  const gitRoot = findGitRoot(cwd);

  // 位置引数が commit-ish として解決できず、ディレクトリとして存在するならディレクトリ指定とみなす
  if (
    target !== undefined &&
    target !== 'working' &&
    target !== 'staged' &&
    target !== '.' &&
    !(gitRoot !== null && isCommitish(gitRoot, target)) &&
    isDirectory(resolve(cwd, target))
  ) {
    if (base !== undefined) {
      throw new Error('A base cannot be given when opening a directory');
    }
    return forExplicitRoot(resolve(cwd, target), undefined, undefined);
  }

  if (gitRoot === null) {
    if (target !== undefined) {
      throw new Error(
        `Not a git repository, and no such directory: ${target}\n` +
          'Run kaleido without arguments to browse the current directory.',
      );
    }
    return { rootDir: cwd, isGitRepo: false, range: BROWSE_RANGE };
  }

  return {
    rootDir: gitRoot,
    isGitRepo: true,
    range: target ? resolveRange(target, base) : resolveDefaultRange(gitRoot),
  };
}

/**
 * 明示指定されたディレクトリを root として解決する。
 * git の toplevel と一致するときだけ diff 機能を有効にする
 * (リポジトリのサブディレクトリを指定した場合は閲覧のみ)。
 */
function forExplicitRoot(
  dir: string,
  target: string | undefined,
  base: string | undefined,
): ViewerTarget {
  const gitRoot = findGitRoot(dir);
  if (gitRoot === null || realpathSync(gitRoot) !== realpathSync(dir)) {
    if (target !== undefined) {
      throw new Error(`${dir} is not a git repository root; ranges are unavailable`);
    }
    return { rootDir: dir, isGitRepo: false, range: BROWSE_RANGE };
  }
  return {
    rootDir: gitRoot,
    isGitRepo: true,
    range: target ? resolveRange(target, base) : resolveDefaultRange(gitRoot),
  };
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
export function resolveDefaultRange(rootDir: string): RangeSpec {
  const succeeds = (command: string): boolean => {
    try {
      execSync(command, { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
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
      cwd: rootDir,
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
