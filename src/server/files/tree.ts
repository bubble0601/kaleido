import { readdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { isDocumentPath } from '../../shared/documents.js';
import type { DirEntriesResponse, DocsResponse, FilesResponse } from '../../shared/types.js';
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
  return { paths, ignoredPaths: [], ignoredDirs: [], isTruncated };
}

/**
 * git モードのファイル一覧。ls-files の結果に除外設定を適用する。
 * ls-files はファイル単位で返すので、祖先ディレクトリが除外パターンにマッチするものも落とす
 */
export function buildRepoFilesResponse(
  listing: { paths: string[]; ignoredPaths: string[]; ignoredDirs: string[] },
  config: ViewerConfig,
): FilesResponse {
  const isExcludedSelf = createExcludeMatcher(config.exclude);
  const isExcluded = (relPath: string) => {
    const segments = relPath.split('/');
    return segments.some((_, i) => isExcludedSelf(segments.slice(0, i + 1).join('/')));
  };
  const ignoredPaths = listing.ignoredPaths.filter((path) => !isExcluded(path));
  const paths = [...listing.paths, ...ignoredPaths]
    .filter((path) => !isExcluded(path))
    .sort((a, b) => a.localeCompare(b));
  return {
    paths: paths.slice(0, config.maxFiles),
    ignoredPaths,
    ignoredDirs: listing.ignoredDirs.filter((path) => !isExcluded(path)),
    isTruncated: paths.length > config.maxFiles,
  };
}

/** gitignore されたディレクトリを開いたときに、その直下だけを読む */
export async function listDirEntries(
  rootDir: string,
  relDir: string,
  config: ViewerConfig,
): Promise<DirEntriesResponse> {
  const segments = relDir.split('/');
  if (segments.some((segment) => segment === '' || segment === '..')) {
    throw new Error('Invalid directory path');
  }
  const abs = await realpath(join(rootDir, relDir));
  if (!abs.startsWith(`${rootDir}${sep}`)) throw new Error('Directory outside the viewer root');

  const isExcluded = createExcludeMatcher(config.exclude);
  const files: string[] = [];
  const dirs: string[] = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (isExcluded(rel)) continue;
    // collectFiles と揃えてシンボリックリンクは辿らない
    if (entry.isDirectory()) dirs.push(rel);
    else if (entry.isFile()) files.push(rel);
  }
  return { files, dirs };
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

