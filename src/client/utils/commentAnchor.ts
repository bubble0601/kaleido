import type { editor } from 'monaco-editor/editor/editor.api.js';

import type { Comment } from '../../shared/types';

export interface AnchoredComment {
  comment: Comment;
  /** zone を配置する行 (再アンカー後)。1-based */
  displayLine: number;
  /** codeSnapshot が現在の内容のどこにも見つからない */
  isOutdated: boolean;
}

/**
 * codeSnapshot を使ってコメントを現在のモデル内容に再アンカーする。
 * 元の行が一致すればそのまま、ズレていれば近い位置から探索、見つからなければ outdated。
 */
export function anchorComment(model: editor.ITextModel, comment: Comment): AnchoredComment {
  const lineCount = model.getLineCount();
  const clamp = (line: number) => Math.max(1, Math.min(line, lineCount));
  const snapshot = comment.codeSnapshot;
  if (!snapshot) {
    return { comment, displayLine: clamp(comment.endLine), isOutdated: false };
  }

  const snapLines = snapshot.split('\n');
  const matchesAt = (start: number): boolean => {
    if (start < 1 || start + snapLines.length - 1 > lineCount) return false;
    for (let i = 0; i < snapLines.length; i++) {
      if (model.getLineContent(start + i) !== snapLines[i]) return false;
    }
    return true;
  };

  if (matchesAt(comment.startLine)) {
    return { comment, displayLine: comment.startLine + snapLines.length - 1, isOutdated: false };
  }
  for (let distance = 1; distance <= lineCount; distance++) {
    for (const start of [comment.startLine - distance, comment.startLine + distance]) {
      if (matchesAt(start)) {
        return { comment, displayLine: start + snapLines.length - 1, isOutdated: false };
      }
    }
    if (comment.startLine - distance < 1 && comment.startLine + distance > lineCount) break;
  }
  return { comment, displayLine: clamp(comment.endLine), isOutdated: true };
}
