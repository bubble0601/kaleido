interface HtmlPreviewProps {
  /** ルート相対のファイルパス */
  path: string;
  /** 内容が変わったら iframe を読み直すためのキー */
  version: string;
}

/**
 * HTML ファイルをそのままレンダリングして表示する。
 *
 * 相対パスの CSS / JS / 画像を読めるようにするため、srcdoc ではなく
 * サーバーの /preview から配信したものを読み込む。スクリプトは動くが
 * allow-same-origin を与えないので opaque origin のままで、ビューア本体の
 * DOM や localStorage には触れない。API 側も Origin を見て弾いている。
 */
export function HtmlPreview({ path, version }: HtmlPreviewProps) {
  const src = `/preview/${path.split('/').map(encodeURIComponent).join('/')}?v=${version}`;
  return (
    <iframe
      key={src}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
      src={src}
      title={`Preview of ${path}`}
      className="size-full border-0 bg-white"
    />
  );
}

/** 内容が変わったときだけ iframe を読み直すための簡易ハッシュ */
export function contentVersion(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
