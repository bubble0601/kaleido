interface ImagePreviewProps {
  /** ルート相対のファイルパス */
  path: string;
  /** どの断面を見せるか (省略時は working tree) */
  gitRef?: string;
}

/**
 * 画像を等倍以下で中央に表示する。
 * 差分は取れないので、指定された断面の中身を /api/raw から配信して見せる。
 */
export function ImagePreview({ path, gitRef }: ImagePreviewProps) {
  const src =
    `/api/raw?path=${encodeURIComponent(path)}` +
    (gitRef ? `&ref=${encodeURIComponent(gitRef)}` : '');
  return (
    <div className="flex size-full items-center justify-center overflow-auto bg-neutral-100 p-4 dark:bg-neutral-900">
      <img
        key={src}
        src={src}
        alt={path}
        // 透過画像が背景に溶けないよう、輪郭だけ薄く出す
        className="max-h-full max-w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      />
    </div>
  );
}
