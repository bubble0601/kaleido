import { api } from '../services/api';
import { getOrCreateModel, MODIFIED_SCHEME, repoPathFromUri } from './models';
import { monaco } from './setup';

const HOVER_LANGUAGES = ['typescript', 'javascript'];

let isRegistered = false;
let isDefinitionRegistered = false;
let isReferenceRegistered = false;

/**
 * サーバー側 ts.LanguageService への proxy hover provider。
 * modified 側のみ対応 (original 側は過去 snapshot のため正確な型を出せない)。
 */
export function registerServerHoverProvider(): void {
  if (isRegistered) return;
  isRegistered = true;

  monaco.languages.registerHoverProvider(HOVER_LANGUAGES, {
    async provideHover(model, position, token) {
      if (model.uri.scheme !== MODIFIED_SCHEME) return null;
      const path = repoPathFromUri(model.uri);
      const ref = new URLSearchParams(model.uri.query).get('ref') ?? 'working';
      // working tree 以外はディスク上に同内容がないため、表示中の全文を overlay として添付
      const isWorking = ref === 'working';

      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      try {
        const result = await api.hover(
          {
            path,
            line: position.lineNumber,
            column: position.column,
            content: isWorking ? undefined : model.getValue(),
          },
          abortController.signal,
        );
        if (!result || token.isCancellationRequested) return null;

        const contents = result.contents.map((value) => ({ value }));
        if (!isWorking) {
          contents.push({ value: `*approximate — dependencies resolved from current disk state*` });
        }
        return {
          contents,
          range: result.range
            ? new monaco.Range(
                result.range.startLine,
                result.range.startColumn,
                result.range.endLine,
                result.range.endColumn,
              )
            : undefined,
        };
      } catch {
        return null;
      }
    },
  });
}

/**
 * サーバー側 LS への proxy definition provider。
 * ジャンプ先ファイルのモデルを事前に fetch して作っておくことで、
 * peek (複数定義) と opener 経由のジャンプの両方を成立させる。
 */
interface ServerLocation {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** peek や opener で開けるように、対象パスのモデルを事前に fetch して作る */
async function ensureModelsForPaths(paths: string[], ref: string): Promise<void> {
  await Promise.all(
    paths.map(async (targetPath) => {
      const uri = monaco.Uri.from({
        scheme: MODIFIED_SCHEME,
        path: `/${targetPath}`,
        query: `ref=${encodeURIComponent(ref)}`,
      });
      if (monaco.editor.getModel(uri)) return;
      try {
        const res = await api.getFile(
          { target: ref === 'working' ? 'working' : ref, base: 'HEAD' },
          {
            path: targetPath,
            status: 'added',
            additions: 0,
            deletions: 0,
            isBinary: false,
            contentHash: '',
          },
        );
        if (res.modified) {
          getOrCreateModel({
            side: 'modified',
            path: targetPath,
            ref,
            content: res.modified.content,
          });
        }
      } catch {
        // モデルを作れなくても opener 側でファイルを開けるので無視
      }
    }),
  );
}

/** サーバーの Location 群を、モデル prefetch 済みの monaco Location へ変換する */
async function toMonacoLocations(
  locations: ServerLocation[],
  sourcePath: string,
  ref: string,
  maxPrefetchedFiles: number,
): Promise<{ uri: import('monaco-editor/editor/editor.api.js').Uri; range: InstanceType<typeof monaco.Range> }[]> {
  const uniquePaths = [...new Set(locations.map((l) => l.path))];
  const prefetchTargets = uniquePaths.filter((p) => p !== sourcePath).slice(0, maxPrefetchedFiles);
  await ensureModelsForPaths(prefetchTargets, ref);

  // prefetch しなかったファイルの Location は peek で開けないため除外する
  const openablePaths = new Set([sourcePath, ...prefetchTargets]);
  return locations
    .filter((l) => openablePaths.has(l.path))
    .map((l) => ({
      uri: monaco.Uri.from({
        scheme: MODIFIED_SCHEME,
        path: `/${l.path}`,
        query: `ref=${encodeURIComponent(ref)}`,
      }),
      range: new monaco.Range(l.startLine, l.startColumn, l.endLine, l.endColumn),
    }));
}

export function registerServerDefinitionProvider(): void {
  if (isDefinitionRegistered) return;
  isDefinitionRegistered = true;

  monaco.languages.registerDefinitionProvider(HOVER_LANGUAGES, {
    async provideDefinition(model, position, token) {
      if (model.uri.scheme !== MODIFIED_SCHEME) return null;
      const path = repoPathFromUri(model.uri);
      const ref = new URLSearchParams(model.uri.query).get('ref') ?? 'working';

      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      try {
        const defs = await api.getDefinition(
          {
            path,
            line: position.lineNumber,
            column: position.column,
            content: ref === 'working' ? undefined : model.getValue(),
          },
          abortController.signal,
        );
        if (token.isCancellationRequested || defs.length === 0) return null;
        return await toMonacoLocations(defs.slice(0, 5), path, ref, 5);
      } catch {
        return null;
      }
    },
  });
}

export function registerServerReferenceProvider(): void {
  if (isReferenceRegistered) return;
  isReferenceRegistered = true;

  monaco.languages.registerReferenceProvider(HOVER_LANGUAGES, {
    async provideReferences(model, position, _context, token) {
      if (model.uri.scheme !== MODIFIED_SCHEME) return null;
      const path = repoPathFromUri(model.uri);
      const ref = new URLSearchParams(model.uri.query).get('ref') ?? 'working';

      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      try {
        const refs = await api.getReferences(
          {
            path,
            line: position.lineNumber,
            column: position.column,
            content: ref === 'working' ? undefined : model.getValue(),
          },
          abortController.signal,
        );
        if (token.isCancellationRequested || refs.length === 0) return null;
        return await toMonacoLocations(refs, path, ref, 20);
      } catch {
        return null;
      }
    },
  });
}
