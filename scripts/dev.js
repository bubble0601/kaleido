// 開発用ランナー: APIサーバー (tsx watch) と vite dev server を同時起動する。
// 対象リポジトリは KALEIDO_TARGET_REPO で指定 (既定はこのリポジトリ自身)。
import { spawn } from 'node:child_process';

const serverPort = process.env.KALEIDO_SERVER_PORT ?? '4890';
const targetRepo = process.env.KALEIDO_TARGET_REPO ?? process.cwd();
const cliArgs = process.argv.slice(2);

const server = spawn(
  'pnpm',
  [
    'exec', 'tsx', 'watch', 'src/cli/index.ts',
    ...cliArgs,
    '--no-open', '--port', serverPort, '--repo', targetRepo,
  ],
  { stdio: 'inherit', env: { ...process.env } },
);

const vite = spawn('pnpm', ['exec', 'vite', '--open'], {
  stdio: 'inherit',
  env: { ...process.env, KALEIDO_SERVER_PORT: serverPort },
});

const kill = () => {
  server.kill('SIGTERM');
  vite.kill('SIGTERM');
};
process.on('SIGINT', kill);
process.on('SIGTERM', kill);
server.on('exit', (code) => {
  if (code !== null && code !== 0) kill();
});
