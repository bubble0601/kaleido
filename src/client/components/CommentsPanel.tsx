import { useEffect, useRef, useState } from 'react';

import type { Comment } from '../../shared/types';
import { copyToClipboard, formatAllCommentsPrompt } from '../utils/commentFormat';

function lineLabel(comment: Comment): string {
  if (comment.startLine === undefined) return 'File';
  return comment.startLine === comment.endLine
    ? `L${comment.startLine}`
    : `L${comment.startLine}-${comment.endLine}`;
}

interface CommentsPanelProps {
  comments: Comment[];
  onJump: (comment: Comment) => void;
  onClearAll: () => void;
}

/** ツールバーのコメント一覧ドロップダウン (全コピー・全クリア付き) */
export function CommentsPanel({ comments, onJump, onClearAll }: CommentsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  const sorted = [...comments].sort(
    (a, b) => a.path.localeCompare(b.path) || (a.startLine ?? 0) - (b.startLine ?? 0),
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        title="Comments"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H8.4L5 13.8V11H3.5A1.5 1.5 0 0 1 2 9.5z" />
        </svg>
        {comments.length}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-[420px] rounded border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            <span>
              {comments.length} comment{comments.length === 1 ? '' : 's'}
            </span>
            <div className="flex-1" />
            {comments.length > 0 && (
              <>
                <button
                  type="button"
                  className="hover:text-neutral-800 dark:hover:text-neutral-200"
                  title="Copy all as AI prompt"
                  onClick={() => {
                    void copyToClipboard(formatAllCommentsPrompt(sorted)).then(() => {
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 1500);
                    });
                  }}
                >
                  {isCopied ? 'Copied!' : 'Copy all'}
                </button>
                <button
                  type="button"
                  className="hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => {
                    setIsOpen(false);
                    onClearAll();
                  }}
                >
                  Clear all
                </button>
              </>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {sorted.length === 0 ? (
              <div className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">
                No comments in this range
              </div>
            ) : (
              sorted.map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setIsOpen(false);
                    onJump(comment);
                  }}
                >
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="truncate">{comment.path}</span>
                    <span className="shrink-0">{lineLabel(comment)}</span>
                    {comment.side === 'original' && (
                      <span className="shrink-0 rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-900/60 dark:text-red-300">
                        old
                      </span>
                    )}
                  </div>
                  <div className="line-clamp-2 text-[12px] text-neutral-700 dark:text-neutral-300">
                    {comment.body}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
