interface PdfPreviewProps {
  /** ルート相対のファイルパス */
  path: string;
  /** どの断面を見せるか (省略時は working tree) */
  gitRef?: string;
}

/**
 * PDF をブラウザ内蔵のビューアで表示する。
 * 差分は取れないので、指定された断面の中身を /api/raw から配信して見せる。
 */
export function PdfPreview({ path, gitRef }: PdfPreviewProps) {
  const src =
    `/api/raw?path=${encodeURIComponent(path)}` +
    (gitRef ? `&ref=${encodeURIComponent(gitRef)}` : '');
  return (
    <iframe
      key={src}
      src={src}
      title={`Preview of ${path}`}
      className="size-full border-0 bg-neutral-200 dark:bg-neutral-800"
    />
  );
}
