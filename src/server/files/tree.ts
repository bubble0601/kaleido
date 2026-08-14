import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isDocumentPath } from '../../shared/documents.js';
import type { DocsResponse, FilesResponse } from '../../shared/types.js';
import { createExcludeMatcher, type ViewerConfig } from './config.js';

/**
 * ルートディレクトリを走査して、条件に合うファイルの相対パスを集める。
 * - 除外パターンにマッチしたディレクトリは配下ごとスキップする
 * - シンボリックリンクのディレクトリは循環を避けるため辿らない
 * - config.maxFiles を超えたら打ち切って isTruncated を立てる
 */
async function collectFiles(
  rootDir: string,
  config: ViewerConfig,
  isTarget: (relPath: string) => boolean,
): Promise<{ paths: string[]; isTruncated: boolean }> {
  const isExcluded = createExcludeMatcher(config.exclude);
  const paths: string[] = [];
  let isTruncated = false;

  const walk = async (relDir: string): Promise<void> => {
    if (isTruncated) return;
    let entries;
    try {
      entries = await readdir(join(rootDir, relDir), { withFileTypes: true });
    } catch {
      // 権限なし・走査中に消えたディレクトリは無視
      return;
    }

    const subdirs: string[] = [];
    for (const entry of entries) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) {
        subdirs.push(rel);
      } else if (entry.isFile() && isTarget(rel)) {
        if (paths.length >= config.maxFiles) {
          isTruncated = true;
          return;
        }
        paths.push(rel);
      }
      // シンボリックリンクはディレクトリ・ファイルとも辿らない
    }

    for (const subdir of subdirs) {
      await walk(subdir);
      if (isTruncated) return;
    }
  };

  await walk('');
  return { paths, isTruncated };
}

/** 非 git モードのファイル一覧 */
export async function listDirectoryFiles(
  rootDir: string,
  config: ViewerConfig,
): Promise<FilesResponse> {
  const { paths, isTruncated } = await collectFiles(rootDir, config, () => true);
  paths.sort((a, b) => a.localeCompare(b));
  return { paths, isTruncated };
}

/**
 * Docs 用の一覧。git の管理状態を見ずにファイルシステムを走査するので、
 * gitignore されている生成物などもそのまま対象になる。
 * 更新日時で並べ替えられるよう mtime も返す。
 */
export async function listDocumentFiles(
  rootDir: string,
  config: ViewerConfig,
): Promise<DocsResponse> {
  const { paths, isTruncated } = await collectFiles(rootDir, config, isDocumentPath);
  const files = await Promise.all(
    paths.map(async (path) => {
      try {
        return { path, mtime: (await stat(join(rootDir, path))).mtimeMs };
      } catch {
        return { path, mtime: 0 };
      }
    }),
  );
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, isTruncated };
}

/** git の ls-files 結果にも同じ除外設定を適用する (Files タブの見え方を揃えるため) */
export function applyExcludes(paths: string[], config: ViewerConfig): FilesResponse {
  const isExcluded = createExcludeMatcher(config.exclude);
  const filtered = paths.filter((path) => !isExcluded(path));
  return {
    paths: filtered.slice(0, config.maxFiles),
    isTruncated: filtered.length > config.maxFiles,
  };
}
