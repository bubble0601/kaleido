import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommentCard, CommentForm } from './components/comments/CommentWidgets';
import { DiffView } from './components/DiffView';
import { FileTree } from './components/FileTree';
import { Toolbar } from './components/Toolbar';
import { useDiff, useFileContent, useLint, useMeta, useTsDiagnostics } from './hooks/queries';
import { isFileLevelComment } from '../shared/types';
import { computeViewedPaths, useComments, useViewed } from './hooks/review';
import { useSse } from './hooks/useSse';
import { monaco } from './monaco/setup';
import { RangeSelector } from './components/RangeSelector';
import { useUiStore } from './state/store';
import { copyToClipboard, formatAllCommentsPrompt } from './utils/commentFormat';
import { getInitialUrlPath, getInitialUrlRange, syncUrl } from './utils/urlState';

export function App() {
  const meta = useMeta();
  useSse();
  const { range, selectedPath, viewMode, theme, setRange, setSelectedPath, setViewMode } =
    useUiStore();

  // テーマを html クラスと Monaco に反映
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
  }, [theme]);

  useEffect(() => {
    if (meta.data && !range) {
      setRange(getInitialUrlRange() ?? meta.data.initialRange);
    }
  }, [meta.data, range, setRange]);

  const diff = useDiff(range);
  const files = useMemo(() => diff.data?.files ?? [], [diff.data]);

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? null,
    [files, selectedPath],
  );

  // 初期選択 (初回は URL の path を優先) とファイル消滅時のフォールバック
  const hasRestoredUrlPathRef = useRef(false);
  useEffect(() => {
    if (files.length === 0 || selectedFile) return;
    if (!hasRestoredUrlPathRef.current) {
      hasRestoredUrlPathRef.current = true;
      const urlPath = getInitialUrlPath();
      if (urlPath && files.some((f) => f.path === urlPath)) {
        setSelectedPath(urlPath);
        return;
      }
    }
    setSelectedPath(files[0]!.path);
  }, [files, selectedFile, setSelectedPath]);

  // 範囲・選択ファイルを URL に反映 (リロード・共有用)
  useEffect(() => {
    syncUrl(range, selectedPath);
  }, [range, selectedPath]);

  const [isFileCommentOpen, setIsFileCommentOpen] = useState(false);
  useEffect(() => setIsFileCommentOpen(false), [selectedPath, range]);

  const contents = useFileContent(range, selectedFile);
  const tsDiagnostics = useTsDiagnostics(selectedFile, contents.data);
  const lint = useLint(range, files);
  const diagnostics = useMemo(() => {
    const ts = tsDiagnostics.data ?? [];
    const eslint = selectedFile ? (lint.data?.results[selectedFile.path] ?? []) : [];
    return [...ts, ...eslint];
  }, [tsDiagnostics.data, lint.data, selectedFile]);

  const { query: commentsQuery, create, update, remove } = useComments(range);
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);
  const fileLevelComments = useMemo(
    () => comments.filter((c) => selectedFile && c.path === selectedFile.path && isFileLevelComment(c)),
    [comments, selectedFile],
  );

  const { query: viewedQuery, toggle: toggleViewed } = useViewed();
  const viewedPaths = useMemo(
    () => computeViewedPaths(files, viewedQuery.data?.entries),
    [files, viewedQuery.data],
  );

  const selectNext = useCallback(
    (delta: 1 | -1) => {
      const index = files.findIndex((f) => f.path === selectedPath);
      const next = index + delta;
      if (next >= 0 && next < files.length) {
        setSelectedPath(files[next]!.path);
      }
    },
    [files, selectedPath, setSelectedPath],
  );

  // j/k: ファイル移動, v: viewed トグル (viewed にしたときは次ファイルへ)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') selectNext(1);
      if (e.key === 'k') selectNext(-1);
      if (e.key === 'v' && selectedFile) {
        const willBeViewed = !viewedPaths.has(selectedFile.path);
        toggleViewed.mutate({ file: selectedFile, isViewed: willBeViewed });
        if (willBeViewed) selectNext(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectNext, selectedFile, toggleViewed, viewedPaths]);

  const handleCreateComment = useCallback(
    (params: {
      side: 'original' | 'modified';
      startLine?: number;
      endLine?: number;
      body: string;
      codeSnapshot?: string;
    }) => {
      if (!selectedFile) return;
      create.mutate({ path: selectedFile.path, ...params });
    },
    [create, selectedFile],
  );
  const handleUpdateComment = useCallback(
    (id: string, body: string) => update.mutate({ id, body }),
    [update],
  );
  const handleDeleteComment = useCallback((id: string) => remove.mutate(id), [remove]);

  if (meta.isError) {
    return <Centered>Failed to connect to the kaleido server.</Centered>;
  }
  if (!range || diff.isLoading) {
    return <Centered>Loading…</Centered>;
  }
  if (diff.isError) {
    return <Centered>{(diff.error as Error).message}</Centered>;
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        rangeLabel={diff.data?.label ?? ''}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewedCount={viewedPaths.size}
        totalCount={files.length}
        commentCount={comments.length}
        onCopyAllComments={() => void copyToClipboard(formatAllCommentsPrompt(comments))}
      >
        <RangeSelector current={range} onChange={setRange} />
      </Toolbar>
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          {files.length === 0 ? (
            <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500">No changes</div>
          ) : (
            <FileTree
              files={files}
              selectedPath={selectedPath}
              viewedPaths={viewedPaths}
              onSelect={setSelectedPath}
              onToggleViewed={(file, isViewed) => toggleViewed.mutate({ file, isViewed })}
            />
          )}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          {selectedFile && (
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
              <span className="truncate font-mono text-neutral-600 dark:text-neutral-300" title={selectedFile.path}>
                {selectedFile.path}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                title="Comment on the whole file"
                onClick={() => setIsFileCommentOpen(true)}
              >
                + File comment
              </button>
            </div>
          )}
          {selectedFile && (isFileCommentOpen || fileLevelComments.length > 0) && (
            <div className="max-h-64 shrink-0 overflow-y-auto border-b border-neutral-200 bg-neutral-50 py-1 dark:border-neutral-800 dark:bg-neutral-900/40">
              {fileLevelComments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onUpdate={handleUpdateComment}
                  onDelete={handleDeleteComment}
                />
              ))}
              {isFileCommentOpen && (
                <CommentForm
                  onSubmit={(body) => {
                    handleCreateComment({ side: 'modified', body });
                    setIsFileCommentOpen(false);
                  }}
                  onCancel={() => setIsFileCommentOpen(false)}
                />
              )}
            </div>
          )}
          <div className="min-h-0 flex-1">
          {selectedFile && range && (selectedFile.isBinary || contents.data) ? (
            <DiffView
              range={range}
              file={selectedFile}
              contents={
                contents.data ?? { original: null, modified: null, isTooLarge: false }
              }
              viewMode={viewMode}
              diagnostics={diagnostics}
              comments={comments}
              onCreateComment={handleCreateComment}
              onUpdateComment={handleUpdateComment}
              onDeleteComment={handleDeleteComment}
            />
          ) : (
            <Centered>{files.length === 0 ? 'No changes to show' : 'Loading file…'}</Centered>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
      {children}
    </div>
  );
}
