import { useState } from 'react';

import type { Comment } from '../../../shared/types';
import { copyToClipboard, formatCommentPrompt } from '../../utils/commentFormat';

export function CommentCard({
  comment,
  isOutdated = false,
  onUpdate,
  onDelete,
}: {
  comment: Comment;
  isOutdated?: boolean;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const lineLabel =
    comment.startLine === undefined
      ? 'File'
      : comment.startLine === comment.endLine
        ? `L${comment.startLine}`
        : `L${comment.startLine}-${comment.endLine}`;

  if (isEditing) {
    return (
      <CommentForm
        initialBody={comment.body}
        submitLabel="Save"
        onSubmit={(body) => {
          onUpdate(comment.id, body);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="mb-1 mt-0.5 max-w-2xl rounded border border-neutral-300 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-800/95">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1 text-[11px] text-neutral-500 dark:border-neutral-700/60 dark:text-neutral-400">
        <span>{lineLabel}</span>
        {comment.side === 'original' && (
          <span className="rounded bg-red-100 px-1.5 py-px text-[10px] text-red-700 dark:bg-red-900/60 dark:text-red-300">old</span>
        )}
        {isOutdated && (
          <span
            className="rounded bg-yellow-100 px-1.5 py-px text-[10px] text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300"
            title="The commented code no longer matches the current content"
          >
            outdated
          </span>
        )}
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        <div className="flex-1" />
        <button
          type="button"
          className="hover:text-neutral-800 dark:hover:text-neutral-200"
          onClick={() => {
            void copyToClipboard(formatCommentPrompt(comment)).then(() => {
              setIsCopied(true);
              setTimeout(() => setIsCopied(false), 1500);
            });
          }}
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
        <button type="button" className="hover:text-neutral-800 dark:hover:text-neutral-200" onClick={() => setIsEditing(true)}>
          Edit
        </button>
        <button type="button" className="hover:text-red-600 dark:hover:text-red-400" onClick={() => onDelete(comment.id)}>
          Delete
        </button>
      </div>
      {isOutdated && comment.codeSnapshot && (
        <pre className="overflow-x-auto border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 font-mono text-[11px] text-neutral-500 dark:border-neutral-700/60 dark:bg-neutral-900/60">
          {comment.codeSnapshot}
        </pre>
      )}
      <div className="whitespace-pre-wrap px-3 py-2 text-neutral-800 dark:text-neutral-200">{comment.body}</div>
    </div>
  );
}

export function CommentForm({
  initialBody = '',
  submitLabel = 'Comment',
  onSubmit,
  onCancel,
}: {
  initialBody?: string;
  submitLabel?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="mb-1 mt-0.5 max-w-2xl rounded border border-blue-400 bg-white p-2 text-[13px] dark:border-blue-700/60 dark:bg-neutral-800/95">
      <textarea
        autoFocus
        value={body}
        rows={3}
        placeholder="Leave a comment… (⌘Enter to submit)"
        className="w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1.5 text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:border-blue-600"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
      />
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          className="rounded px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded bg-blue-700 px-2.5 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={!body.trim()}
          onClick={submit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
