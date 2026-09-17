interface ImagePreviewProps {
  /** ルート相対のファイルパス */
  path: string;
}

/**
 * 画像を等倍以下で中央に表示する。
 * working tree のファイルを /api/raw から配信したものを読み込む。
 */
export function ImagePreview({ path }: ImagePreviewProps) {
  const src = `/api/raw?path=${encodeURIComponent(path)}`;
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
