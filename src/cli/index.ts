import { Command } from 'commander';
import open from 'open';

import { describeRange } from '../shared/types.js';
import { startServer } from '../server/index.js';
import { getGitRoot, resolveRange } from './args.js';

const program = new Command();

program
  .name('kaleido')
  .description('Monaco-based local web diff viewer with TypeScript hover and review tools')
  .version('0.1.0')
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

      const { url } = await startServer({
        repoRoot,
        initialRange: range,
        port: parseInt(options.port, 10),
        host: options.host,
        isKeepAlive: options.keepAlive,
      });

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

program.parse();
