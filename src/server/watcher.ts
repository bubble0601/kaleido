import { relative, sep } from 'node:path';

import watcher from '@parcel/watcher';

const DEBOUNCE_MS = 300;

/**
 * リポジトリのファイル変更を監視する。
 * .git 配下は HEAD / index のみ通知対象 (commit / stage 操作の検知用)。
 */
export async function startWatcher(
  repoRoot: string,
  onChange: (paths: string[]) => void,
): Promise<() => Promise<void>> {
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    timer = null;
    const paths = [...pending];
    pending = new Set();
    if (paths.length > 0) onChange(paths);
  };

  const subscription = await watcher.subscribe(
    repoRoot,
    (err, events) => {
      if (err) return;
      for (const event of events) {
        const rel = relative(repoRoot, event.path).split(sep).join('/');
        if (rel.startsWith('.git/')) {
          if (rel !== '.git/HEAD' && rel !== '.git/index') continue;
        }
        pending.add(rel);
      }
      if (pending.size > 0 && !timer) {
        timer = setTimeout(flush, DEBOUNCE_MS);
      }
    },
    {
      ignore: [
        '**/node_modules/**',
        '.git/objects/**',
        '.git/logs/**',
        '.git/refs/**',
        '**/.DS_Store',
      ],
    },
  );

  return () => subscription.unsubscribe();
}
