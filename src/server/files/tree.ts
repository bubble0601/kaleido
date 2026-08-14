import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { FilesResponse } from '../../shared/types.js';
import { createExcludeMatcher, type ViewerConfig } from './config.js';

/**
 * ルートディレクトリを走査してファイルの相対パス一覧を返す (非 git モードのファイル一覧)。
 * - 除外パターンにマッチしたディレクトリは配下ごとスキップする
 * - シンボリックリンクのディレクトリは循環を避けるため辿らない
 * - config.maxFiles を超えたら打ち切って isTruncated を立てる
 */
export async function listDirectoryFiles(
  rootDir: string,
  config: ViewerConfig,
): Promise<FilesResponse> {
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
      } else if (entry.isFile()) {
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
  paths.sort((a, b) => a.localeCompare(b));
  return { paths, isTruncated };
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
