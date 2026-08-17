import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  /** クリップボードに入れる文字列 */
  text: string;
  title: string;
}

/** 押すとクリップボードにコピーし、少しの間チェックアイコンに変わる */
export function CopyButton({ text, title }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <button
      type="button"
      className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
      title={title}
      aria-label={title}
      onClick={() => void copy()}
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
  );
}
