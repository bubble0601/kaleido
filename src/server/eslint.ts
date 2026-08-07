// difit fork の src/server/eslint.ts を kaleido の Diagnostic 型に合わせて移植。
// プロジェクト自身の node_modules/.bin/eslint を --format json で実行する。
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import type { Diagnostic } from '../shared/types.js';

const execFileAsync = promisify(execFile);

const ESLINT_BIN_RELATIVE = join('node_modules', '.bin', 'eslint');
const MAX_BUFFER = 32 * 1024 * 1024;
const ESLINT_TIMEOUT_MS = 60_000;
const ESLINT_PROBE_TIMEOUT_MS = 10_000;

const capabilitiesCache = new Map<string, Promise<{ supportsNoWarnIgnored: boolean }>>();

// --no-warn-ignored (ESLint v9 flat config 系のみ対応) を --help と併用して検出。
// 未対応の eslint はオプション検証で非ゼロ終了する。
function detectCapabilities(eslintBin: string): Promise<{ supportsNoWarnIgnored: boolean }> {
  let cached = capabilitiesCache.get(eslintBin);
  if (!cached) {
    cached = execFileAsync(eslintBin, ['--no-warn-ignored', '--help'], {
      timeout: ESLINT_PROBE_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    })
      .then(() => ({ supportsNoWarnIgnored: true }))
      .catch(() => ({ supportsNoWarnIgnored: false }));
    capabilitiesCache.set(eslintBin, cached);
  }
  return cached;
}

interface EslintMessage {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: 0 | 1 | 2;
  message: string;
  ruleId: string | null;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

export interface LintOutcome {
  /** eslint バイナリが見つからなかった場合 false (UI は静かに無効化) */
  available: boolean;
  results: Record<string, Diagnostic[]>;
}

function isWithin(child: string, parent: string): boolean {
  if (child === parent) return true;
  const parentWithSep = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(parentWithSep);
}

function findPackageRoot(absoluteFile: string, repoRoot: string): string {
  let dir = dirname(absoluteFile);
  while (isWithin(dir, repoRoot)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return repoRoot;
}

function findEslintBin(startDir: string, repoRoot: string): string | null {
  let dir = startDir;
  while (isWithin(dir, repoRoot)) {
    const candidate = join(dir, ESLINT_BIN_RELATIVE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function runEslintGroup(
  eslintBin: string,
  cwd: string,
  absoluteFiles: string[],
): Promise<EslintFileResult[]> {
  const capabilities = await detectCapabilities(eslintBin);
  const args = [
    '--format', 'json',
    ...(capabilities.supportsNoWarnIgnored ? ['--no-warn-ignored'] : []),
    '--no-error-on-unmatched-pattern',
    ...absoluteFiles.map((file) => relative(cwd, file)),
  ];

  try {
    const { stdout } = await execFileAsync(eslintBin, args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      timeout: ESLINT_TIMEOUT_MS,
    });
    return parseStdout(stdout);
  } catch (error) {
    // lint エラーありの場合 exit code 1 で JSON は stdout に出ている
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === 'string' && stdout.length > 0) {
      try {
        return parseStdout(stdout);
      } catch {
        // fall through
      }
    }
    console.warn(
      `[kaleido] ESLint failed in ${cwd}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return [];
  }
}

function parseStdout(stdout: string): EslintFileResult[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is EslintFileResult =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as EslintFileResult).filePath === 'string' &&
      Array.isArray((entry as EslintFileResult).messages),
  );
}

function convertMessage(message: EslintMessage): Diagnostic | null {
  if (typeof message.line !== 'number' || message.line <= 0) return null;
  const column = typeof message.column === 'number' && message.column > 0 ? message.column : 1;
  return {
    source: 'eslint',
    severity: message.severity === 2 ? 'error' : 'warning',
    message: message.message,
    code: message.ruleId ?? undefined,
    startLine: message.line,
    startColumn: column,
    endLine: typeof message.endLine === 'number' ? message.endLine : message.line,
    endColumn: typeof message.endColumn === 'number' ? message.endColumn : column + 1,
  };
}

export async function runEslintForFiles(repoRoot: string, files: string[]): Promise<LintOutcome> {
  if (files.length === 0) return { available: false, results: {} };
  const repoRootAbsolute = resolve(repoRoot);

  const groups = new Map<string, string[]>();
  for (const file of files) {
    const absolute = isAbsolute(file) ? file : resolve(repoRootAbsolute, file);
    if (!isWithin(absolute, repoRootAbsolute)) continue;
    try {
      if (!statSync(absolute).isFile()) continue;
    } catch {
      continue;
    }
    const root = findPackageRoot(absolute, repoRootAbsolute);
    groups.set(root, [...(groups.get(root) ?? []), absolute]);
  }
  if (groups.size === 0) return { available: false, results: {} };

  const results: Record<string, Diagnostic[]> = {};
  let anyBinFound = false;

  for (const [groupRoot, groupFiles] of groups) {
    const eslintBin = findEslintBin(groupRoot, repoRootAbsolute);
    if (!eslintBin) continue;
    anyBinFound = true;

    const groupResults = await runEslintGroup(eslintBin, groupRoot, groupFiles);
    for (const fileResult of groupResults) {
      const filePath = isAbsolute(fileResult.filePath)
        ? fileResult.filePath
        : resolve(groupRoot, fileResult.filePath);
      const repoRelative = relative(repoRootAbsolute, filePath).split(sep).join('/');
      const diagnostics = fileResult.messages
        .map(convertMessage)
        .filter((d): d is Diagnostic => d !== null);
      if (diagnostics.length > 0) {
        results[repoRelative] = diagnostics;
      }
    }
  }

  return { available: anyBinFound, results };
}
