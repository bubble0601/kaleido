import githubDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';
import githubLightCss from 'github-markdown-css/github-markdown-light.css?inline';
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
  const themeCss = theme === 'dark' ? githubDarkCss : githubLightCss;
  return `<!doctype html>
<html style="color-scheme: ${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${themeCss}${LAYOUT_CSS}</style>
</head>
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

/**
 * github-markdown-css は .markdown-body の見た目のみを定義するため、
 * 余白と背景の敷き方、および日本語の組版調整を足す。
 *
 * 組版まわりは https://zenn.dev/tyler0702/articles/d5df44210b4855 を参考にした:
 * - text-spacing-trim: 約物 (括弧・句読点) の前後にフォント由来で残る空きを詰める
 * - line-break: strict  小書き仮名・長音符が行頭に来る禁則を厳しくする
 * - hanging-punctuation: 行末の句読点をぶら下げて右端を揃える
 * - word-break / overflow-wrap: 長い URL や英単語のはみ出し対策
 * いずれも対応していないブラウザでは無視されるだけで、崩れはしない。
 */
const LAYOUT_CSS = `
html { height: 100%; }
body { margin: 0; min-height: 100%; }
.markdown-body {
  box-sizing: border-box;
  min-height: 100vh;
  /* 背景はビューポート全体に敷き、本文だけ 980px 幅に収める */
  padding: 32px max(24px, calc((100% - 980px) / 2)) 64px;

  text-spacing-trim: trim-start;
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  hanging-punctuation: allow-end;
}
/* コードは1文字も詰めたり折ったりしてはいけないので組版調整から外す */
.markdown-body pre,
.markdown-body code,
.markdown-body kbd,
.markdown-body samp {
  text-spacing-trim: normal;
  line-break: auto;
  hanging-punctuation: none;
  overflow-wrap: normal;
}
`;
