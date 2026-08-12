import { Icon } from '@iconify/react';
import { useMemo, useState } from 'react';

import type { DiffFileMeta, FileStatus } from '../../shared/types';
import { getFileTypeIconName } from '../utils/fileTypeIcons';

interface TreeDir {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeNode[];
}

interface TreeFile {
  kind: 'file';
  name: string;
  file: DiffFileMeta;
}

type TreeNode = TreeDir | TreeFile;

const STATUS_STYLE: Record<FileStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-green-600 dark:text-green-500' },
  deleted: { letter: 'D', className: 'text-red-600 dark:text-red-500' },
  modified: { letter: 'M', className: 'text-yellow-600 dark:text-yellow-500' },
  renamed: { letter: 'R', className: 'text-blue-500 dark:text-blue-400' },
};

function buildTree(files: DiffFileMeta[]): TreeNode[] {
  const root: TreeDir = { kind: 'dir', name: '', path: '', children: [] };
  for (const file of files) {
    const segments = file.path.split('/');
    let dir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i]!;
      const path = segments.slice(0, i + 1).join('/');
      let next = dir.children.find(
        (n): n is TreeDir => n.kind === 'dir' && n.name === name,
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
  const compact = (node: TreeDir): TreeDir => {
    let current = node;
    while (
      current.children.length === 1 &&
      current.children[0]!.kind === 'dir' &&
      current.name !== ''
    ) {
      const only = current.children[0] as TreeDir;
      current = { ...only, name: `${current.name}/${only.name}` };
    }
    return { ...current, children: current.children.map((c) => (c.kind === 'dir' ? compact(c) : c)) };
  };
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes]
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => (n.kind === 'dir' ? { ...n, children: sortNodes(n.children) } : n));
  return sortNodes(compact(root).children);
}

interface FileTreeProps {
  files: DiffFileMeta[];
  selectedPath: string | null;
  viewedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleViewed?: (file: DiffFileMeta, isViewed: boolean) => void;
}

export function FileTree({ files, selectedPath, viewedPaths, onSelect, onToggleViewed }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="overflow-y-auto py-1 text-[13px] leading-6">
      <TreeLevel nodes={tree} depth={0} ctx={{ selectedPath, viewedPaths, onSelect, onToggleViewed }} />
    </div>
  );
}

interface TreeContext {
  selectedPath: string | null;
  viewedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleViewed?: (file: DiffFileMeta, isViewed: boolean) => void;
}

function TreeLevel({ nodes, depth, ctx }: { nodes: TreeNode[]; depth: number; ctx: TreeContext }) {
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

function DirRow({ node, depth, ctx }: { node: TreeDir; depth: number; ctx: TreeContext }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 text-left text-neutral-500 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="w-3 text-[10px]">{isOpen ? '▾' : '▸'}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && <TreeLevel nodes={node.children} depth={depth + 1} ctx={ctx} />}
    </div>
  );
}

function FileRow({ node, depth, ctx }: { node: TreeFile; depth: number; ctx: TreeContext }) {
  const { selectedPath, viewedPaths, onSelect, onToggleViewed } = ctx;
  const { file } = node;
  const status = STATUS_STYLE[file.status];
  const isSelected = selectedPath === file.path;
  const isViewed = viewedPaths.has(file.path);
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
      <span className={`w-3 shrink-0 text-center font-bold ${status.className}`}>{status.letter}</span>
      <Icon icon={getFileTypeIconName(file.path)} className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={file.path}>
        {node.name}
      </span>
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
    </div>
  );
}
