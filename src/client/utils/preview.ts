/** レンダリング結果を表示できるファイル種別 */
export type PreviewKind = 'markdown';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn'];

export function getPreviewKind(path: string): PreviewKind | null {
  const lower = path.toLowerCase();
  if (MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'markdown';
  return null;
}

/**
 * Markdown 内の相対リンクをルート相対パスに正規化する。
 * 絶対 URL・プロトコル相対・アンカーのみのリンクは対象外 (null)。
 */
export function resolveRelativePath(basePath: string, href: string): string | null {
  if (href.length === 0) return null;
  if (href.startsWith('#') || href.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;

  const withoutHash = href.split('#')[0]!.split('?')[0]!;
  if (withoutHash.length === 0) return null;

  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
  const raw = withoutHash.startsWith('/') ? withoutHash.slice(1) : `${baseDir}/${withoutHash}`;

  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null; // ルート外への参照は扱わない
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
}
