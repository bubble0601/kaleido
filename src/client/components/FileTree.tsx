import { Icon } from '@iconify/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FileStatus } from '../../shared/types';
import { FOLDER_ICON, FOLDER_OPENED_ICON, getFileTypeIconName } from '../utils/fileTypeIcons';

/**
 * ツリーに並べられる最小の情報。
 * diff 由来のエントリは status を持ち、単なるファイル一覧では持たない。
 */
export interface FileTreeEntry {
  path: string;
  status?: FileStatus;
}

interface TreeDir<T> {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeNode<T>[];
}

interface TreeFile<T> {
  kind: 'file';
  name: string;
  file: T;
}

type TreeNode<T> = TreeDir<T> | TreeFile<T>;

const STATUS_STYLE: Record<FileStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-green-600 dark:text-green-500' },
  deleted: { letter: 'D', className: 'text-red-600 dark:text-red-500' },
  modified: { letter: 'M', className: 'text-yellow-600 dark:text-yellow-500' },
  renamed: { letter: 'R', className: 'text-blue-500 dark:text-blue-400' },
};

function buildTree<T extends FileTreeEntry>(files: T[]): TreeNode<T>[] {
  const root: TreeDir<T> = { kind: 'dir', name: '', path: '', children: [] };
  for (const file of files) {
    const segments = file.path.split('/');
    let dir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i]!;
      const path = segments.slice(0, i + 1).join('/');
      let next = dir.children.find(
        (n): n is TreeDir<T> => n.kind === 'dir' && n.name === name,
      );
      if (!next) {
        next = { kind: 'dir', name, path, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ kind: 'file', name: segments[segments.length - 1]!, file });
  }
  // 単一子ディレクトリを畳む (a/b/c → a/b/c 表記)
  const compact = (node: TreeDir<T>): TreeDir<T> => {
    let current = node;
    while (
      current.children.length === 1 &&
      current.children[0]!.kind === 'dir' &&
      current.name !== ''
    ) {
      const only = current.children[0] as TreeDir<T>;
      current = { ...only, name: `${current.name}/${only.name}` };
    }
    return { ...current, children: current.children.map((c) => (c.kind === 'dir' ? compact(c) : c)) };
  };
  const sortNodes = (nodes: TreeNode<T>[]): TreeNode<T>[] =>
    [...nodes]
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => (n.kind === 'dir' ? { ...n, children: sortNodes(n.children) } : n));
  return sortNodes(compact(root).children);
}

export interface TreeFolding {
  isDirOpen: (path: string) => boolean;
  toggleDir: (path: string) => void;
  /** 既定で開いた状態か。ボタンの向きの判定に使う */
  isExpandedByDefault: boolean;
  collapseAll: () => void;
  expandAll: () => void;
}

function ancestorPaths(filePath: string): string[] {
  const segments = filePath.split('/');
  segments.pop();
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'));
}

/**
 * ツリーの開閉状態。個別の開閉は上書きとして持ち、
 * fold all / unfold all は「既定値」の方を切り替えて上書きを捨てる。
 * 選択中のファイルは常に見えるよう、その祖先だけ自動で開く。
 */
export function useTreeFolding(
  isInitiallyExpanded: boolean,
  selectedPath: string | null,
): TreeFolding {
  const [isExpandedByDefault, setIsExpandedByDefault] = useState(isInitiallyExpanded);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedPath) return;
    const ancestors = ancestorPaths(selectedPath);
    if (ancestors.length === 0) return;
    setOverrides((prev) => {
      if (ancestors.every((path) => prev[path])) return prev;
      const next = { ...prev };
      for (const path of ancestors) next[path] = true;
      return next;
    });
  }, [selectedPath]);

  const isDirOpen = useCallback(
    (path: string) => overrides[path] ?? isExpandedByDefault,
    [overrides, isExpandedByDefault],
  );
  const toggleDir = useCallback(
    (path: string) =>
      setOverrides((prev) => ({ ...prev, [path]: !(prev[path] ?? isExpandedByDefault) })),
    [isExpandedByDefault],
  );
  const collapseAll = useCallback(() => {
    setIsExpandedByDefault(false);
    setOverrides({});
  }, []);
  const expandAll = useCallback(() => {
    setIsExpandedByDefault(true);
    setOverrides({});
  }, []);

  return { isDirOpen, toggleDir, isExpandedByDefault, collapseAll, expandAll };
}

interface FileTreeProps<T extends FileTreeEntry> {
  files: T[];
  folding: TreeFolding;
  selectedPath: string | null;
  /** 省略時は既読表示なし (ファイル閲覧モード) */
  viewedPaths?: Set<string>;
  /** path → その範囲でのコメント数 */
  commentCounts?: Map<string, number>;
  onSelect: (path: string) => void;
  onToggleViewed?: (file: T, isViewed: boolean) => void;
}

export function FileTree<T extends FileTreeEntry>({
  files,
  folding,
  selectedPath,
  viewedPaths,
  commentCounts,
  onSelect,
  onToggleViewed,
}: FileTreeProps<T>) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="py-1 text-[13px] leading-6">
      <TreeLevel
        nodes={tree}
        depth={0}
        ctx={{ folding, selectedPath, viewedPaths, commentCounts, onSelect, onToggleViewed }}
      />
    </div>
  );
}

interface TreeContext<T> {
  folding: TreeFolding;
  selectedPath: string | null;
  viewedPaths?: Set<string>;
  commentCounts?: Map<string, number>;
  onSelect: (path: string) => void;
  onToggleViewed?: (file: T, isViewed: boolean) => void;
}

function TreeLevel<T extends FileTreeEntry>({
  nodes,
  depth,
  ctx,
}: {
  nodes: TreeNode<T>[];
  depth: number;
  ctx: TreeContext<T>;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow key={`dir:${node.path}`} node={node} depth={depth} ctx={ctx} />
        ) : (
          <FileRow key={node.file.path} node={node} depth={depth} ctx={ctx} />
        ),
      )}
    </>
  );
}

function CommentCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-blue-500 dark:text-blue-400"
      title={`${count} comment(s)`}
    >
      <svg viewBox="0 0 16 16" className="size-3 shrink-0" aria-hidden>
        <path
          d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H8.4L5 13.8V11H3.5A1.5 1.5 0 0 1 2 9.5z"
          fill="currentColor"
        />
      </svg>
      {count}
    </span>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DirRow<T extends FileTreeEntry>({
  node,
  depth,
  ctx,
}: {
  node: TreeDir<T>;
  depth: number;
  ctx: TreeContext<T>;
}) {
  const isOpen = ctx.folding.isDirOpen(node.path);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 text-left text-neutral-500 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => ctx.folding.toggleDir(node.path)}
      >
        <ChevronIcon isOpen={isOpen} />
        <Icon icon={isOpen ? FOLDER_OPENED_ICON : FOLDER_ICON} className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && <TreeLevel nodes={node.children} depth={depth + 1} ctx={ctx} />}
    </div>
  );
}

function FileRow<T extends FileTreeEntry>({
  node,
  depth,
  ctx,
}: {
  node: TreeFile<T>;
  depth: number;
  ctx: TreeContext<T>;
}) {
  const { selectedPath, viewedPaths, commentCounts, onSelect, onToggleViewed } = ctx;
  const { file } = node;
  const status = file.status ? STATUS_STYLE[file.status] : null;
  const isSelected = selectedPath === file.path;
  const isViewed = viewedPaths?.has(file.path) ?? false;
  return (
    <div
      className={`group flex w-full cursor-pointer items-center gap-1.5 px-2 ${
        isSelected
          ? 'bg-neutral-300/60 dark:bg-neutral-700/70'
          : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
      } ${isViewed ? 'opacity-50' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onSelect(file.path)}
    >
      {onToggleViewed && (
        <input
          type="checkbox"
          checked={isViewed}
          className="shrink-0 accent-neutral-500"
          title="Mark as viewed"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggleViewed(file, e.target.checked)}
        />
      )}
      <Icon icon={getFileTypeIconName(file.path)} className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={file.path}>
        {node.name}
      </span>
      <CommentCountBadge count={commentCounts?.get(file.path) ?? 0} />
      {status && (
        <span className={`w-3 shrink-0 text-center font-bold ${status.className}`}>
          {status.letter}
        </span>
      )}
    </div>
  );
}
