import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import type { FileContentResponse, FileSide, RangeSpec } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 10 * 1024 * 1024;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_LINES = 20_000;

export class GitContent {
  constructor(private repoRoot: string) {}

  /**
   * RangeSpec から original/modified 両側の参照 ref を決める。
   * - working: index vs working tree
   * - staged:  base vs index
   * - '.':     base vs working tree
   * - commit:  base vs target
   */
  resolveSideRefs(range: RangeSpec, resolvedBase: string): { originalRef: string; modifiedRef: string } {
    if (range.target === 'working') return { originalRef: 'staged', modifiedRef: 'working' };
    if (range.target === 'staged') return { originalRef: resolvedBase, modifiedRef: 'staged' };
    if (range.target === '.') return { originalRef: resolvedBase, modifiedRef: 'working' };
    return { originalRef: resolvedBase, modifiedRef: range.target };
  }

  async getFileContents(params: {
    range: RangeSpec;
    resolvedBase: string;
    path: string;
    oldPath?: string;
    status: string;
  }): Promise<FileContentResponse> {
    const { range, resolvedBase, path, oldPath, status } = params;
    const refs = this.resolveSideRefs(range, resolvedBase);

    const [original, modified] = await Promise.all([
      status === 'added' ? null : this.readSide(refs.originalRef, oldPath ?? path),
      status === 'deleted' ? null : this.readSide(refs.modifiedRef, path),
    ]);

    const isTooLarge = isTooLargeContent(original) || isTooLargeContent(modified);
    if (isTooLarge) {
      return {
        original: original ? { ...original, content: '' } : null,
        modified: modified ? { ...modified, content: '' } : null,
        isTooLarge: true,
      };
    }
    return { original, modified, isTooLarge: false };
  }

  private async readSide(ref: string, filepath: string): Promise<FileSide | null> {
    try {
      const buf = await this.readBlob(ref, filepath);
      return { content: buf.toString('utf8'), ref };
    } catch {
      // untracked ファイルの original や、ref に存在しないパス
      return null;
    }
  }

  /** working tree の既存ファイルを上書き保存する (編集機能用) */
  async writeWorkingFile(filepath: string, content: string): Promise<void> {
    const repoRoot = realpathSync(resolve(this.repoRoot));
    // 既存ファイルのみ対象 (realpathSync は存在しないパスで throw する)
    const abs = realpathSync(resolve(repoRoot, normalizeRelPath(filepath)));
    if (abs !== repoRoot && !abs.startsWith(`${repoRoot}${sep}`)) {
      throw new Error('File path outside repository');
    }
    await writeFile(abs, content, 'utf8');
  }

  async readBlob(ref: string, filepath: string): Promise<Buffer> {
    if (ref === 'working') {
      const repoRoot = realpathSync(resolve(this.repoRoot));
      const abs = realpathSync(resolve(repoRoot, normalizeRelPath(filepath)));
      if (abs !== repoRoot && !abs.startsWith(`${repoRoot}${sep}`)) {
        throw new Error('File path outside repository');
      }
      return readFile(abs);
    }

    const rel = normalizeRelPath(filepath);
    if (ref === 'staged') {
      const { stdout } = await execFileAsync('git', ['show', `:${rel}`], {
        cwd: this.repoRoot,
        maxBuffer: MAX_BUFFER,
        encoding: 'buffer',
      });
      return stdout;
    }

    const { stdout: hashOut } = await execFileAsync('git', ['rev-parse', `${ref}:${rel}`], {
      cwd: this.repoRoot,
      maxBuffer: MAX_BUFFER,
    });
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', hashOut.trim()], {
      cwd: this.repoRoot,
      maxBuffer: MAX_BUFFER,
      encoding: 'buffer',
    });
    return stdout;
  }
}

function normalizeRelPath(filepath: string): string {
  if (filepath.length === 0) throw new Error('Invalid file path');
  const normalized = filepath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error('File path outside repository');
  }
  return normalized;
}

function isTooLargeContent(side: FileSide | null): boolean {
  if (!side) return false;
  if (Buffer.byteLength(side.content, 'utf8') > MAX_CONTENT_BYTES) return true;
  let lineCount = 1;
  for (let i = 0; i < side.content.length; i++) {
    if (side.content.charCodeAt(i) === 10) lineCount++;
    if (lineCount > MAX_CONTENT_LINES) return true;
  }
  return false;
}
