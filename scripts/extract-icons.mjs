// fileTypeIcons.ts が参照する vscode-icons のサブセットを抽出して
// src/client/generated/vscodeIcons.json に書き出す。
// アイコンのマッピングを変えたら `node scripts/extract-icons.mjs` を再実行すること。
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { getIcons } from '@iconify/utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const source = readFileSync(join(root, 'src/client/utils/fileTypeIcons.ts'), 'utf8');
const names = [...new Set([...source.matchAll(/vscode-icons:([a-z0-9-]+)/g)].map((m) => m[1]))];

const collection = require('@iconify-json/vscode-icons/icons.json');
const subset = getIcons(collection, names);
if (!subset) {
  throw new Error('Failed to extract icons');
}

const missing = names.filter((n) => !subset.icons?.[n] && !subset.aliases?.[n]);
if (missing.length > 0) {
  console.warn('Missing icons:', missing.join(', '));
}

const outDir = join(root, 'src/client/generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'vscodeIcons.json'), JSON.stringify(subset));
console.log(`Extracted ${names.length} icons (${missing.length} missing)`);
