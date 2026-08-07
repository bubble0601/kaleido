// fileTypeIcons.ts が使う vscode-icons のサブセットをオフライン登録する。
// (@iconify/react は既定で API から動的取得するため、ローカルツールでは同梱データを使う)
// サブセットは scripts/extract-icons.mjs で生成。マッピング変更時は再実行すること。
import { addCollection } from '@iconify/react';

import vscodeIconsSubset from '../generated/vscodeIcons.json';

let isRegistered = false;

export function registerIconCollections(): void {
  if (isRegistered) return;
  isRegistered = true;
  addCollection(vscodeIconsSubset);
}
