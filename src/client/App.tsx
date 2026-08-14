import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommentCard, CommentForm } from './components/comments/CommentWidgets';
import { DiffView } from './components/DiffView';
import { FileTree } from './components/FileTree';
import { CommentsPanel } from './components/CommentsPanel';
import { QuickOpen } from './components/QuickOpen';
import { Toolbar } from './components/Toolbar';
import { useDiff, useFileContent, useLint, useMeta, useTsDiagnostics } from './hooks/queries';
import { isFileLevelComment, type Comment, type RangeSpec } from '../shared/types';
import { api } from './services/api';
import { computeViewedPaths, useComments, useViewed } from './hooks/review';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useSse } from './hooks/useSse';
import { monaco } from './monaco/setup';
import { RangeSelector } from './components/RangeSelector';
import { useUiStore } from './state/store';
import { setFileOpenHandler } from './monaco/navigation';

type ICodeEditor = import('monaco-editor/editor/editor.api.js').editor.ICodeEditor;
import { getInitialUrlPath, getInitialUrlRange, syncUrl } from './utils/urlState';

export function App() {
  const queryClient = useQueryClient();
  const meta = useMeta();
  useSse();
  const {
    range,
    selectedPath,
    browsePath,
    viewMode,
    theme,
    setRange,
    setSelectedPath,
    setBrowsePath,
    setViewMode,
  } = useUiStore();
  const setPendingReveal = useUiStore((state) => state.setPendingReveal);
  const pendingReveal = useUiStore((state) => state.pendingReveal);
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false);

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

  const selectedFile = useMemo(() => {
    if (browsePath) {
      const inDiff = files.find((f) => f.path === browsePath);
      if (inDiff) return inDiff;
      return {
        path: browsePath,
        status: 'added',
        additions: 0,
        deletions: 0,
        isBinary: false,
        contentHash: `browse:${browsePath}`,
      } satisfies (typeof files)[number];
    }
    return files.find((f) => f.path === selectedPath) ?? null;
  }, [files, selectedPath, browsePath]);

  // 初期選択 (初回は URL の path を優先) とファイル消滅時のフォールバック
  const hasRestoredUrlPathRef = useRef(false);
  useEffect(() => {
    if (browsePath) return;
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
  }, [files, selectedFile, browsePath, setSelectedPath]);

  // Go to Definition などからのファイルオープン要求
  useEffect(() => {
    setFileOpenHandler((target) => {
      setPendingReveal(target);
      if (files.some((f) => f.path === target.path)) {
        setSelectedPath(target.path);
      } else {
        setBrowsePath(target.path);
      }
    });
    return () => setFileOpenHandler(null);
  }, [files, setSelectedPath, setBrowsePath, setPendingReveal]);

  // 範囲・選択ファイルを URL に反映 (リロード・共有用)
  useEffect(() => {
    syncUrl(range, selectedPath);
  }, [range, selectedPath]);

  const [isFileCommentOpen, setIsFileCommentOpen] = useState(false);
  useEffect(() => setIsFileCommentOpen(false), [selectedPath, range]);

  // 編集・保存 (modified 側が working tree のときのみ)
  const editTargetRef = useRef<ICodeEditor | null>(null);
  const handleEditTargetChange = useCallback((editor: ICodeEditor | null) => {
    editTargetRef.current = editor;
  }, []);
  const [isDirty, setIsDirty] = useState(false);
  const handleDirtyChange = useCallback((dirty: boolean) => setIsDirty(dirty), []);
  useEffect(() => setIsDirty(false), [selectedPath, browsePath, range]);

  // fold all / unfold all (対象エディタは DiffView から通知される)
  const foldTargetsRef = useRef<ICodeEditor[]>([]);
  const handleFoldTargetsChange = useCallback((editors: ICodeEditor[]) => {
    foldTargetsRef.current = editors;
  }, []);
  const [isAllFolded, setIsAllFolded] = useState(false);
  const toggleFoldAll = useCallback(() => {
    const actionId = isAllFolded ? 'editor.unfoldAll' : 'editor.foldAll';
    for (const editor of foldTargetsRef.current) {
      void editor.getAction(actionId)?.run();
    }
    setIsAllFolded(!isAllFolded);
  }, [isAllFolded]);

  // 新規ファイルは diff の左側が空で無駄なため、既定で File 表示にする。
  // モードボタンで明示的に切り替えた場合はそのファイルに限り従う。
  const [modeOverridePath, setModeOverridePath] = useState<string | null>(null);
  const effectiveViewMode = browsePath
    ? 'file'
    : selectedFile?.status === 'added' && modeOverridePath !== selectedFile.path
      ? 'file'
      : viewMode;

  useEffect(() => setIsAllFolded(false), [selectedPath, browsePath, effectiveViewMode]);

  const contents = useFileContent(range, selectedFile);
  const isEditable = contents.data?.modified?.ref === 'working' && !contents.data.isTooLarge;
  const saveFile = useCallback(async () => {
    const editor = editTargetRef.current;
    if (!editor || !selectedFile) return;
    try {
      await api.saveFile(selectedFile.path, editor.getValue());
      setIsDirty(false);
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [selectedFile, queryClient]);

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

  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    }
    return counts;
  }, [comments]);

  const sidebar = useSidebarResize();

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
      // 保存はエディタ (textarea) にフォーカスがあっても受け付ける
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) void saveFile();
        return;
      }
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        sidebar.toggle();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setIsQuickOpenVisible(true);
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
  }, [selectNext, selectedFile, toggleViewed, viewedPaths, sidebar, isDirty, saveFile]);

  // コメント全クリア + Undo スナックバー (消えるまでの間だけ復元できる)
  const [clearSnackbar, setClearSnackbar] = useState<{
    comments: Comment[];
    range: RangeSpec;
  } | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissSnackbar = useCallback(() => {
    if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    snackbarTimerRef.current = null;
    setClearSnackbar(null);
  }, []);
  const clearAllComments = useCallback(async () => {
    if (!range) return;
    try {
      const { comments: deleted } = await api.clearComments(range);
      await queryClient.invalidateQueries({ queryKey: ['comments'] });
      if (deleted.length === 0) return;
      if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
      setClearSnackbar({ comments: deleted, range });
      snackbarTimerRef.current = setTimeout(() => setClearSnackbar(null), 10_000);
    } catch (error) {
      console.error('Failed to clear comments:', error);
    }
  }, [range, queryClient]);
  const undoClearComments = useCallback(async () => {
    if (!clearSnackbar) return;
    try {
      await api.restoreComments(clearSnackbar.range, clearSnackbar.comments);
      await queryClient.invalidateQueries({ queryKey: ['comments'] });
      dismissSnackbar();
    } catch (error) {
      console.error('Failed to restore comments:', error);
    }
  }, [clearSnackbar, queryClient, dismissSnackbar]);

  // コメント一覧からのジャンプ (Go to Definition と同じ経路)
  const jumpToComment = useCallback(
    (comment: Comment) => {
      setPendingReveal({ path: comment.path, line: comment.startLine ?? 1, column: 1 });
      if (files.some((f) => f.path === comment.path)) {
        setSelectedPath(comment.path);
      } else {
        setBrowsePath(comment.path);
      }
    },
    [files, setPendingReveal, setSelectedPath, setBrowsePath],
  );

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
        isSidebarCollapsed={sidebar.isCollapsed}
        onToggleSidebar={sidebar.toggle}
        onOpenQuickOpen={() => setIsQuickOpenVisible(true)}
        viewMode={effectiveViewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          setModeOverridePath(selectedPath);
        }}
        viewedCount={viewedPaths.size}
        totalCount={files.length}
      >
        <CommentsPanel comments={comments} onJump={jumpToComment} onClearAll={() => void clearAllComments()} />
        <RangeSelector current={range} onChange={setRange} />
      </Toolbar>
      <QuickOpen
        isOpen={isQuickOpenVisible}
        onClose={() => setIsQuickOpenVisible(false)}
        onSelect={(path) => {
          if (files.some((f) => f.path === path)) {
            setSelectedPath(path);
          } else {
            setBrowsePath(path);
          }
        }}
      />
      {clearSnackbar && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 shadow-2xl dark:bg-neutral-700">
          <span>
            Cleared {clearSnackbar.comments.length} comment
            {clearSnackbar.comments.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="font-semibold text-blue-300 hover:text-blue-200"
            onClick={() => void undoClearComments()}
          >
            Undo
          </button>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-200"
            title="Dismiss"
            onClick={dismissSnackbar}
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!sidebar.isCollapsed && (
          <aside
            style={{ width: sidebar.width }}
            className="shrink-0 overflow-y-auto bg-neutral-50 dark:bg-neutral-900"
          >
            {files.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500">No changes</div>
            ) : (
              <FileTree
                files={files}
                selectedPath={selectedPath}
                viewedPaths={viewedPaths}
                commentCounts={commentCounts}
                onSelect={setSelectedPath}
                onToggleViewed={(file, isViewed) => toggleViewed.mutate({ file, isViewed })}
              />
            )}
          </aside>
        )}
        {/* リサイザ: ドラッグで幅調整、閾値以下で折り畳み、ダブルクリックでトグル (⌘B でも) */}
        <div
          className="w-1 shrink-0 cursor-col-resize border-l border-neutral-200 transition-colors hover:bg-blue-500/60 active:bg-blue-500/60 dark:border-neutral-800"
          title="Drag to resize (double-click or ⌘B to toggle)"
          onMouseDown={sidebar.startResize}
          onDoubleClick={sidebar.toggle}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {selectedFile && (
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
              <span className="truncate font-mono text-neutral-600 dark:text-neutral-300" title={selectedFile.path}>
                {selectedFile.path}
              </span>
              {isDirty && (
                <span className="shrink-0 text-yellow-500" title="Unsaved changes">
                  ●
                </span>
              )}
              <div className="flex-1" />
              {isEditable && (
                <button
                  type="button"
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-400 dark:hover:bg-neutral-700"
                  title="Save (⌘S)"
                  disabled={!isDirty}
                  onClick={() => void saveFile()}
                >
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2.5 2.5h9L13.5 5v8.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-11z" />
                    <path d="M5 2.5V6h5V2.5" />
                    <path d="M4.5 14v-4.5h7V14" />
                  </svg>
                </button>
              )}
              {/* DiffEditor は folding 非対応のため File 表示のときのみ */}
              {effectiveViewMode === 'file' && (
              <button
                type="button"
                className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
                title={isAllFolded ? 'Unfold all' : 'Fold all'}
                onClick={toggleFoldAll}
              >
                {isAllFolded ? (
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 7l4-4 4 4" />
                    <path d="M4 9l4 4 4-4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 2l4 4 4-4" />
                    <path d="M4 14l4-4 4 4" />
                  </svg>
                )}
              </button>
              )}
              <button
                type="button"
                className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
                title="Comment on the whole file"
                onClick={() => setIsFileCommentOpen(true)}
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H8.4L5 13.8V11H3.5A1.5 1.5 0 0 1 2 9.5z" />
                  <path d="M8 4.5v4M6 6.5h4" />
                </svg>
              </button>
            </div>
          )}
          {selectedFile && (isFileCommentOpen || fileLevelComments.length > 0) && (
            <div className="max-h-64 shrink-0 overflow-y-auto border-b border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900/40">
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
              viewMode={effectiveViewMode}
              diagnostics={diagnostics}
              comments={comments}
              pendingReveal={pendingReveal}
              onFoldTargetsChange={handleFoldTargetsChange}
              isEditable={isEditable}
              onEditTargetChange={handleEditTargetChange}
              onDirtyChange={handleDirtyChange}
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
