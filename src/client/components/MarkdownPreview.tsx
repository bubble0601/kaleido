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

interface TocEntry {
  depth: number;
  id: string;
  text: string;
}

/** 目次に載せる見出しの深さ。h4 以下は細かすぎるので載せない */
const MAX_TOC_DEPTH = 3;

function renderDocument(content: string, path: string, theme: Theme): string {
  const toc: TocEntry[] = [];
  const body = createMarked(path, toc).parse(content, { async: false });
  const themeCss = theme === 'dark' ? githubDarkCss : githubLightCss;
  const tocHtml = renderToc(toc);
  return `<!doctype html>
<html style="color-scheme: ${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>@layer github { ${themeCss} } ${LAYOUT_CSS}</style>
</head>
<body class="markdown-body">
<div class="doc-shell${tocHtml ? ' has-toc' : ''}">
<main class="doc-content">${body}</main>
${tocHtml}
</div>
</body>
</html>`;
}

/**
 * 見出しが 2 つ以上あるときだけ目次を出す。
 * リンク先を about:srcdoc#id にしているのは、srcdoc の基準 URL が親ページになるため。
 * `#id` だけだと親ページへの遷移になってしまい、同一文書内スクロールにならない。
 */
function renderToc(entries: TocEntry[]): string {
  if (entries.length < 2) return '';
  const items = entries
    .map(
      (entry) =>
        `<li class="lv${entry.depth}"><a href="about:srcdoc#${encodeURIComponent(entry.id)}">${escapeAttr(entry.text)}</a></li>`,
    )
    .join('');
  return `<nav class="doc-toc" aria-label="Table of contents"><div class="doc-toc-title">Contents</div><ul>${items}</ul></nav>`;
}

function createMarked(basePath: string, toc: TocEntry[]): Marked {
  // sandbox 化した iframe は opaque origin になり相対 URL を解決できないため、
  // ビューア自身を指す URL は絶対 URL で書き出す
  const origin = location.origin;
  const usedIds = new Map<string, number>();
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
        const html = this.parser.parseInline(tokens);
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
        const id = uniqueId(slugify(plain), usedIds);
        if (depth <= MAX_TOC_DEPTH) toc.push({ depth, id, text: plain });
        return `<h${depth} id="${escapeAttr(id)}">${html}</h${depth}>`;
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

/** 同じ見出しが複数あっても目次から飛べるように、id を一意にする */
function uniqueId(base: string, used: Map<string, number>): string {
  const key = base.length > 0 ? base : 'section';
  const count = used.get(key) ?? 0;
  used.set(key, count + 1);
  return count === 0 ? key : `${key}-${count}`;
}

/**
 * github-markdown-css は .markdown-body の見た目のみを定義するため、
 * 余白と背景の敷き方、および日本語の組版調整を足す。
 *
 * github-markdown-css は @layer github に入れて読み込んでいる。
 * レイヤー付きのスタイルはレイヤー無しに必ず負けるため、
 * ここのルールは詳細度を気にせず上書きできる
 * (例: .markdown-body a:hover の下線を .doc-toc a で消せる)。
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
/* 背景を敷くために body 自体を .markdown-body にし、本文と目次は中で組む */
body.markdown-body {
  box-sizing: border-box;
  margin: 0;
  min-height: 100%;

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

.doc-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 40px;
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}
.doc-content { min-width: 0; }
.doc-content > *:first-child { margin-top: 0; }

/* 目次は幅に余裕があるときだけ横に出す (狭いときは本文を優先して隠す) */
.doc-toc { display: none; }
@media (min-width: 900px) {
  .doc-shell.has-toc { grid-template-columns: minmax(0, 1fr) 220px; }
  .doc-toc {
    display: block;
    position: sticky;
    top: 32px;
    align-self: start;
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    padding-left: 14px;
    border-left: 1px solid rgba(128, 128, 128, 0.35);
    font-size: 13px;
    line-height: 1.6;
  }
}
.doc-toc-title {
  margin-bottom: 6px;
  font-weight: 600;
  opacity: 0.6;
}
.doc-toc ul { margin: 0; padding: 0; list-style: none; }
.doc-toc li { margin: 0; }
.doc-toc a {
  display: block;
  padding: 2px 0;
  color: inherit;
  text-decoration: none;
  opacity: 0.75;
}
.doc-toc a:hover { opacity: 1; }
.doc-toc .lv2 a { padding-left: 12px; }
.doc-toc .lv3 a { padding-left: 24px; }
`;
