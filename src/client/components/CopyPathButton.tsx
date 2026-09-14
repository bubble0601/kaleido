import { useEffect, useRef, useState } from 'react';

import { useUiStore, type CopyPathMode } from '../state/store';

interface CopyPathButtonProps {
  /** ルート相対のファイルパス */
  path: string;
  /** 絶対パスを組み立てるためのルート。不明なら相対パスで代用する */
  rootDir: string | null;
}

const MODES: { mode: CopyPathMode; label: string }[] = [
  { mode: 'name', label: 'File name' },
  { mode: 'relative', label: 'Relative path' },
  { mode: 'absolute', label: 'Absolute path' },
];

function textOf(mode: CopyPathMode, path: string, rootDir: string | null): string {
  if (mode === 'name') return path.slice(path.lastIndexOf('/') + 1);
  if (mode === 'relative' || !rootDir) return path;
  return `${rootDir.replace(/\/$/, '')}/${path}`;
}

/**
 * ファイルのパスをコピーする。
 * 本体は直近に選んだ形式でコピーし、隣の ▾ で形式を選び直せる (選ぶとそのままコピーする)。
 */
export function CopyPathButton({ path, rootDir }: CopyPathButtonProps) {
  const mode = useUiStore((state) => state.copyPathMode);
  const setMode = useUiStore((state) => state.setCopyPathMode);
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const copy = async (target: CopyPathMode) => {
    try {
      await navigator.clipboard.writeText(textOf(target, path, rootDir));
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const currentLabel = MODES.find((m) => m.mode === mode)?.label ?? 'File name';

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
        title={`Copy ${currentLabel.toLowerCase()}`}
        aria-label={`Copy ${currentLabel.toLowerCase()}`}
        onClick={() => void copy(mode)}
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {isCopied ? (
            <path d="M3 8.5 6.5 12 13 4.5" />
          ) : (
            <>
              <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
              <path d="M11 5.5v-2A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11h2" />
            </>
          )}
        </svg>
      </button>
      <button
        type="button"
        className="rounded px-0.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
        title="Choose what to copy"
        aria-label="Choose what to copy"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        ▾
      </button>
      {isOpen && (
        <div className="absolute left-0 top-7 z-50 w-72 max-w-[calc(100vw-5rem)] rounded border border-neutral-300 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs ${
                option.mode === mode
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-700 dark:text-neutral-300'
              } hover:bg-neutral-100 dark:hover:bg-neutral-800`}
              title={textOf(option.mode, path, rootDir)}
              onClick={() => {
                setMode(option.mode);
                setIsOpen(false);
                void copy(option.mode);
              }}
            >
              <span className="w-3 shrink-0 text-[10px]">{option.mode === mode ? '●' : ''}</span>
              <span className="shrink-0">{option.label}</span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] opacity-60">
                {textOf(option.mode, path, rootDir)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
