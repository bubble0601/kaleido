import { useMemo } from 'react';

import type { PullConversationItem, PullDetail, PullReviewThread } from '../../../shared/types';
import { useUiStore } from '../../state/store';
import { MarkdownPreview } from '../MarkdownPreview';
import { ReviewThreadCard } from './ReviewThreadCard';

const STATE_STYLE: Record<PullDetail['state'], { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-green-600 text-white' },
  MERGED: { label: 'Merged', className: 'bg-purple-600 text-white' },
  CLOSED: { label: 'Closed', className: 'bg-red-600 text-white' },
};

function describeReview(item: PullConversationItem): string {
  switch (item.reviewState) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'requested changes';
    case 'DISMISSED':
      return 'reviewed (dismissed)';
    case 'PENDING':
      return 'started a review (pending)';
    default:
      return item.kind === 'review' ? 'reviewed' : 'commented';
  }
}

/**
 * 本文と会話をひとつの Markdown 文書にまとめる。
 * Markdown は sandbox iframe で描画するので、GitHub 由来の生 HTML が混ざっていても
 * ビューア本体には触れない (MarkdownPreview の前提と同じ)
 */
function composeDocument(pull: PullDetail): string {
  const parts: string[] = [pull.body.trim().length > 0 ? pull.body : '_No description provided._'];
  if (pull.conversation.length > 0) {
    parts.push('\n\n---\n\n## Conversation\n');
    for (const item of pull.conversation) {
      const when = new Date(item.createdAt).toLocaleString();
      parts.push(
        `\n**${item.author}** ${describeReview(item)} · ${when} · [open ↗](${item.url})\n\n${
          item.body.trim().length > 0 ? item.body : '_(no comment)_'
        }\n\n---\n`,
      );
    }
  }
  return parts.join('');
}

function devUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'github.com' ? `https://github.dev${parsed.pathname}` : null;
  } catch {
    return null;
  }
}

const LINK_CLASS =
  'rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700';

export function PullOverview({
  pull,
  onJumpToThread,
}: {
  pull: PullDetail;
  onJumpToThread: (thread: PullReviewThread) => void;
}) {
  const theme = useUiStore((state) => state.theme);
  const previewFontSize = useUiStore((state) => state.previewFontSize);
  const document = useMemo(() => composeDocument(pull), [pull]);
  const state = STATE_STYLE[pull.state];
  const dev = devUrl(pull.url);
  const threads = useMemo(
    () =>
      [...pull.reviewThreads].sort(
        (a, b) =>
          a.path.localeCompare(b.path) ||
          (a.line ?? a.originalLine ?? 0) - (b.line ?? b.originalLine ?? 0),
      ),
    [pull.reviewThreads],
  );
  const unresolvedCount = threads.filter((t) => !t.isResolved).length;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
            {pull.title}{' '}
            <span className="font-normal text-neutral-400 dark:text-neutral-500">#{pull.number}</span>
          </h1>
          <a href={pull.url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            GitHub ↗
          </a>
          {dev && (
            <a href={dev} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              github.dev ↗
            </a>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${state.className}`}>
            {pull.isDraft && pull.state === 'OPEN' ? 'Draft' : state.label}
          </span>
          <span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{pull.author}</span> wants to
            merge into
          </span>
          <code className="rounded bg-neutral-200 px-1 py-px text-[11px] dark:bg-neutral-800">{pull.baseRefName}</code>
          <span>from</span>
          <code className="rounded bg-neutral-200 px-1 py-px text-[11px] dark:bg-neutral-800">{pull.headRefName}</code>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span>
            {pull.changedFiles} file{pull.changedFiles === 1 ? '' : 's'}
          </span>
          <span className="text-green-600 dark:text-green-400">+{pull.additions}</span>
          <span className="text-red-600 dark:text-red-400">−{pull.deletions}</span>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span title={new Date(pull.updatedAt).toLocaleString()}>
            updated {new Date(pull.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <MarkdownPreview content={document} path="" theme={theme} fontSize={previewFontSize} />
      </div>
      {threads.length > 0 && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Review comments · {threads.length} thread{threads.length === 1 ? '' : 's'}
            {unresolvedCount > 0 && <span className="ml-1 opacity-70">({unresolvedCount} unresolved)</span>}
          </div>
          {threads.map((thread) => (
            <ReviewThreadCard
              key={thread.id}
              thread={thread}
              isPathShown
              onJump={() => onJumpToThread(thread)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
