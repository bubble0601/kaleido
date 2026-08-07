import { useCallback, useEffect, useMemo, useRef } from 'react';

import { DiffView } from './components/DiffView';
import { FileTree } from './components/FileTree';
import { Toolbar } from './components/Toolbar';
import { useDiff, useFileContent, useLint, useMeta, useTsDiagnostics } from './hooks/queries';
import { computeViewedPaths, useComments, useViewed } from './hooks/review';
import { useSse } from './hooks/useSse';
import { RangeSelector } from './components/RangeSelector';
import { useUiStore } from './state/store';
import { copyToClipboard, formatAllCommentsPrompt } from './utils/commentFormat';
import { getInitialUrlPath, getInitialUrlRange, syncUrl } from './utils/urlState';

export function App() {
  const meta = useMeta();
  useSse();
  const { range, selectedPath, viewMode, setRange, setSelectedPath, setViewMode } = useUiStore();

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
      startLine: number;
      endLine: number;
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
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-900">
          {files.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500">No changes</div>
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
        <main className="min-w-0 flex-1">
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
        </main>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      {children}
    </div>
  );
}
