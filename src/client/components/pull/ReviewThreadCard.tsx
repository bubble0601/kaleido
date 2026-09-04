import type { PullReviewThread } from '../../../shared/types';

function lineLabel(thread: PullReviewThread): string {
  const line = thread.line ?? thread.originalLine;
  const startLine = thread.startLine ?? thread.originalStartLine;
  if (line === null) return '';
  return startLine !== null && startLine !== line ? `L${startLine}-${line}` : `L${line}`;
}

/** diff の抜粋は長いことがあるので、コメント対象に近い末尾だけ見せる */
function tailOfHunk(diffHunk: string, maxLines = 4): string {
  const lines = diffHunk.split('\n').filter((l) => !l.startsWith('@@'));
  return lines.slice(-maxLines).join('\n');
}

/**
 * GitHub 上のレビューコメント (行スレッド) を読み取り専用で表示する。
 * ローカルコメントの CommentCard と並べても区別できるよう GitHub の印を付ける
 */
export function ReviewThreadCard({
  thread,
  isPathShown = false,
  onJump,
}: {
  thread: PullReviewThread;
  /** 一覧で使うときはファイルパスも出す */
  isPathShown?: boolean;
  /** 指定するとヘッダをクリックしてその行へ移動できる */
  onJump?: () => void;
}) {
  const label = lineLabel(thread);
  const header = (
    <>
      <span
        className="rounded bg-neutral-800 px-1.5 py-px text-[10px] font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900"
        title="Review comment on GitHub"
      >
        GitHub
      </span>
      {isPathShown && (
        <span className="min-w-0 truncate font-mono" title={thread.path}>
          {thread.path}
        </span>
      )}
      {label && <span className="shrink-0 font-mono">{label}</span>}
      {thread.side === 'original' && (
        <span className="rounded bg-red-100 px-1.5 py-px text-[10px] text-red-700 dark:bg-red-900/60 dark:text-red-300">
          old
        </span>
      )}
      {thread.isResolved && (
        <span className="rounded bg-green-100 px-1.5 py-px text-[10px] text-green-700 dark:bg-green-900/60 dark:text-green-300">
          resolved
        </span>
      )}
      {thread.isOutdated && (
        <span
          className="rounded bg-yellow-100 px-1.5 py-px text-[10px] text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300"
          title="The code has changed since this comment; shown at its original line"
        >
          outdated
        </span>
      )}
    </>
  );

  return (
    <div className="mb-1 mt-0.5 max-w-2xl rounded border border-neutral-300 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-800/95">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1 text-[11px] text-neutral-500 dark:border-neutral-700/60 dark:text-neutral-400">
        {onJump ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-neutral-800 dark:hover:text-neutral-200"
            title="Go to line"
            onClick={onJump}
          >
            {header}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
        )}
        {thread.comments[0] && (
          <a
            href={thread.comments[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Open ↗
          </a>
        )}
      </div>
      {thread.isOutdated && thread.diffHunk && (
        <pre className="overflow-x-auto border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 font-mono text-[11px] text-neutral-500 dark:border-neutral-700/60 dark:bg-neutral-900/60">
          {tailOfHunk(thread.diffHunk)}
        </pre>
      )}
      {thread.comments.map((comment) => (
        <div
          key={comment.id}
          className="border-b border-neutral-200 px-3 py-2 last:border-b-0 dark:border-neutral-700/60"
        >
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{comment.author}</span>
            <span>{new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          <div className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">{comment.body}</div>
        </div>
      ))}
    </div>
  );
}
