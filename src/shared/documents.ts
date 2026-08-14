/** Markdown として扱う拡張子 */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn'];
/** HTML として扱う拡張子 */
export const HTML_EXTENSIONS = ['.html', '.htm'];

/** 「読み物」として扱うファイルか (Docs の絞り込み) */
export function isDocumentPath(path: string): boolean {
  const lower = path.toLowerCase();
  return [...MARKDOWN_EXTENSIONS, ...HTML_EXTENSIONS].some((ext) => lower.endsWith(ext));
}
