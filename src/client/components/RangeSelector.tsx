import { useEffect, useRef, useState } from 'react';

import type { RangeSpec } from '../../shared/types';
import { useRanges } from '../hooks/queries';

interface RangeOption {
  label: string;
  range: RangeSpec;
}

interface RangeSelectorProps {
  current: RangeSpec;
  onChange: (range: RangeSpec) => void;
}

export function RangeSelector({ current, onChange }: RangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ranges = useRanges();
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

  const quickOptions: RangeOption[] = [
    { label: 'All uncommitted (HEAD → working tree)', range: { target: '.', base: 'HEAD' } },
    { label: 'Unstaged (index → working tree)', range: { target: 'working', base: 'HEAD' } },
    { label: 'Staged (HEAD → index)', range: { target: 'staged', base: 'HEAD' } },
    { label: 'Last commit (HEAD^ → HEAD)', range: { target: 'HEAD', base: 'HEAD^' } },
  ];

  const branchOptions: RangeOption[] = (ranges.data?.branches ?? [])
    .slice(0, 20)
    .map((branch) => ({
      label: `${branch} …working tree (merge-base)`,
      range: { target: '.', base: branch, baseMode: 'merge-base' },
    }));

  const commitOptions: RangeOption[] = (ranges.data?.recentCommits ?? []).slice(0, 20).map((c) => ({
    label: `${c.shortSha} ${c.subject.slice(0, 50)}`,
    range: { target: c.sha, base: `${c.sha}^` },
  }));

  const select = (option: RangeOption) => {
    setIsOpen(false);
    onChange(option.range);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        onClick={() => setIsOpen(!isOpen)}
      >
        Compare ▾
      </button>
      {isOpen && (
        <div className="absolute right-0 top-8 z-50 max-h-[70vh] w-96 overflow-y-auto rounded border border-neutral-300 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <OptionGroup title="Quick" options={quickOptions} current={current} onSelect={select} />
          {branchOptions.length > 0 && (
            <OptionGroup title="Branches" options={branchOptions} current={current} onSelect={select} />
          )}
          {commitOptions.length > 0 && (
            <OptionGroup title="Recent commits" options={commitOptions} current={current} onSelect={select} />
          )}
        </div>
      )}
    </div>
  );
}

function OptionGroup({
  title,
  options,
  current,
  onSelect,
}: {
  title: string;
  options: RangeOption[];
  current: RangeSpec;
  onSelect: (option: RangeOption) => void;
}) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {title}
      </div>
      {options.map((option) => {
        const isActive =
          option.range.target === current.target &&
          option.range.base === current.base &&
          option.range.baseMode === current.baseMode;
        return (
          <button
            key={option.label}
            type="button"
            className={`block w-full truncate px-3 py-1 text-left text-xs ${
              isActive
                ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
            title={option.label}
            onClick={() => onSelect(option)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
