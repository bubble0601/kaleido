import { useUiStore, type ViewMode } from '../state/store';

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'split', label: 'Split' },
  { mode: 'inline', label: 'Inline' },
  { mode: 'file', label: 'File' },
];

const BUTTON_CLASS =
  'rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700';

interface ToolbarProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenQuickOpen?: () => void;
  rangeLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewedCount?: number;
  totalCount?: number;
  commentCount?: number;
  onCopyAllComments?: () => void;
  children?: React.ReactNode;
}

function SidebarToggleIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {!isCollapsed && <rect x="1.5" y="2.5" width="5" height="11" rx="1.5" fill="currentColor" />}
      <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function Toolbar({
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenQuickOpen,
  rangeLabel,
  viewMode,
  onViewModeChange,
  viewedCount,
  totalCount,
  commentCount,
  onCopyAllComments,
  children,
}: ToolbarProps) {
  const { theme, setTheme } = useUiStore();
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-200 bg-neutral-100 px-3 dark:border-neutral-800 dark:bg-neutral-900">
      {onToggleSidebar && (
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          title={isSidebarCollapsed ? 'Show file tree (⌘B)' : 'Hide file tree (⌘B)'}
          onClick={onToggleSidebar}
        >
          <SidebarToggleIcon isCollapsed={!!isSidebarCollapsed} />
        </button>
      )}
      {onOpenQuickOpen && (
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          title="Open file (⌘P)"
          onClick={onOpenQuickOpen}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">kaleido</span>
      <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{rangeLabel}</span>
      <div className="flex-1" />
      {totalCount !== undefined && totalCount > 0 && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {viewedCount}/{totalCount} viewed
        </span>
      )}
      {commentCount !== undefined && commentCount > 0 && onCopyAllComments && (
        <button
          type="button"
          className={BUTTON_CLASS}
          title="Copy all comments as AI prompt"
          onClick={onCopyAllComments}
        >
          Copy prompt ({commentCount})
        </button>
      )}
      {children}
      <div className="flex overflow-hidden rounded border border-neutral-300 dark:border-neutral-700">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`px-2.5 py-1 text-xs ${
              viewMode === mode
                ? 'bg-neutral-300 text-neutral-900 dark:bg-neutral-600 dark:text-white'
                : 'bg-white text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
            }`}
            onClick={() => onViewModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={BUTTON_CLASS}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>
    </div>
  );
}
