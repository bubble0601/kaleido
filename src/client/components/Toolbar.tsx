import type { ViewMode } from '../state/store';

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'split', label: 'Split' },
  { mode: 'inline', label: 'Inline' },
  { mode: 'file', label: 'File' },
];

interface ToolbarProps {
  rangeLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewedCount?: number;
  totalCount?: number;
  commentCount?: number;
  onCopyAllComments?: () => void;
  children?: React.ReactNode;
}

export function Toolbar({
  rangeLabel,
  viewMode,
  onViewModeChange,
  viewedCount,
  totalCount,
  commentCount,
  onCopyAllComments,
  children,
}: ToolbarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3">
      <span className="text-sm font-semibold text-neutral-200">kaleido</span>
      <span className="truncate text-xs text-neutral-400">{rangeLabel}</span>
      <div className="flex-1" />
      {totalCount !== undefined && totalCount > 0 && (
        <span className="text-xs text-neutral-400">
          {viewedCount}/{totalCount} viewed
        </span>
      )}
      {commentCount !== undefined && commentCount > 0 && onCopyAllComments && (
        <button
          type="button"
          className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          title="Copy all comments as AI prompt"
          onClick={onCopyAllComments}
        >
          Copy prompt ({commentCount})
        </button>
      )}
      {children}
      <div className="flex overflow-hidden rounded border border-neutral-700">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`px-2.5 py-1 text-xs ${
              viewMode === mode
                ? 'bg-neutral-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
            onClick={() => onViewModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
