import { api } from '../services/api';
import { getOrCreateModel, MODIFIED_SCHEME, repoPathFromUri } from './models';
import { monaco } from './setup';

const HOVER_LANGUAGES = ['typescript', 'javascript'];

let isRegistered = false;
let isDefinitionRegistered = false;

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
export function registerServerDefinitionProvider(): void {
  if (isDefinitionRegistered) return;
  isDefinitionRegistered = true;

  monaco.languages.registerDefinitionProvider(HOVER_LANGUAGES, {
    async provideDefinition(model, position, token) {
      if (model.uri.scheme !== MODIFIED_SCHEME) return null;
      const path = repoPathFromUri(model.uri);
      const ref = new URLSearchParams(model.uri.query).get('ref') ?? 'working';
      const isWorking = ref === 'working';

      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      try {
        const defs = await api.getDefinition(
          {
            path,
            line: position.lineNumber,
            column: position.column,
            content: isWorking ? undefined : model.getValue(),
          },
          abortController.signal,
        );
        if (token.isCancellationRequested || defs.length === 0) return null;

        const limited = defs.slice(0, 5);
        // 未ロードのジャンプ先モデルを用意 (working 相当の内容で browse 表示と揃える)
        await Promise.all(
          [...new Set(limited.map((d) => d.path))]
            .filter((p) => p !== path)
            .map(async (targetPath) => {
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

        return limited.map((def) => ({
          uri: monaco.Uri.from({
            scheme: MODIFIED_SCHEME,
            path: `/${def.path}`,
            query: `ref=${encodeURIComponent(ref)}`,
          }),
          range: new monaco.Range(def.startLine, def.startColumn, def.endLine, def.endColumn),
        }));
      } catch {
        return null;
      }
    },
  });
}
