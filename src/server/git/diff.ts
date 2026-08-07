import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { simpleGit, type SimpleGit } from 'simple-git';

import type { DiffFileMeta, DiffResponse, FileStatus, RangeSpec } from '../../shared/types.js';

const MAX_UNTRACKED_FILE_BYTES = 2 * 1024 * 1024;

export class GitDiff {
  private git: SimpleGit;

  constructor(private repoRoot: string) {
    this.git = simpleGit(repoRoot);
  }

  async resolveBase(range: RangeSpec): Promise<string> {
    if (range.baseMode !== 'merge-base') return range.base;
    const target = range.target === 'working' || range.target === 'staged' || range.target === '.'
      ? 'HEAD'
      : range.target;
    const out = await this.git.raw(['merge-base', target, range.base]);
    return out.trim();
  }

  async getDiff(range: RangeSpec): Promise<DiffResponse> {
    const base = await this.resolveBase(range);
    let diffArgs: string[];
    let label: string;
    let resolvedBase = base;
    let resolvedTarget = range.target;

    if (range.target === 'working') {
      diffArgs = [];
      label = 'Working Directory (unstaged changes)';
      resolvedBase = 'staged';
    } else if (range.target === 'staged') {
      const baseHash = shortHash(await this.git.revparse([base]));
      diffArgs = ['--cached', base];
      label = `${baseHash} vs Staging Area`;
      resolvedBase = baseHash;
    } else if (range.target === '.') {
      const baseHash = shortHash(await this.git.revparse([base]));
      diffArgs = [base];
      label = `${baseHash} vs Working Directory`;
      resolvedBase = baseHash;
      resolvedTarget = 'working';
    } else {
      const targetHash = shortHash(await this.git.revparse([range.target]));
      const baseHash = shortHash(await this.git.revparse([base]));
      diffArgs = [baseHash, targetHash];
      label = `${baseHash}..${targetHash}`;
      resolvedBase = baseHash;
      resolvedTarget = targetHash;
    }

    diffArgs.push('--no-ext-diff', '--color=never');
    const raw = await this.git.diff(diffArgs);
    const files = parseUnifiedDiff(raw);

    if (range.target === 'working' || range.target === '.') {
      files.push(...(await this.getUntrackedFiles(new Set(files.map((f) => f.path)))));
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, label, resolvedBase, resolvedTarget };
  }

  /** untracked ファイルを added 扱いで diff に含める */
  private async getUntrackedFiles(known: Set<string>): Promise<DiffFileMeta[]> {
    const out = await this.git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
    const paths = out.split('\0').filter((p) => p.length > 0 && !known.has(p));
    const result: DiffFileMeta[] = [];
    for (const path of paths) {
      try {
        const buf = readFileSync(resolve(this.repoRoot, path));
        if (buf.length > MAX_UNTRACKED_FILE_BYTES) continue;
        const isBinary = buf.includes(0);
        const text = isBinary ? '' : buf.toString('utf8');
        const lines =
          text.length === 0 ? 0 : text.split('\n').filter((l, i, a) => i < a.length - 1 || l !== '').length;
        result.push({
          path,
          status: 'added',
          additions: isBinary ? 0 : lines,
          deletions: 0,
          isBinary,
          contentHash: sha256(`untracked:${path}:${sha256(buf.toString('base64'))}`),
        });
      } catch {
        // 読めないファイル (削除済み・権限なし) はスキップ
      }
    }
    return result;
  }

  async validateRef(ref: string): Promise<boolean> {
    if (ref === '.' || ref === 'working' || ref === 'staged') return true;
    try {
      await this.git.revparse(['--verify', `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }
}

export function shortHash(hash: string): string {
  return hash.trim().slice(0, 7);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function parseUnifiedDiff(diffText: string): DiffFileMeta[] {
  const files: DiffFileMeta[] = [];
  const blocks = diffText.split(/^diff --git /m).slice(1);
  for (const block of blocks) {
    const file = parseFileBlock(`diff --git ${block}`);
    if (file) files.push(file);
  }
  return files;
}

function parseFileBlock(block: string): DiffFileMeta | null {
  const lines = block.split('\n');
  const headerPaths = parseDiffHeaderPaths(lines[0] ?? '');

  const minusLine = lines.find((l) => l.startsWith('--- '));
  const plusLine = lines.find((l) => l.startsWith('+++ '));
  const renameFrom = extractPath(lines.find((l) => l.startsWith('rename from ')), 'rename from ');
  const renameTo = extractPath(lines.find((l) => l.startsWith('rename to ')), 'rename to ');
  const plusPath = extractPath(plusLine, '+++ ');
  const minusPath = extractPath(minusLine, '--- ');

  const newPath = renameTo ?? plusPath ?? headerPaths?.newPath;
  const oldPath = renameFrom ?? minusPath ?? headerPaths?.oldPath ?? newPath;
  const path = newPath ?? oldPath;
  if (!path) return null;

  let status: FileStatus = 'modified';
  if (lines.some((l) => l.startsWith('new file mode')) || minusLine?.includes('/dev/null')) {
    status = 'added';
  } else if (lines.some((l) => l.startsWith('deleted file mode')) || plusLine?.includes('/dev/null')) {
    status = 'deleted';
  } else if (oldPath !== undefined && newPath !== undefined && oldPath !== newPath) {
    status = 'renamed';
  }

  const isBinary =
    lines.some((l) => l.startsWith('Binary files ') || l === 'GIT binary patch');

  let additions = 0;
  let deletions = 0;
  let inChunk = false;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      inChunk = true;
      continue;
    }
    if (!inChunk) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }

  return {
    path,
    oldPath: status === 'renamed' ? oldPath : undefined,
    status,
    additions,
    deletions,
    isBinary,
    contentHash: sha256(block),
  };
}

/** `diff --git a/x b/x` 行から両パスを取り出す (クォート・エスケープ対応) */
function parseDiffHeaderPaths(
  headerLine: string,
): { oldPath: string | undefined; newPath: string | undefined } | null {
  if (!headerLine.startsWith('diff --git ')) return null;
  const raw = headerLine.slice('diff --git '.length);

  const segments: string[] = [];
  let current = '';
  let isInQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const prev = i > 0 ? raw[i - 1] : null;
    if (char === '"' && prev !== '\\') {
      isInQuotes = !isInQuotes;
      current += char;
      continue;
    }
    if (char === ' ' && !isInQuotes && prev !== '\\') {
      if (current) {
        segments.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) segments.push(current);
  if (segments.length !== 2) return null;

  return {
    oldPath: decodeGitPath(segments[0]),
    newPath: decodeGitPath(segments[1]),
  };
}

function extractPath(line: string | undefined, prefix: string): string | undefined {
  if (!line?.startsWith(prefix)) return undefined;
  return decodeGitPath(line.slice(prefix.length));
}

/** git の a/ b/ プレフィックス除去 + クォート/8進エスケープのデコード */
function decodeGitPath(rawPath: string | undefined): string | undefined {
  if (typeof rawPath !== 'string') return undefined;
  const trimmed =
    rawPath.startsWith('"') && rawPath.endsWith('"') ? rawPath.slice(1, -1) : rawPath;

  let path = trimmed;
  for (const prefix of ['a/', 'b/', 'c/', 'i/', 'w/']) {
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
      break;
    }
  }
  const tabIndex = path.indexOf('\t');
  if (tabIndex !== -1) path = path.slice(0, tabIndex);
  if (path === '/dev/null') return undefined;

  const bytes: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;
    if (char === '\\' && i + 1 < path.length) {
      const next = path[i + 1]!;
      if (/[0-7]/.test(next)) {
        let octal = next;
        let read = 1;
        while (read < 3 && i + 1 + read < path.length && /[0-7]/.test(path[i + 1 + read]!)) {
          octal += path[i + 1 + read];
          read++;
        }
        bytes.push(parseInt(octal, 8));
        i += read;
        continue;
      }
      const escapes: Record<string, number> = {
        t: 0x09, n: 0x0a, r: 0x0d, b: 0x08, f: 0x0c, v: 0x0b, a: 0x07,
        '\\': 0x5c, '"': 0x22, ' ': 0x20,
      };
      if (next in escapes) {
        bytes.push(escapes[next]!);
      } else {
        bytes.push(...Buffer.from(next, 'utf8'));
      }
      i++;
      continue;
    }
    bytes.push(...Buffer.from(char, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}
