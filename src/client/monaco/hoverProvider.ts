import { api } from '../services/api';
import { MODIFIED_SCHEME, repoPathFromUri } from './models';
import { monaco } from './setup';

const HOVER_LANGUAGES = ['typescript', 'javascript'];

let isRegistered = false;

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
