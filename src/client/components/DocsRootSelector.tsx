import { useEffect, useMemo, useRef, useState } from 'react';

export interface DocsRootOption {
  /** ルート相対のディレクトリ。空文字はルート全体 */
  path: string;
  /** そのディレクトリ配下にある読み物の数 */
  count: number;
}

interface DocsRootSelectorProps {
  current: string;
  options: DocsRootOption[];
  onChange: (root: string) => void;
}

/** ルート全体を表す選択肢の表示名 */
const ROOT_LABEL = '/';

/**
 * Docs の基点ディレクトリを選ぶ。
 * 候補が増えても辿れるよう、開くと入力欄にフォーカスして絞り込める。
 */
export function DocsRootSelector({ current, options, onChange }: DocsRootSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => (option.path || ROOT_LABEL).toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex((option) => option.path === current)));
    inputRef.current?.focus();
  }, [isOpen, options, current]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

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

  const select = (root: string) => {
    setIsOpen(false);
    onChange(root);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) select(option.path);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        title={`Docs root: ${current || ROOT_LABEL}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1.5 12.5v-9a1 1 0 0 1 1-1h3l1.5 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-left font-mono">{current || ROOT_LABEL}</span>
        <span className="shrink-0 text-[10px]">▾</span>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-7 z-50 w-80 max-w-[calc(100vw-5rem)] rounded border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="ディレクトリを検索"
            className="w-full border-b border-neutral-200 bg-transparent px-3 py-1.5 text-xs outline-none dark:border-neutral-800"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
            {filtered.map((option, index) => (
              <button
                key={option.path}
                type="button"
                data-index={index}
                className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs ${
                  index === activeIndex
                    ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
                title={option.path || ROOT_LABEL}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option.path)}
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {option.path || ROOT_LABEL}
                </span>
                {option.path === current && <span className="shrink-0 text-[10px]">●</span>}
                <span className="shrink-0 text-[10px] opacity-60">{option.count}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                該当なし
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
