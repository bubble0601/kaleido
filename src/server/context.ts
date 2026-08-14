import { realpathSync } from 'node:fs';

import type { RangeSpec } from '../shared/types.js';
import { FileContent } from './files/content.js';
import { loadViewerConfig, type ViewerConfig } from './files/config.js';
import { GitDiff } from './git/diff.js';
import { GitRefs } from './git/refs.js';
import { EventBus } from './events.js';
import { computeRepoId, ReviewStore } from './store/reviewStore.js';
import { TsWorkerClient } from './ts/workerClient.js';

export interface AppContext {
  /** 表示対象のルート。git リポジトリならその toplevel */
  rootDir: string;
  repoId: string;
  isGitRepo: boolean;
  initialRange: RangeSpec;
  config: ViewerConfig;
  /** 非 git ディレクトリでは null */
  gitDiff: GitDiff | null;
  gitRefs: GitRefs | null;
  fileContent: FileContent;
  tsService: TsWorkerClient;
  reviewStore: ReviewStore;
  eventBus: EventBus;
}

export function createAppContext(
  rootDir: string,
  initialRange: RangeSpec,
  options: {
    isGitRepo: boolean;
    isKeepAlive: boolean;
    excludes?: string[];
    onShutdown?: () => void;
  },
): AppContext {
  const realRoot = realpathSync(rootDir);
  const repoId = computeRepoId(realRoot);
  return {
    rootDir: realRoot,
    repoId,
    isGitRepo: options.isGitRepo,
    initialRange,
    config: loadViewerConfig(realRoot, options.excludes),
    gitDiff: options.isGitRepo ? new GitDiff(realRoot) : null,
    gitRefs: options.isGitRepo ? new GitRefs(realRoot) : null,
    fileContent: new FileContent(realRoot, options.isGitRepo),
    tsService: new TsWorkerClient(realRoot),
    reviewStore: new ReviewStore(repoId, realRoot),
    eventBus: new EventBus({ isKeepAlive: options.isKeepAlive, onShutdown: options.onShutdown }),
  };
}
