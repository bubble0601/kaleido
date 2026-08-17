import githubDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';
import githubLightCss from 'github-markdown-css/github-markdown-light.css?inline';
import { Marked } from 'marked';
import { useEffect, useMemo, useState } from 'react';

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
 *
 * mermaid のコードブロックは iframe 内で mermaid を動かせないため、
 * 親側で SVG に変換してから埋め込む (変換できるまではソースのまま表示する)。
 *
 * コピーボタンだけはスクリプトが要るので allow-scripts を付けているが、
 * CSP の nonce でこちらが入れた 1 本以外は実行させず、connect-src 'none' で
 * 通信も塞いでいる。allow-same-origin は付けないので、仮に何か動いても
 * アプリのオリジンや API には触れない。
 */
export function MarkdownPreview({ content, path, theme }: MarkdownPreviewProps) {
  const doc = useMemo(() => renderDocument(content, path, theme), [content, path, theme]);
  const svgByKey = useMermaidDiagrams(doc.diagrams, theme);
  const html = useMemo(() => fillDiagrams(doc, svgByKey, theme), [doc, svgByKey, theme]);
  return (
    <iframe
      // allow-popups: リンクを新しいタブで開けるようにする
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      // 別オリジン扱いになるため、クリップボードは明示的に許可する必要がある
      allow="clipboard-write"
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

interface MermaidBlock {
  code: string;
  /** SVG に変換できるまで (できなかったとき) に表示するコードブロック */
  fallback: string;
}

interface PreviewDocument {
  /** mermaid 部分は <div data-mermaid="N"></div> のままになっている */
  html: string;
  diagrams: MermaidBlock[];
}

/** 目次に載せる見出しの深さ。h4 以下は細かすぎるので載せない */
const MAX_TOC_DEPTH = 3;

function renderDocument(content: string, path: string, theme: Theme): PreviewDocument {
  const toc: TocEntry[] = [];
  const diagrams: MermaidBlock[] = [];
  const body = createMarked(path, toc, diagrams).parse(content, { async: false });
  const themeCss = theme === 'dark' ? githubDarkCss : githubLightCss;
  const tocHtml = renderToc(toc);
  // 表示中の文書に対して毎回ランダムな nonce を振る。
  // 本文由来の <script> は nonce を持てないので実行されない
  const nonce = createNonce();
  const html = `<!doctype html>
<html style="color-scheme: ${theme}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>@layer github { ${themeCss} } ${LAYOUT_CSS}</style>
</head>
<body class="markdown-body">
<div class="doc-shell${tocHtml ? ' has-toc' : ''}">
<main class="doc-content">${body}</main>
${tocHtml}
</div>
<script nonce="${nonce}">${PREVIEW_SCRIPT}</script>
</body>
</html>`;
  return { html, diagrams };
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 変換済みの SVG を差し込む。まだのもの・失敗したものはコードブロックのまま残す */
function fillDiagrams(
  doc: PreviewDocument,
  svgByKey: ReadonlyMap<string, string>,
  theme: Theme,
): string {
  if (doc.diagrams.length === 0) return doc.html;
  return doc.html.replace(/<div data-mermaid="(\d+)"><\/div>/g, (_, index: string) => {
    const block = doc.diagrams[Number(index)];
    if (!block) return '';
    const svg = svgByKey.get(diagramKey(block.code, theme));
    return svg ? renderMermaidBlock(index, svg, block.fallback) : block.fallback;
  });
}

/**
 * 図とソースを切り替えられるようにする。
 * iframe 内で使えるスクリプトはコピー用の 1 本だけなので、
 * 切り替えはラジオボタンと兄弟セレクタだけで組む。
 * CSS 側は id ではなく value / data-tab を見るので、番号に依存しない。
 */
function renderMermaidBlock(index: string, svg: string, source: string): string {
  const name = `mermaid-${index}`;
  return `<div class="mermaid-block">\
<input type="radio" name="${name}" id="${name}-diagram" class="mermaid-switch" value="diagram" checked>\
<input type="radio" name="${name}" id="${name}-source" class="mermaid-switch" value="source">\
<div class="mermaid-bar"><div class="mermaid-tabs">\
<label class="mermaid-tab" data-tab="diagram" for="${name}-diagram" title="Diagram" aria-label="Diagram">${ICON_DIAGRAM}</label>\
<label class="mermaid-tab" data-tab="source" for="${name}-source" title="Source" aria-label="Source">${ICON_CODE}</label>\
</div></div>\
<div class="mermaid-view">${svg}</div>\
<div class="mermaid-source">${source}</div>\
</div>`;
}

const ICON_ATTRS =
  'viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICON_DIAGRAM = `<svg ${ICON_ATTRS}><rect x="5.5" y="1.5" width="5" height="3.5" rx="1"/><rect x="1" y="11" width="5" height="3.5" rx="1"/><rect x="10" y="11" width="5" height="3.5" rx="1"/><path d="M8 5v2.5M3.5 11V7.5h9V11"/></svg>`;

const ICON_CODE = `<svg ${ICON_ATTRS}><path d="M6 3.5 2.5 8 6 12.5"/><path d="M10 3.5 13.5 8 10 12.5"/></svg>`;

const ICON_COPY = `<svg ${ICON_ATTRS} class="icon-copy"><rect x="5.5" y="5.5" width="9" height="9" rx="1.5"/><path d="M11 5.5v-2A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11h2"/></svg>`;

const ICON_CHECK = `<svg ${ICON_ATTRS} class="icon-done"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`;

function diagramKey(code: string, theme: Theme): string {
  return `${theme}\n${code}`;
}

/**
 * mermaid のコードブロックを SVG に変換する。
 * 変換はこのページ (スクリプトが動く側) で行い、結果の SVG だけを iframe に渡す。
 * 図の枚数が多くても初回以外は使い回せるよう、テーマ + ソースをキーに覚えておく。
 */
function useMermaidDiagrams(blocks: MermaidBlock[], theme: Theme): ReadonlyMap<string, string> {
  const [svgByKey, setSvgByKey] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    const pending = new Map<string, string>();
    for (const block of blocks) {
      const key = diagramKey(block.code, theme);
      if (!svgByKey.has(key)) pending.set(key, block.code);
    }
    if (pending.size === 0) return;

    let isCancelled = false;
    void (async () => {
      const rendered: [string, string][] = [];
      for (const [key, code] of pending) {
        const svg = await renderMermaid(code, theme);
        if (isCancelled) return;
        if (svg !== null) rendered.push([key, svg]);
      }
      if (rendered.length > 0) setSvgByKey((prev) => new Map([...prev, ...rendered]));
    })();
    return () => {
      isCancelled = true;
    };
  }, [blocks, theme, svgByKey]);

  return svgByKey;
}

let mermaidModule: Promise<typeof import('mermaid').default> | null = null;
let diagramSequence = 0;

async function renderMermaid(code: string, theme: Theme): Promise<string | null> {
  try {
    mermaidModule ??= import('mermaid').then((module) => module.default);
    const mermaid = await mermaidModule;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      // ラベル内の HTML をサニタイズする (図のソースはリポジトリ由来なので信用しない)
      securityLevel: 'strict',
    });
    // render は構文エラーのときエラー図をその場に描いて残すので、先に構文だけ確かめる
    if (!(await mermaid.parse(code, { suppressErrors: true }))) return null;

    const id = `kaleido-mermaid-${diagramSequence++}`;
    // 描画用の一時要素は自前で用意して確実に片付ける (放置すると画面下にエラー図が残る)
    const host = createOffscreenHost();
    try {
      const { svg } = await mermaid.render(id, code, host);
      return svg;
    } finally {
      host.remove();
      window.document.getElementById(`d${id}`)?.remove();
      window.document.getElementById(id)?.remove();
    }
  } catch {
    // 構文エラーなどはコードブロックのまま見せる
    return null;
  }
}

function createOffscreenHost(): HTMLElement {
  const host = window.document.createElement('div');
  // 画面外に置く。幅は文字送りの計算に使われるので現実的な値を与える
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px;visibility:hidden';
  window.document.body.appendChild(host);
  return host;
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

function createMarked(basePath: string, toc: TocEntry[], diagrams: MermaidBlock[]): Marked {
  // sandbox 化した iframe は opaque origin になり相対 URL を解決できないため、
  // ビューア自身を指す URL は絶対 URL で書き出す
  const origin = location.origin;
  const usedIds = new Map<string, number>();
  // breaks: 段落内の改行をそのまま <br> にする (書いたとおりの改行位置で見せる)
  return new Marked({ gfm: true, breaks: true }).use({
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
      code({ text, lang, escaped }) {
        const language = (lang ?? '').trim().split(/\s+/)[0] ?? '';
        const block = renderCodeBlock(text, language, escaped === true);
        if (language.toLowerCase() !== 'mermaid') return block;
        const index = diagrams.length;
        diagrams.push({ code: text, fallback: block });
        return `<div data-mermaid="${index}"></div>`;
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

function renderCodeBlock(text: string, lang: string, isEscaped: boolean): string {
  const className = lang ? ` class="language-${escapeAttr(lang)}"` : '';
  const body = isEscaped ? text : escapeAttr(text);
  return `<div class="code-block"><pre><code${className}>${body}\n</code></pre>\
<button type="button" class="copy-button" title="Copy" aria-label="Copy code">${ICON_COPY}${ICON_CHECK}</button></div>`;
}

/** iframe に入れる唯一のスクリプト (CSP の nonce 付きでしか動かない) */
const PREVIEW_SCRIPT = `
document.addEventListener('click', function (event) {
  var button = event.target.closest('.copy-button');
  if (!button) return;
  var code = button.parentElement.querySelector('code');
  if (!code) return;
  var text = code.innerText.replace(/\\n$/, '');
  var flag = function (state) {
    button.dataset.state = state;
    setTimeout(function () { delete button.dataset.state; }, 1200);
  };
  var fallback = function () {
    var area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    try { flag(document.execCommand('copy') ? 'done' : 'error'); }
    catch (error) { flag('error'); }
    area.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { flag('done'); }, fallback);
  } else {
    fallback();
  }
});

// スクロール位置に対応する見出しを目次で強調する
(function () {
  var toc = document.querySelector('.doc-toc');
  if (!toc) return;
  var entries = [];
  var links = toc.querySelectorAll('a[href]');
  for (var i = 0; i < links.length; i++) {
    var hash = links[i].getAttribute('href').split('#')[1];
    var heading = hash ? document.getElementById(decodeURIComponent(hash)) : null;
    if (heading) entries.push({ link: links[i], heading: heading });
  }
  if (entries.length === 0) return;

  var current = null;
  var update = function () {
    // 画面上端よりわずかに下を基準に、そこを最後に通り過ぎた見出しを現在地とする
    var active = entries[0];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].heading.getBoundingClientRect().top > 96) break;
      active = entries[i];
    }
    if (active === current) return;
    if (current) current.link.removeAttribute('aria-current');
    active.link.setAttribute('aria-current', 'true');
    current = active;

    // 目次自体が長いときは、強調中の項目が隠れないように寄せる
    var tocBox = toc.getBoundingClientRect();
    var linkBox = active.link.getBoundingClientRect();
    if (linkBox.top < tocBox.top) toc.scrollTop -= tocBox.top - linkBox.top;
    else if (linkBox.bottom > tocBox.bottom) toc.scrollTop += linkBox.bottom - tocBox.bottom;
  };

  var isScheduled = false;
  window.addEventListener('scroll', function () {
    if (isScheduled) return;
    isScheduled = true;
    requestAnimationFrame(function () {
      isScheduled = false;
      update();
    });
  }, { passive: true });
  update();
})();
`;

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
.doc-toc a[aria-current='true'] {
  opacity: 1;
  font-weight: 600;
  background: rgba(128, 128, 128, 0.16);
  border-radius: 4px;
}

/* 図とソースの切り替え (ラジオ + 兄弟セレクタ。スクリプト不要) */
.mermaid-block { margin: 0 0 16px; }
.mermaid-switch { position: absolute; opacity: 0; pointer-events: none; }
.mermaid-bar { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.mermaid-tabs {
  display: inline-flex;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 6px;
  overflow: hidden;
}
.mermaid-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 22px;
  cursor: pointer;
  opacity: 0.5;
}
.mermaid-tab + .mermaid-tab { border-left: 1px solid rgba(128, 128, 128, 0.35); }
.mermaid-tab:hover { opacity: 0.8; }
.mermaid-switch[value='diagram']:checked ~ .mermaid-bar .mermaid-tab[data-tab='diagram'],
.mermaid-switch[value='source']:checked ~ .mermaid-bar .mermaid-tab[data-tab='source'] {
  background: rgba(128, 128, 128, 0.22);
  opacity: 1;
}
.mermaid-view { overflow-x: auto; text-align: center; }
.mermaid-view svg { max-width: 100%; height: auto; }
.mermaid-source { display: none; }
.mermaid-switch[value='source']:checked ~ .mermaid-view { display: none; }
.mermaid-switch[value='source']:checked ~ .mermaid-source { display: block; }
.mermaid-source .code-block pre { margin-bottom: 0; }

/* コードブロックのコピーボタン */
.code-block { position: relative; }
.copy-button {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.15);
  color: inherit;
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.12s;
}
.code-block:hover .copy-button,
.copy-button:focus-visible,
.copy-button[data-state] { opacity: 1; }
.copy-button:hover { background: rgba(128, 128, 128, 0.3); }
.copy-button .icon-done { display: none; }
.copy-button[data-state='done'] .icon-copy { display: none; }
.copy-button[data-state='done'] .icon-done { display: block; }
.copy-button[data-state='error'] { border-color: rgba(220, 80, 80, 0.7); color: rgb(220, 80, 80); }
.doc-toc .lv2 a { padding-left: 12px; }
.doc-toc .lv3 a { padding-left: 24px; }
`;
