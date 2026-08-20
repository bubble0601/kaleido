import { useEffect, useMemo } from 'react';

import type { DiffFileMeta, RangeSpec } from '../../shared/types';
import { useAllFiles, useDocFiles, useMeta } from '../hooks/queries';
import { useUiStore, type DocsSort, type SidebarTab } from '../state/store';
import { DocsRootSelector, type DocsRootOption } from './DocsRootSelector';
import { FileTree, useTreeFolding, type FileTreeEntry, type TreeFolding } from './FileTree';
import { RangeSelector } from './RangeSelector';

function docsRootKey(repoId: string): string {
  return `kaleido-docs-root:${repoId}`;
}

/** 読み物を含むディレクトリを、配下の件数付きで集める */
function collectDocsRoots(docs: { path: string }[]): DocsRootOption[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const segments = doc.path.split('/');
    segments.pop();
    for (let i = 1; i <= segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  // よく使うものが上に来るよう件数の多い順。ルート全体は常に先頭
  return [
    { path: '', count: docs.length },
    ...[...counts.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
  ];
}

const SECTION_LABELS: Record<SidebarTab, string> = {
  changes: 'Changes',
  files: 'Files',
  docs: 'Docs',
};

interface SidebarProps {
  /** 比較対象のファイル (非 git では常に空) */
  diffFiles: DiffFileMeta[];
  /** Activity Bar で選ばれている表示内容 */
  tab: SidebarTab;
  selectedPath: string | null;
  browsePath: string | null;
  viewedPaths: Set<string>;
  commentCounts: Map<string, number>;
  /** 比較範囲 (Changes のときだけ使う) */
  range: RangeSpec;
  onRangeChange: (range: RangeSpec) => void;
  onSelectDiffFile: (path: string) => void;
  /** どのタブから開いたかは、プレビューの既定モードの判断に使われる */
  onOpenFile: (path: string, from: SidebarTab) => void;
  onToggleViewed: (file: DiffFileMeta, isViewed: boolean) => void;
}

export function Sidebar({
  diffFiles,
  tab,
  selectedPath,
  browsePath,
  viewedPaths,
  commentCounts,
  range,
  onRangeChange,
  onSelectDiffFile,
  onOpenFile,
  onToggleViewed,
}: SidebarProps) {
  const docsSort = useUiStore((state) => state.docsSort);
  const setDocsSort = useUiStore((state) => state.setDocsSort);
  const allFiles = useAllFiles(tab === 'files');
  const docFiles = useDocFiles(tab === 'docs');
  const fileEntries = useMemo<FileTreeEntry[]>(
    () => (allFiles.data?.paths ?? []).map((path) => ({ path })),
    [allFiles.data],
  );
  const allDocs = useMemo(() => docFiles.data?.files ?? [], [docFiles.data]);

  // Docs の基点ディレクトリ。プロジェクトごとに覚える
  const meta = useMeta();
  const repoId = meta.data?.repoId;
  const docsRoot = useUiStore((state) => state.docsRoot);
  const setDocsRoot = useUiStore((state) => state.setDocsRoot);
  const rootOptions = useMemo(() => collectDocsRoots(allDocs), [allDocs]);
  useEffect(() => {
    if (!repoId) return;
    const stored = localStorage.getItem(docsRootKey(repoId)) ?? '';
    setDocsRoot(stored);
  }, [repoId, setDocsRoot]);
  // 保存されていた基点が今は存在しない場合はルート全体に戻す
  const effectiveRoot =
    docsRoot && rootOptions.some((option) => option.path === docsRoot) ? docsRoot : '';
  const changeDocsRoot = (root: string) => {
    if (repoId) localStorage.setItem(docsRootKey(repoId), root);
    setDocsRoot(root);
  };

  // 基点より下だけを、基点からの相対パスで見せる
  const prefix = effectiveRoot ? `${effectiveRoot}/` : '';
  const docEntries = useMemo<FileTreeEntry[]>(
    () =>
      allDocs
        .filter((entry) => entry.path.startsWith(prefix))
        .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) })),
    [allDocs, prefix],
  );

  // ツリー側は相対パスになるので、コメント数のキーも合わせる
  const docCommentCounts = useMemo(() => {
    if (!prefix) return commentCounts;
    const counts = new Map<string, number>();
    for (const [path, count] of commentCounts) {
      if (path.startsWith(prefix)) counts.set(path.slice(prefix.length), count);
    }
    return counts;
  }, [commentCounts, prefix]);

  // 比較対象は数が知れているので開いた状態、全ファイルと読み物は畳んだ状態から始める
  const activePath = browsePath ?? selectedPath;
  const activeDocPath =
    activePath && activePath.startsWith(prefix) ? activePath.slice(prefix.length) : null;
  const changesFolding = useTreeFolding(true, browsePath ? null : selectedPath);
  const filesFolding = useTreeFolding(false, activePath);
  const docsFolding = useTreeFolding(false, activeDocPath);
  const folding =
    tab === 'changes' ? changesFolding : tab === 'docs' ? docsFolding : filesFolding;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 pl-4 pr-1 text-[11px] font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        <span>{SECTION_LABELS[tab]}</span>
        {/* Files / Docs の件数は一覧を取得済みのときしか分からないため出さない */}
        {tab === 'changes' && diffFiles.length > 0 && (
          <span className="opacity-70">
            {viewedPaths.size}/{diffFiles.length} viewed
          </span>
        )}
        <div className="flex-1" />
        {tab === 'docs' && <DocsSortButton sort={docsSort} onChange={setDocsSort} />}
        <FoldAllButton folding={folding} />
      </div>

      {/* セレクタはツリーの外に置く (中に入れるとドロップダウンがクリップされる) */}
      {tab === 'changes' && (
        <div className="shrink-0 px-2 pb-2">
          <RangeSelector current={range} onChange={onRangeChange} />
        </div>
      )}
      {tab === 'docs' && rootOptions.length > 1 && (
        <div className="shrink-0 px-2 pb-2">
          <DocsRootSelector current={effectiveRoot} options={rootOptions} onChange={changeDocsRoot} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'changes' ? (
          diffFiles.length === 0 ? (
            <Placeholder>No changes</Placeholder>
          ) : (
            <FileTree
              files={diffFiles}
              folding={folding}
              selectedPath={browsePath ? null : selectedPath}
              viewedPaths={viewedPaths}
              commentCounts={commentCounts}
              onSelect={onSelectDiffFile}
              onToggleViewed={onToggleViewed}
            />
          )
        ) : tab === 'docs' ? (
          docFiles.isLoading ? (
            <Placeholder>Loading…</Placeholder>
          ) : docEntries.length === 0 ? (
            <Placeholder>No Markdown or HTML files</Placeholder>
          ) : (
            <FileTree
              files={docEntries}
              folding={folding}
              selectedPath={activeDocPath}
              commentCounts={docCommentCounts}
              onSelect={(path) => onOpenFile(`${prefix}${path}`, tab)}
              sort={docsSort}
            />
          )
        ) : allFiles.isLoading ? (
          <Placeholder>Loading…</Placeholder>
        ) : fileEntries.length === 0 ? (
          <Placeholder>No files</Placeholder>
        ) : (
          <>
            <FileTree
              files={fileEntries}
              folding={folding}
              selectedPath={activePath}
              commentCounts={commentCounts}
              onSelect={(path) => onOpenFile(path, tab)}
            />
            {allFiles.data?.isTruncated && (
              <Placeholder>
                Too many files — the list is truncated. Narrow it down with `exclude` in
                .kaleido.json.
              </Placeholder>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 現在の並び順をアイコンで示し、押すともう一方へ切り替える */
function DocsSortButton({
  sort,
  onChange,
}: {
  sort: DocsSort;
  onChange: (sort: DocsSort) => void;
}) {
  const isByTime = sort === 'mtime';
  return (
    <button
      type="button"
      className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
      title={isByTime ? 'Sorted by updated — switch to name' : 'Sorted by name — switch to updated'}
      aria-label={isByTime ? 'Sort by name' : 'Sort by updated'}
      onClick={() => onChange(isByTime ? 'name' : 'mtime')}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isByTime ? (
          <>
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 4.8V8l2.4 1.5" />
          </>
        ) : (
          <>
            <path d="M2 3.5h9M2 8h6M2 12.5h3" />
            <path d="M13 3.5v9M11 10.5l2 2 2-2" />
          </>
        )}
      </svg>
    </button>
  );
}

function FoldAllButton({ folding }: { folding: TreeFolding }) {
  const isExpanded = folding.isExpandedByDefault;
  return (
    <button
      type="button"
      className="mr-1 rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
      title={isExpanded ? 'Collapse all folders' : 'Expand all folders'}
      onClick={() => (isExpanded ? folding.collapseAll() : folding.expandAll())}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isExpanded ? (
          <>
            <path d="M4 7l4-4 4 4" />
            <path d="M4 9l4 4 4-4" />
          </>
        ) : (
          <>
            <path d="M4 2l4 4 4-4" />
            <path d="M4 14l4-4 4 4" />
          </>
        )}
      </svg>
    </button>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500">{children}</div>;
}
