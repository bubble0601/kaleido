interface PdfPreviewProps {
  /** ルート相対のファイルパス */
  path: string;
}

/**
 * PDF をブラウザ内蔵のビューアで表示する。
 * working tree のファイルを /api/raw から配信したものを読み込む
 * (テキストとして差分を取れないため、過去のコミットの内容は見せない)。
 */
export function PdfPreview({ path }: PdfPreviewProps) {
  const src = `/api/raw?path=${encodeURIComponent(path)}`;
  return (
    <iframe
      key={src}
      src={src}
      title={`Preview of ${path}`}
      className="size-full border-0 bg-neutral-200 dark:bg-neutral-800"
    />
  );
}
