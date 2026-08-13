import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../services/api';
import { getFileTypeIconName } from '../utils/fileTypeIcons';

const MAX_RESULTS = 50;

/**
 * サブシーケンスマッチの簡易ファジースコア。
 * 連続一致とファイル名部分の一致を優遇し、短いパスをわずかに優先する。
 * マッチしない場合は null。
 */
function fuzzyScore(path: string, query: string): number | null {
  if (!query) return 0;
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  const basenameStart = p.lastIndexOf('/') + 1;
  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < p.length && qi < q.length; i++) {
    if (p[i] === q[qi]) {
      qi++;
      streak++;
      score += 1 + streak * 2 + (i >= basenameStart ? 3 : 0);
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return null;
  return score - p.length * 0.01;
}

interface QuickOpenProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function QuickOpen({ isOpen, onClose, onSelect }: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const repoFiles = useQuery({
    queryKey: ['repo-files'],
    queryFn: api.getRepoFiles,
    enabled: isOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const paths = repoFiles.data?.paths ?? [];
    if (!query) return paths.slice(0, MAX_RESULTS);
    return paths
      .map((path) => ({ path, score: fuzzyScore(path, query) }))
      .filter((r): r is { path: string; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.path);
  }, [repoFiles.data, query]);

  useEffect(() => setSelectedIndex(0), [query]);

  // 選択行を可視範囲に維持
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const select = (path: string | undefined) => {
    if (path) {
      onSelect(path);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <input
          autoFocus
          value={query}
          placeholder="Search files by name…"
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-2.5 text-sm text-neutral-800 outline-none dark:border-neutral-700 dark:text-neutral-200"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              select(results[selectedIndex]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-neutral-400 dark:text-neutral-500">
              {repoFiles.isLoading ? 'Loading…' : 'No matching files'}
            </div>
          ) : (
            results.map((path, index) => (
              <button
                key={path}
                type="button"
                data-index={index}
                className={`flex w-full items-center gap-2 px-4 py-1 text-left text-[13px] ${
                  index === selectedIndex
                    ? 'bg-blue-600/90 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
                onMouseMove={() => setSelectedIndex(index)}
                onClick={() => select(path)}
              >
                <Icon icon={getFileTypeIconName(path)} className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
