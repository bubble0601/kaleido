/** ドロップダウンを開くボタンに添える下向き chevron */
export function ChevronDownIcon({ className = 'size-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6.5 8 10.5l4-4" />
    </svg>
  );
}
