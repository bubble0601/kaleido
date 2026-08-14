import { Command } from 'commander';
import open from 'open';

import { formatAllCommentsPrompt } from '../shared/commentFormat.js';
import { describeRange, rangeKey } from '../shared/types.js';
import { startServer } from '../server/index.js';
import { openReviewStore } from '../server/store/reviewStore.js';
import { resolveViewerTarget } from './args.js';

const program = new Command();

const collect = (value: string, previous: string[]): string[] => [...previous, value];

program
  .name('kaleido')
  .description('Monaco-based local web file viewer with TypeScript hover, diff and review tools')
  .version('0.1.0');

program
  .command('serve', { isDefault: true })
  .description('start the viewer (default command)')
  .argument(
    '[target]',
    'directory to browse, commit-ish to view, or "working" / "staged" / "." (default: auto-detect)',
  )
  .argument('[base]', 'commit-ish to compare against (default: HEAD or <target>^)')
  .option('--port <port>', 'preferred port (auto-increments if taken)', '4890')
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--dir <path>', 'directory to open (default: current directory)')
  .option('--repo <path>', 'alias of --dir')
  .option('--exclude <pattern>', 'extra path pattern to hide from the file tree', collect, [])
  .option('--no-open', 'do not open the browser')
  .option('--no-keep-alive', 'shut down the server when all browser tabs are closed')
  .action(async (target: string | undefined, base: string | undefined, options) => {
    try {
      const { rootDir, isGitRepo, range } = resolveViewerTarget({
        cwd: process.cwd(),
        dir: options.dir ?? options.repo,
        target,
        base,
      });

      const printCommentsAndExit = (): never => {
        try {
          const comments = openReviewStore(rootDir).getComments(rangeKey(range));
          if (comments.length > 0) {
            console.log(`\n${comments.length} comment(s) for ${describeRange(range)}:\n`);
            console.log(formatAllCommentsPrompt(comments));
          }
        } catch {
          // 終了時出力は best effort
        }
        process.exit(0);
      };

      const { url } = await startServer({
        rootDir,
        isGitRepo,
        initialRange: range,
        excludes: options.exclude,
        port: parseInt(options.port, 10),
        host: options.host,
        isKeepAlive: options.keepAlive,
        onShutdown: printCommentsAndExit,
      });

      process.on('SIGINT', printCommentsAndExit);
      process.on('SIGTERM', printCommentsAndExit);

      console.log(`kaleido: ${describeRange(range)} @ ${rootDir}`);
      console.log(`  ${url}`);

      if (options.open) {
        await open(url);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('comments')
  .description('print saved comments for a range as an AI prompt')
  .argument('[target]', 'commit-ish, or "working" / "staged" / "." (default: ".")')
  .argument('[base]', 'commit-ish to compare against (default: HEAD or <target>^)')
  .option('--dir <path>', 'directory to read comments for (default: current directory)')
  .option('--repo <path>', 'alias of --dir')
  .option('--json', 'output as JSON instead of prompt text')
  .action((target: string | undefined, base: string | undefined, options) => {
    try {
      const { rootDir, range } = resolveViewerTarget({
        cwd: process.cwd(),
        dir: options.dir ?? options.repo,
        target,
        base,
      });
      const comments = openReviewStore(rootDir).getComments(rangeKey(range));

      if (options.json) {
        console.log(JSON.stringify(comments, null, 2));
        return;
      }
      if (comments.length === 0) {
        console.error(`No comments for ${describeRange(range)}`);
        process.exitCode = 1;
        return;
      }
      console.log(formatAllCommentsPrompt(comments));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
