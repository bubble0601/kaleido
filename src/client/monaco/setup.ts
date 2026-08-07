// Monaco のセットアップ。
// - features/register.all: hover, find, folding, diffEditor 等の全エディタ機能
// - ./languages: monarch トークナイザのみ (worker 不要のハイライト)
// TS/JSON/CSS/HTML の worker ベース language features は意図的に読み込まない
// (パッケージルートや languages/register.all の import はそれらを含むため使わない)。
// TypeScript の型情報はサーバー側 LanguageService から hover provider 経由で供給する。
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import './languages';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

import type { Environment } from 'monaco-editor/editor/editor.api.js';

declare global {
  interface Window {
    MonacoEnvironment?: Environment;
  }
}

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new EditorWorker();
  },
};

export { monaco };

export function inferLanguage(path: string): string {
  const filename = path.split('/').pop() ?? path;
  const extMatch = /(\.[^./\\]+)$/.exec(filename);
  const ext = extMatch?.[1]?.toLowerCase() ?? '';
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.filenames?.some((f) => f.toLowerCase() === filename.toLowerCase())) return lang.id;
    if (ext && lang.extensions?.some((e) => e.toLowerCase() === ext)) return lang.id;
  }
  return 'plaintext';
}
