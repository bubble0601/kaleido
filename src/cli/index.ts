import { Command } from 'commander';
import open from 'open';

import { formatAllCommentsPrompt } from '../shared/commentFormat.js';
import { describeRange, rangeKey } from '../shared/types.js';
import { startServer } from '../server/index.js';
import { openReviewStore } from '../server/store/reviewStore.js';
import { getGitRoot, resolveRange } from './args.js';

const program = new Command();

program
  .name('kaleido')
  .description('Monaco-based local web diff viewer with TypeScript hover and review tools')
  .version('0.1.0');

program
  .command('serve', { isDefault: true })
  .description('start the diff viewer (default command)')
  .argument('[target]', 'commit-ish to view, or "working" / "staged" / "." (default: ".")')
  .argument('[base]', 'commit-ish to compare against (default: HEAD or <target>^)')
  .option('--port <port>', 'preferred port (auto-increments if taken)', '4890')
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--repo <path>', 'repository path (default: current directory)')
  .option('--no-open', 'do not open the browser')
  .option('--no-keep-alive', 'shut down the server when all browser tabs are closed')
  .action(async (target: string | undefined, base: string | undefined, options) => {
    try {
      const repoRoot = getGitRoot(options.repo ?? process.cwd());
      const range = resolveRange(target, base);

      const printCommentsAndExit = (): never => {
        try {
          const comments = openReviewStore(repoRoot).getComments(rangeKey(range));
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
        repoRoot,
        initialRange: range,
        port: parseInt(options.port, 10),
        host: options.host,
        isKeepAlive: options.keepAlive,
        onShutdown: printCommentsAndExit,
      });

      process.on('SIGINT', printCommentsAndExit);
      process.on('SIGTERM', printCommentsAndExit);

      console.log(`kaleido: ${describeRange(range)} @ ${repoRoot}`);
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
  .description('print saved comments for a diff range as an AI prompt')
  .argument('[target]', 'commit-ish, or "working" / "staged" / "." (default: ".")')
  .argument('[base]', 'commit-ish to compare against (default: HEAD or <target>^)')
  .option('--repo <path>', 'repository path (default: current directory)')
  .option('--json', 'output as JSON instead of prompt text')
  .action((target: string | undefined, base: string | undefined, options) => {
    try {
      const repoRoot = getGitRoot(options.repo ?? process.cwd());
      const range = resolveRange(target, base);
      const comments = openReviewStore(repoRoot).getComments(rangeKey(range));

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
