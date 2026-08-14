import { Marked } from 'marked';
import { useMemo } from 'react';

import type { Theme } from '../state/store';
import { resolveRelativePath } from '../utils/preview';

interface MarkdownPreviewProps {
  /** Markdown 本文 */
  content: string;
  /** ルート相対のファイルパス。相対リンク・相対画像の基準になる */
  path: string;
  theme: Theme;
}

/**
 * Markdown のレンダリング結果を sandbox 化した iframe に表示する。
 *
 * marked は生の HTML を素通しするため、リポジトリの内容を同一オリジンで
 * 実行させないことが前提。iframe には allow-scripts も allow-same-origin も
 * 与えないので、スクリプトは実行されず API にも到達できない。
 */
export function MarkdownPreview({ content, path, theme }: MarkdownPreviewProps) {
  const html = useMemo(() => renderDocument(content, path, theme), [content, path, theme]);
  return (
    <iframe
      // allow-popups: リンクを新しいタブで開けるようにする (スクリプトは無効のまま)
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={html}
      title={`Preview of ${path}`}
      className="size-full border-0 bg-white dark:bg-neutral-900"
    />
  );
}

function renderDocument(content: string, path: string, theme: Theme): string {
  const body = createMarked(path).parse(content, { async: false });
  return `<!doctype html>
<html data-theme="${theme}">
<head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head>
<body><article class="markdown-body">${body}</article></body>
</html>`;
}

function createMarked(basePath: string): Marked {
  // sandbox 化した iframe は opaque origin になり相対 URL を解決できないため、
  // ビューア自身を指す URL は絶対 URL で書き出す
  const origin = location.origin;
  return new Marked({ gfm: true }).use({
    renderer: {
      image({ href, title, text }) {
        const resolved = resolveRelativePath(basePath, href);
        const src =
          resolved === null ? href : `${origin}/api/raw?path=${encodeURIComponent(resolved)}`;
        return `<img src="${escapeAttr(src)}" alt="${escapeAttr(text)}"${
          title ? ` title="${escapeAttr(title)}"` : ''
        }>`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const resolved = resolveRelativePath(basePath, href);
        // ルート内への相対リンクは、そのファイルをビューアの新しいタブで開く
        const target =
          resolved === null ? href : `${origin}/?path=${encodeURIComponent(resolved)}`;
        const isExternal = !href.startsWith('#');
        return `<a href="${escapeAttr(target)}"${title ? ` title="${escapeAttr(title)}"` : ''}${
          isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
        }>${text}</a>`;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(this.parser.parseInline(tokens, this.parser.textRenderer));
        return `<h${depth} id="${escapeAttr(id)}">${text}</h${depth}>`;
      },
    },
  });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

const PREVIEW_CSS = `
:root {
  --fg: #1f2328; --muted: #59636e; --bg: #ffffff;
  --border: #d1d9e0; --code-bg: #f6f8fa; --link: #0969da; --quote: #59636e;
}
html[data-theme='dark'] {
  --fg: #e6edf3; --muted: #9198a1; --bg: #0d1117;
  --border: #3d444d; --code-bg: #151b23; --link: #4493f8; --quote: #9198a1;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); }
body {
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', 'Hiragino Sans',
    'Noto Sans JP', Meiryo, sans-serif;
  font-size: 15px;
  line-height: 1.7;
}
.markdown-body { max-width: 900px; margin: 0 auto; padding: 24px 32px 64px; }
.markdown-body > *:first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 { margin: 1.6em 0 0.6em; line-height: 1.3; font-weight: 600; }
h1 { font-size: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.45em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2em; }
h4 { font-size: 1em; }
h5, h6 { font-size: 0.9em; color: var(--muted); }
p, ul, ol, blockquote, table, pre { margin: 0 0 1em; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { padding-left: 1.6em; }
li + li { margin-top: 0.25em; }
li > ul, li > ol { margin: 0.25em 0; }
blockquote {
  padding: 0 1em; color: var(--quote);
  border-left: 0.25em solid var(--border);
}
code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.87em;
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 6px;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
}
pre code { background: none; padding: 0; font-size: 0.85em; }
table { border-collapse: collapse; display: block; overflow-x: auto; width: max-content; max-width: 100%; }
th, td { border: 1px solid var(--border); padding: 6px 13px; }
th { background: var(--code-bg); font-weight: 600; }
img { max-width: 100%; }
hr { height: 1px; margin: 1.8em 0; border: 0; background: var(--border); }
input[type='checkbox'] { margin-right: 0.4em; }
li:has(> input[type='checkbox']) { list-style: none; }
`;
