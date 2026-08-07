import { inferLanguage, monaco } from './setup';

const MAX_CACHED_MODELS = 40;

// URI scheme で original / modified を判別できるようにする (hover provider が参照)
export const MODIFIED_SCHEME = 'kaleido-mod';
export const ORIGINAL_SCHEME = 'kaleido-org';

const lru: string[] = [];

function touch(key: string): void {
  const index = lru.indexOf(key);
  if (index !== -1) lru.splice(index, 1);
  lru.push(key);
  while (lru.length > MAX_CACHED_MODELS) {
    const evicted = lru.shift()!;
    const model = monaco.editor.getModel(monaco.Uri.parse(evicted));
    model?.dispose();
  }
}

/**
 * (side, path, ref) に対応するモデルを返す。内容が変わっていれば作り直す。
 * ref ごとに URI を分けることで範囲切替時に別モデルとして扱う。
 */
export function getOrCreateModel(params: {
  side: 'original' | 'modified';
  path: string;
  ref: string;
  content: string;
}): import('monaco-editor/editor/editor.api.js').editor.ITextModel {
  const scheme = params.side === 'modified' ? MODIFIED_SCHEME : ORIGINAL_SCHEME;
  const uri = monaco.Uri.from({
    scheme,
    path: `/${params.path}`,
    query: `ref=${encodeURIComponent(params.ref)}`,
  });
  const key = uri.toString();

  let model = monaco.editor.getModel(uri);
  if (model && model.getValue() !== params.content) {
    model.setValue(params.content);
  }
  if (!model) {
    model = monaco.editor.createModel(params.content, inferLanguage(params.path), uri);
  }
  touch(key);
  return model;
}

export function repoPathFromUri(uri: import('monaco-editor/editor/editor.api.js').Uri): string {
  return uri.path.replace(/^\//, '');
}
