import { useEffect, useRef, useState } from 'react';

import {
  describeRange,
  pullNumberOfRef,
  pullRange,
  pullRequestLinks,
  type PullRequestMeta,
  type RangeSpec,
} from '../../shared/types';
import { useRanges } from '../hooks/queries';
import { api } from '../services/api';

interface RangeOption {
  label: string;
  range: RangeSpec;
  /** PR は選択時に origin から fetch してから切り替える */
  pullNumber?: number;
}

function shortRef(ref: string): string {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

/** ボタン表示用にできるだけ短くした範囲ラベル */
function describeShortRange(range: RangeSpec): string {
  const sep = range.baseMode === 'merge-base' ? '...' : '..';
  if (range.target === 'working') return 'unstaged';
  if (range.target === 'staged') {
    return range.base === 'HEAD' ? 'staged' : `${shortRef(range.base)}..staged`;
  }
  if (range.target === '.') {
    return range.base === 'HEAD' ? 'uncommitted' : `${shortRef(range.base)}${sep}working`;
  }
  const pullNumber = pullNumberOfRef(range.target);
  if (pullNumber !== null) return `#${pullNumber}`;
  // 単一コミット (<target>^ vs <target>)
  if (range.base === `${range.target}^`) return shortRef(range.target);
  return `${shortRef(range.base)}${sep}${shortRef(range.target)}`;
}

interface RangeSelectorProps {
  current: RangeSpec;
  onChange: (range: RangeSpec) => void;
}

export function RangeSelector({ current, onChange }: RangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fetchingPull, setFetchingPull] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const ranges = useRanges();
  const containerRef = useRef<HTMLDivElement>(null);

  const pullRequests = ranges.data?.pullRequests ?? [];
  const currentPullNumber = pullNumberOfRef(current.target);
  const currentPull = pullRequests.find((pr) => pr.number === currentPullNumber);
  // 一覧 (open な PR のみ) に無い PR でもリンクを出せるよう、リポジトリ URL から組み立てる
  const repoUrl = ranges.data?.githubRepoUrl ?? null;
  const pullLinks =
    currentPullNumber !== null && repoUrl !== null
      ? pullRequestLinks(repoUrl, currentPullNumber)
      : null;

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

  const pullOptions: RangeOption[] = pullRequests.map((pr) => ({
    label: describePull(pr),
    range: pullRange(pr),
    pullNumber: pr.number,
  }));

  const select = async (option: RangeOption) => {
    setIsOpen(false);
    if (option.pullNumber === undefined) {
      onChange(option.range);
      return;
    }
    // 選び直すたびに fetch して、push 後の最新の head を見られるようにする
    setFetchError(null);
    setFetchingPull(option.pullNumber);
    try {
      const { range } = await api.fetchPull(option.pullNumber);
      onChange(range);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingPull(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch gap-1">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        title={`Compare: ${describeRange(current)}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="4" cy="12" r="1.8" />
          <circle cx="12" cy="4" r="1.8" />
          <path d="M4 10.2V6a1.5 1.5 0 0 1 1.5-1.5h4.7" />
          <path d="M12 5.8V10a1.5 1.5 0 0 1-1.5 1.5H5.8" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-left font-mono">
          {fetchingPull !== null ? `Fetching #${fetchingPull}…` : describeShortRange(current)}
          {fetchingPull === null && currentPull && (
            <span className="ml-1.5 font-sans text-neutral-500 dark:text-neutral-400">
              {currentPull.title}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[10px]">▾</span>
      </button>
      {pullLinks && (
        <>
          <ExternalLink href={pullLinks.html} title={`Open PR #${currentPullNumber} on GitHub`}>
            {/* GitHub の PR アイコン (git-pull-request) */}
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="4" cy="3.5" r="1.8" />
              <circle cx="4" cy="12.5" r="1.8" />
              <circle cx="12" cy="12.5" r="1.8" />
              <path d="M4 5.3v5.4" />
              <path d="M9 3.5h1.5A1.5 1.5 0 0 1 12 5v5.7" />
              <path d="M10.6 1.9 9 3.5l1.6 1.6" />
            </svg>
          </ExternalLink>
          {pullLinks.dev && (
            <ExternalLink href={pullLinks.dev} title={`Open PR #${currentPullNumber} in github.dev`}>
              {/* コードエディタ (github.dev) を表す <> */}
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5.5 4 2 8l3.5 4" />
                <path d="M10.5 4 14 8l-3.5 4" />
                <path d="M9.2 2.5 6.8 13.5" />
              </svg>
            </ExternalLink>
          )}
        </>
      )}
      </div>
      {fetchError && (
        <div className="mt-1 break-words text-[11px] text-red-600 dark:text-red-400" role="alert">
          {fetchError}
        </div>
      )}
      {isOpen && (
        <div className="absolute left-0 top-7 z-50 max-h-[70vh] w-96 max-w-[calc(100vw-5rem)] overflow-y-auto rounded border border-neutral-300 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <OptionGroup title="Quick" options={quickOptions} current={current} onSelect={select} />
          {pullOptions.length > 0 && (
            <OptionGroup title="Pull requests" options={pullOptions} current={current} onSelect={select} />
          )}
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

function ExternalLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="flex shrink-0 items-center rounded border border-neutral-300 bg-white px-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
    >
      {children}
    </a>
  );
}

function describePull(pr: PullRequestMeta): string {
  const draft = pr.isDraft ? '[draft] ' : '';
  return `#${pr.number} ${draft}${pr.title} (${pr.author})`;
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
