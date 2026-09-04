import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import open from 'open';

const execFileAsync = promisify(execFile);

/**
 * Orca (https://github.com/stablyai/orca) が起動したターミナルか。
 * Orca は spawn するシェルに TERM_PROGRAM=Orca と ORCA_PANE_KEY などを渡す
 */
export function isInsideOrca(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM === 'Orca' || env.ORCA_PANE_KEY !== undefined;
}

/**
 * URL をブラウザで開く。
 * Orca のターミナル内なら OS 既定のブラウザではなく Orca 内蔵ブラウザの新規タブに開く
 * (`orca tab create --url`)。それに失敗したときは警告して OS 既定のブラウザにフォールバックする
 */
export async function openInBrowser(url: string): Promise<void> {
  if (isInsideOrca()) {
    try {
      // Orca は管理下の WSL セッションでは CLI の実体を ORCA_CLI_COMMAND で知らせる
      const orca = process.env.ORCA_CLI_COMMAND || 'orca';
      await execFileAsync(orca, ['tab', 'create', '--url', url], { timeout: 15_000 });
      return;
    } catch (error) {
      const detail =
        typeof error === 'object' && error !== null && 'stderr' in error && String(error.stderr).trim()
          ? String(error.stderr).trim()
          : error instanceof Error
            ? error.message
            : String(error);
      console.error(`kaleido: could not open in Orca's browser, falling back to the default browser\n  ${detail}`);
    }
  }
  await open(url);
}
