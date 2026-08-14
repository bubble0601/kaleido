import { useMemo } from 'react';

import type { DiffFileMeta } from '../../shared/types';
import { useAllFiles } from '../hooks/queries';
import { useUiStore, type SidebarTab } from '../state/store';
import { FileTree, type FileTreeEntry } from './FileTree';

interface SidebarProps {
  /** 比較対象のファイル (非 git では常に空) */
  diffFiles: DiffFileMeta[];
  /** 比較機能が使えるか。false のときは Files タブのみ */
  isGitRepo: boolean;
  selectedPath: string | null;
  browsePath: string | null;
  viewedPaths: Set<string>;
  commentCounts: Map<string, number>;
  onSelectDiffFile: (path: string) => void;
  onOpenFile: (path: string) => void;
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
  const tab: SidebarTab = isGitRepo ? storedTab : 'files';

  const allFiles = useAllFiles(tab === 'files');
  const entries = useMemo<FileTreeEntry[]>(
    () => (allFiles.data?.paths ?? []).map((path) => ({ path })),
    [allFiles.data],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isGitRepo && (
        <div className="flex shrink-0 border-b border-neutral-200 text-xs dark:border-neutral-800">
          <TabButton
            label="Changes"
            count={diffFiles.length}
            isActive={tab === 'changes'}
            onClick={() => setSidebarTab('changes')}
          />
          <TabButton
            label="Files"
            isActive={tab === 'files'}
            onClick={() => setSidebarTab('files')}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'changes' ? (
          diffFiles.length === 0 ? (
            <Placeholder>No changes</Placeholder>
          ) : (
            <FileTree
              files={diffFiles}
              selectedPath={browsePath ? null : selectedPath}
              viewedPaths={viewedPaths}
              commentCounts={commentCounts}
              onSelect={onSelectDiffFile}
              onToggleViewed={onToggleViewed}
            />
          )
        ) : allFiles.isLoading ? (
          <Placeholder>Loading…</Placeholder>
        ) : entries.length === 0 ? (
          <Placeholder>No files</Placeholder>
        ) : (
          <>
            <FileTree
              files={entries}
              selectedPath={browsePath ?? selectedPath}
              commentCounts={commentCounts}
              onSelect={onOpenFile}
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
      className={`flex-1 border-b-2 px-3 py-1.5 ${
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500">{children}</div>;
}
