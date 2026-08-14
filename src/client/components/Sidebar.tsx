import { useMemo } from 'react';

import type { DiffFileMeta } from '../../shared/types';
import { useAllFiles } from '../hooks/queries';
import { useUiStore, type SidebarTab } from '../state/store';
import { isDocumentPath } from '../utils/preview';
import { FileTree, useTreeFolding, type FileTreeEntry, type TreeFolding } from './FileTree';

interface SidebarProps {
  /** 比較対象のファイル (非 git では常に空) */
  diffFiles: DiffFileMeta[];
  /** 比較機能が使えるか。false のときは Changes タブを出さない */
  isGitRepo: boolean;
  selectedPath: string | null;
  browsePath: string | null;
  viewedPaths: Set<string>;
  commentCounts: Map<string, number>;
  onSelectDiffFile: (path: string) => void;
  /** どのタブから開いたかは、プレビューの既定モードの判断に使われる */
  onOpenFile: (path: string, from: SidebarTab) => void;
  onToggleViewed: (file: DiffFileMeta, isViewed: boolean) => void;
}

export function Sidebar({
  diffFiles,
  isGitRepo,
  selectedPath,
  browsePath,
  viewedPaths,
  commentCounts,
  onSelectDiffFile,
  onOpenFile,
  onToggleViewed,
}: SidebarProps) {
  const storedTab = useUiStore((state) => state.sidebarTab);
  const setSidebarTab = useUiStore((state) => state.setSidebarTab);
  const tab: SidebarTab = !isGitRepo && storedTab === 'changes' ? 'files' : storedTab;

  const allFiles = useAllFiles(tab !== 'changes');
  const paths = useMemo(() => allFiles.data?.paths ?? [], [allFiles.data]);
  const fileEntries = useMemo<FileTreeEntry[]>(
    () => paths.map((path) => ({ path })),
    [paths],
  );
  const docEntries = useMemo<FileTreeEntry[]>(
    () => paths.filter(isDocumentPath).map((path) => ({ path })),
    [paths],
  );

  // 比較対象と読み物は数が知れているので開いた状態、全ファイルは畳んだ状態から始める
  const activePath = browsePath ?? selectedPath;
  const changesFolding = useTreeFolding(true, browsePath ? null : selectedPath);
  const filesFolding = useTreeFolding(false, activePath);
  const docsFolding = useTreeFolding(true, activePath);
  const folding =
    tab === 'changes' ? changesFolding : tab === 'docs' ? docsFolding : filesFolding;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-neutral-200 text-xs dark:border-neutral-800">
        {isGitRepo && (
          <TabButton
            label="Changes"
            count={diffFiles.length}
            isActive={tab === 'changes'}
            onClick={() => setSidebarTab('changes')}
          />
        )}
        <TabButton label="Files" isActive={tab === 'files'} onClick={() => setSidebarTab('files')} />
        {/* 件数はファイル一覧を取得済みのときしか分からないため出さない */}
        <TabButton label="Docs" isActive={tab === 'docs'} onClick={() => setSidebarTab('docs')} />
        <div className="flex-1" />
        <FoldAllButton folding={folding} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : allFiles.isLoading ? (
          <Placeholder>Loading…</Placeholder>
        ) : tab === 'docs' ? (
          docEntries.length === 0 ? (
            <Placeholder>No Markdown or HTML files</Placeholder>
          ) : (
            <FileTree
              files={docEntries}
              folding={folding}
              selectedPath={activePath}
              commentCounts={commentCounts}
              onSelect={(path) => onOpenFile(path, tab)}
            />
          )
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

function TabButton({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`border-b-2 px-4 py-1.5 ${
        isActive
          ? 'border-blue-500 font-medium text-neutral-800 dark:text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      }`}
      onClick={onClick}
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-60">{count}</span>}
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
