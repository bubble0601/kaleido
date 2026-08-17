import { useUiStore, type ViewMode } from '../state/store';

const MODES: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'split',
    label: 'Split diff',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <line x1="8" y1="2.5" x2="8" y2="13.5" />
      </svg>
    ),
  },
  {
    mode: 'inline',
    label: 'Inline diff',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <line x1="4" y1="6" x2="12" y2="6" />
        <line x1="4" y1="8.5" x2="9" y2="8.5" />
        <line x1="4" y1="11" x2="11" y2="11" />
      </svg>
    ),
  },
  {
    mode: 'file',
    label: 'File (no diff)',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <path d="M4 1.5h5.5L13 5v9a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" />
        <path d="M9.5 1.5V5H13" />
      </svg>
    ),
  },
];

const BUTTON_CLASS =
  'rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700';

interface ToolbarProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenQuickOpen?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** false のとき表示モード切替を隠す (比較のないファイル閲覧) */
  isDiffAvailable?: boolean;
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
  viewMode,
  onViewModeChange,
  isDiffAvailable = true,
  children,
}: ToolbarProps) {
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
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
      <div className="flex-1" />
      {children}
      {isDiffAvailable && (
      <div className="flex overflow-hidden rounded border border-neutral-300 dark:border-neutral-700">
        {MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            type="button"
            title={label}
            className={`px-2 py-1 ${
              viewMode === mode
                ? 'bg-neutral-300 text-neutral-900 dark:bg-neutral-600 dark:text-white'
                : 'bg-white text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
            }`}
            onClick={() => onViewModeChange(mode)}
          >
            {icon}
          </button>
        ))}
      </div>
      )}
      <button
        type="button"
        className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
        title="Settings"
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="8" cy="8" r="4.6" />
          <circle cx="8" cy="8" r="1.7" />
          {/* 歯: リングの外側に短く出す */}
          <path
            strokeWidth="1.7"
            d="M8 1.7v1.4M8 12.9v1.4M14.3 8h-1.4M3.1 8H1.7M12.45 3.55l-1 1M4.55 11.45l-1 1M12.45 12.45l-1-1M4.55 4.55l-1-1"
          />
        </svg>
      </button>
    </div>
  );
}
