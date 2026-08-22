// 本番依存のライセンス一覧を src/client/generated/licenses.json に書き出す。
// 公開パッケージには node_modules が無いため、ビルド時に静的なデータへ落としておく。
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src/client/generated/licenses.json');

// customPath を渡さないと copyright (LICENSE から抽出した権利表記) が入らない
const formatPath = join(tmpdir(), `kaleido-license-format-${process.pid}.json`);
writeFileSync(
  formatPath,
  JSON.stringify({ name: '', version: '', licenses: '', repository: '', publisher: '', copyright: '' }),
);

let raw;
try {
  raw = execFileSync(
    'pnpm',
    [
      'exec',
      'license-checker-rseidelsohn',
      '--production',
      '--json',
      '--excludePrivatePackages',
      '--customPath',
      formatPath,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
} finally {
  rmSync(formatPath, { force: true });
}

/** "name@1.2.3" を name と version に割る (スコープ付きに注意) */
function splitId(id) {
  const at = id.lastIndexOf('@');
  return { name: id.slice(0, at), version: id.slice(at + 1) };
}

const entries = Object.entries(JSON.parse(raw))
  .map(([id, info]) => {
    const { name, version } = splitId(id);
    return {
      name,
      version,
      license: Array.isArray(info.licenses) ? info.licenses.join(' / ') : (info.licenses ?? 'UNKNOWN'),
      repository: info.repository ?? undefined,
      copyright: info.copyright ?? undefined,
      publisher: info.publisher ?? undefined,
    };
  })
  // 自分自身は載せない
  .filter((entry) => entry.name !== '@adanami/kaleido' && entry.name !== 'kaleido')
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`licenses: ${entries.length} packages -> ${outPath}`);
