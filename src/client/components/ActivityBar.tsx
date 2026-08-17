import type { SidebarTab } from '../state/store';

interface ActivityBarProps {
  activeTab: SidebarTab;
  /** false のとき Changes は出さない */
  isGitRepo: boolean;
  onSelect: (tab: SidebarTab) => void;
}

const ICON_CLASS = 'size-5';
const ICON_PROPS = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const ITEMS: { tab: SidebarTab; label: string; icon: React.ReactNode }[] = [
  {
    tab: 'changes',
    label: 'Changes',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <circle cx="4" cy="12" r="1.8" />
        <circle cx="12" cy="4" r="1.8" />
        <path d="M4 10.2V6a1.5 1.5 0 0 1 1.5-1.5h4.7" />
        <path d="M12 5.8V10a1.5 1.5 0 0 1-1.5 1.5H5.8" />
      </svg>
    ),
  },
  {
    tab: 'files',
    label: 'Files',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <path d="M1.5 12.5v-9a1 1 0 0 1 1-1h3l1.5 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    tab: 'docs',
    label: 'Docs',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <path d="M4 1.5h5L12.5 5v9.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" />
        <path d="M8.75 1.5V5h3.75" />
        <path d="M5.5 8.5h5M5.5 11h3" />
      </svg>
    ),
  },
];

/**
 * VS Code の Activity Bar 相当。サイドバーに何を出すかを切り替える。
 * 選択中のものをもう一度押すとサイドバーを畳む。
 * 畳んでいる間も、次に開く対象が分かるように選択状態は出したままにする。
 */
export function ActivityBar({ activeTab, isGitRepo, onSelect }: ActivityBarProps) {
  const items = isGitRepo ? ITEMS : ITEMS.filter((item) => item.tab !== 'changes');
  return (
    <div className="flex w-11 shrink-0 flex-col border-r border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950">
      {items.map((item) => {
        const isActive = activeTab === item.tab;
        return (
          <button
            key={item.tab}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={isActive}
            className={`flex h-11 items-center justify-center border-l-2 ${
              isActive
                ? 'border-blue-500 text-neutral-800 dark:text-neutral-100'
                : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200'
            }`}
            onClick={() => onSelect(item.tab)}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
