/** Markdown として扱う拡張子 */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn'];
/** HTML として扱う拡張子 */
export const HTML_EXTENSIONS = ['.html', '.htm'];
/** PDF として扱う拡張子 */
export const PDF_EXTENSIONS = ['.pdf'];

/** ブラウザで表示できる画像の拡張子と Content-Type */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function extensionOf(path: string): string {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index).toLowerCase();
}

/** 「読み物」として扱うファイルか (Docs の絞り込み) */
export function isDocumentPath(path: string): boolean {
  const lower = path.toLowerCase();
  return [...MARKDOWN_EXTENSIONS, ...HTML_EXTENSIONS, ...PDF_EXTENSIONS].some((ext) =>
    lower.endsWith(ext),
  );
}

/** ブラウザ内蔵ビューアで開く PDF か */
export function isPdfPath(path: string): boolean {
  return PDF_EXTENSIONS.includes(extensionOf(path));
}

/** そのまま表示できる画像か (SVG を含む) */
export function isImagePath(path: string): boolean {
  return extensionOf(path) in IMAGE_CONTENT_TYPES;
}

/**
 * テキストとして読めず、プレビューでしか見せられないファイルか。
 * SVG は画像だがテキストなので、差分もソースも見せられる側に残す。
 */
export function isPreviewOnlyPath(path: string): boolean {
  const ext = extensionOf(path);
  return PDF_EXTENSIONS.includes(ext) || (ext in IMAGE_CONTENT_TYPES && ext !== '.svg');
}
