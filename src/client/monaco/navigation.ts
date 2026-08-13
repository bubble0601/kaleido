import { MODIFIED_SCHEME, ORIGINAL_SCHEME, repoPathFromUri } from './models';
import { monaco } from './setup';

export interface RevealTarget {
  path: string;
  line: number;
  column: number;
}

type OpenHandler = (target: RevealTarget) => void;

let openHandler: OpenHandler | null = null;

/** App 側からファイルオープン処理 (diff 選択 or browse) を登録する */
export function setFileOpenHandler(handler: OpenHandler | null): void {
  openHandler = handler;
}

let isRegistered = false;

/**
 * Go to Definition 等で別ファイルの URI が開かれようとしたときに
 * kaleido のファイル切替へ委譲する opener。
 */
export function registerKaleidoEditorOpener(): void {
  if (isRegistered) return;
  isRegistered = true;

  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      if (resource.scheme !== MODIFIED_SCHEME && resource.scheme !== ORIGINAL_SCHEME) {
        return false;
      }
      const path = repoPathFromUri(resource);
      let line = 1;
      let column = 1;
      if (selectionOrPosition) {
        if (monaco.Range.isIRange(selectionOrPosition)) {
          line = selectionOrPosition.startLineNumber;
          column = selectionOrPosition.startColumn;
        } else {
          line = selectionOrPosition.lineNumber;
          column = selectionOrPosition.column;
        }
      }
      openHandler?.({ path, line, column });
      return true;
    },
  });
}
