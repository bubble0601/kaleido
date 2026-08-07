import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

import type { RangeSpec } from '../shared/types.js';
import { GitContent } from './git/content.js';
import { GitDiff } from './git/diff.js';
import { GitRefs } from './git/refs.js';
import { EventBus } from './events.js';
import { ReviewStore } from './store/reviewStore.js';
import { TsService } from './ts/service.js';

export interface AppContext {
  repoRoot: string;
  repoId: string;
  initialRange: RangeSpec;
  gitDiff: GitDiff;
  gitContent: GitContent;
  gitRefs: GitRefs;
  tsService: TsService;
  reviewStore: ReviewStore;
  eventBus: EventBus;
}

export function createAppContext(
  repoRoot: string,
  initialRange: RangeSpec,
  options: { isKeepAlive: boolean },
): AppContext {
  const realRoot = realpathSync(repoRoot);
  const repoId = createHash('sha256').update(realRoot).digest('hex').slice(0, 16);
  return {
    repoRoot: realRoot,
    repoId,
    initialRange,
    gitDiff: new GitDiff(realRoot),
    gitContent: new GitContent(realRoot),
    gitRefs: new GitRefs(realRoot),
    tsService: new TsService(realRoot),
    reviewStore: new ReviewStore(repoId, realRoot),
    eventBus: new EventBus({ isKeepAlive: options.isKeepAlive }),
  };
}
