import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 設定ファイル名 (ルートディレクトリ直下) */
export const CONFIG_FILE_NAME = '.kaleido.json';

/**
 * 既定の除外パターン。ビルド成果物・依存・キャッシュなど、
 * 読む対象になりにくいものだけを落とす。ドットファイル全般は落とさない。
 */
export const DEFAULT_EXCLUDES = [
  '.git',
  'node_modules',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.pytest_cache',
  '.mypy_cache',
  '.gradle',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  'vendor',
  '.DS_Store',
];

const DEFAULT_MAX_FILES = 20_000;

export interface ViewerConfig {
  /** 除外パターン (gitignore 風の簡易 glob) */
  exclude: string[];
  /** ファイル一覧の件数上限 */
  maxFiles: number;
}

interface ConfigFile {
  exclude?: string[];
  /** false にすると DEFAULT_EXCLUDES を使わない */
  useDefaultExcludes?: boolean;
  maxFiles?: number;
}

/**
 * `<rootDir>/.kaleido.json` と CLI 引数から除外設定を組み立てる。
 * 優先度: CLI --exclude (追加) > 設定ファイル > 既定値
 */
export function loadViewerConfig(rootDir: string, cliExcludes: string[] = []): ViewerConfig {
  const file = readConfigFile(rootDir);
  const useDefaults = file?.useDefaultExcludes !== false;
  const exclude = [
    ...(useDefaults ? DEFAULT_EXCLUDES : ['.git']),
    ...(file?.exclude ?? []),
    ...cliExcludes,
  ];
  const maxFiles =
    typeof file?.maxFiles === 'number' && file.maxFiles > 0 ? file.maxFiles : DEFAULT_MAX_FILES;
  return { exclude: [...new Set(exclude)], maxFiles };
}

function readConfigFile(rootDir: string): ConfigFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(rootDir, CONFIG_FILE_NAME), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const raw = parsed as Record<string, unknown>;
    return {
      exclude: Array.isArray(raw.exclude) ? raw.exclude.filter((v) => typeof v === 'string') : undefined,
      useDefaultExcludes:
        typeof raw.useDefaultExcludes === 'boolean' ? raw.useDefaultExcludes : undefined,
      maxFiles: typeof raw.maxFiles === 'number' ? raw.maxFiles : undefined,
    };
  } catch {
    // 未配置・壊れた JSON は既定値で動かす
    return null;
  }
}

/**
 * 除外パターンのマッチャ。ルート相対の POSIX パスを受け取る。
 * - `/` を含まないパターンは任意階層のベース名にマッチ (`node_modules` → `**\/node_modules`)
 * - `*` はセグメント内、`**` は階層をまたぐ
 * - ディレクトリにマッチした時点で配下は走査しない
 */
export function createExcludeMatcher(patterns: string[]): (relPath: string) => boolean {
  const regexps = patterns.map(toRegExp).filter((r): r is RegExp => r !== null);
  return (relPath: string) => regexps.some((re) => re.test(relPath));
}

function toRegExp(pattern: string): RegExp | null {
  let source = pattern.trim().replace(/\\/g, '/');
  if (source.length === 0) return null;
  source = source.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (source.length === 0) return null;
  if (!source.includes('/')) source = `**/${source}`;

  let out = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (char === '*') {
      if (source[i + 1] === '*') {
        i++;
        if (source[i + 1] === '/') {
          i++;
          out += '(?:[^/]+/)*';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      continue;
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }

  try {
    return new RegExp(`^${out}$`);
  } catch {
    return null;
  }
}
