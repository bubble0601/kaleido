import type { RangeSpec } from '../../shared/types';

// syncUrl の replaceState で書き換わる前に、ロード時点のクエリを確定させておく
const initialParams = new URLSearchParams(location.search);

/** ページロード時の URL クエリから復元した比較範囲 (リロード・共有用) */
export function getInitialUrlRange(): RangeSpec | null {
  const target = initialParams.get('target');
  const base = initialParams.get('base');
  if (!target || !base) return null;
  return {
    target,
    base,
    baseMode: initialParams.get('baseMode') === 'merge-base' ? 'merge-base' : undefined,
  };
}

/** ページロード時の URL クエリから復元した選択ファイル */
export function getInitialUrlPath(): string | null {
  return initialParams.get('path');
}

export function syncUrl(range: RangeSpec | null, path: string | null): void {
  if (!range) return;
  const params = new URLSearchParams();
  params.set('target', range.target);
  params.set('base', range.base);
  if (range.baseMode === 'merge-base') params.set('baseMode', 'merge-base');
  if (path) params.set('path', path);
  const next = `${location.pathname}?${params}`;
  if (next !== `${location.pathname}${location.search}`) {
    history.replaceState(null, '', next);
  }
}
