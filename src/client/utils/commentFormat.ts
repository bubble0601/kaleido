import type { Comment } from '../../shared/types';

/** difit 互換の AI プロンプト形式: `path:L10-L20\n<body>` を `=====` 区切りで連結 */
export function formatCommentPrompt(comment: Comment): string {
  const lines =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}-L${comment.endLine}`;
  return `${comment.path}:${lines}\n${comment.body}`;
}

export function formatAllCommentsPrompt(comments: Comment[]): string {
  return comments.map(formatCommentPrompt).join('\n\n=====\n\n');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }
}
