import type { Comment } from './types.js';

/**
 * difit 互換の AI プロンプト形式: `path:L10-L20\n<body>` を `=====` 区切りで連結。
 * ファイル全体コメントは行番号なしの `path\n<body>`。
 */
export function formatCommentPrompt(comment: Comment): string {
  if (comment.startLine === undefined || comment.endLine === undefined) {
    return `${comment.path}\n${comment.body}`;
  }
  const lines =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}-L${comment.endLine}`;
  return `${comment.path}:${lines}\n${comment.body}`;
}

export function formatAllCommentsPrompt(comments: Comment[]): string {
  return comments.map(formatCommentPrompt).join('\n\n=====\n\n');
}
