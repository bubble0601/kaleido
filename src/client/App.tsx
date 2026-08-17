import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommentCard, CommentForm } from './components/comments/CommentWidgets';
import { DiffView } from './components/DiffView';
import { Sidebar } from './components/Sidebar';
import { ActivityBar } from './components/ActivityBar';
import { CommentsPanel } from './components/CommentsPanel';
import { QuickOpen } from './components/QuickOpen';
import { Toolbar } from './components/Toolbar';
import { useDiff, useFileContent, useLint, useMeta, useTsDiagnostics } from './hooks/queries';
import {
  BROWSE_RANGE,
  isBrowseRange,
  isFileLevelComment,
  type Comment,
  type RangeSpec,
} from '../shared/types';
import { api } from './services/api';
import { computeViewedPaths, useComments, useViewed } from './hooks/review';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useSse } from './hooks/useSse';
import { monaco } from './monaco/setup';
import { MarkdownPreview } from './components/MarkdownPreview';
import { contentVersion, HtmlPreview } from './components/HtmlPreview';
import { getPreviewKind } from './utils/preview';
import { SettingsDialog } from './components/SettingsDialog';
import { SYSTEM_DARK_QUERY, useUiStore, type PreviewMode, type SidebarTab } from './state/store';
import { setFileOpenHandler } from './monaco/navigation';

type ICodeEditor = import('monaco-editor/editor/editor.api.js').editor.ICodeEditor;
import { getInitialUrlPath, getInitialUrlRange, syncUrl } from './utils/urlState';

const PREVIEW_MODES: { mode: PreviewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'source',
    label: 'Source',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3.5 2.5 8 6 12.5" />
        <path d="M10 3.5 13.5 8 10 12.5" />
      </svg>
    ),
  },
  {
    mode: 'split',
    label: 'Source and preview',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <line x1="8" y1="2.5" x2="8" y2="13.5" />
      </svg>
    ),
  },
  {
    mode: 'preview',
    label: 'Preview',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
        <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" />
        <circle cx="8" cy="8" r="1.8" />
      </svg>
    ),
  },
];

export function App() {
  const queryClient = useQueryClient();
  const meta = useMeta();
  useSse();
  const {
    range,
    selectedPath,
    browsePath,
    viewMode,
    previewMode,
    openedFrom,
    theme,
    setRange,
    setSelectedPath,
    setBrowsePath,
    setViewMode,
    setOpenedFrom,
    setPreviewMode,
  } = useUiStore();
  const setPendingReveal = useUiStore((state) => state.setPendingReveal);
  const pendingReveal = useUiStore((state) => state.pendingReveal);
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false);

  // テーマを html クラスと Monaco に反映
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
  }, [theme]);

  // 設定が system のときは OS 側の切り替えに追従する
  const syncSystemTheme = useUiStore((state) => state.syncSystemTheme);
  useEffect(() => {
    const media = matchMedia(SYSTEM_DARK_QUERY);
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, [syncSystemTheme]);

  useEffect(() => {
    if (meta.data && !range) {
      setRange(getInitialUrlRange() ?? meta.data.initialRange);
    }
  }, [meta.data, range, setRange]);

  const isGitRepo = meta.data?.isGitRepo ?? false;
  const diff = useDiff(range);
  const files = useMemo(() => diff.data?.files ?? [], [diff.data]);

  /** 比較対象にあれば diff として、なければ単体ファイルとして開く */
  const openFile = useCallback(
    (path: string, from: SidebarTab | null = null) => {
      setOpenedFrom(from);
      if (files.some((f) => f.path === path)) {
        setSelectedPath(path);
      } else {
        setBrowsePath(path);
      }
    },
    [files, setSelectedPath, setBrowsePath, setOpenedFrom],
  );

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
    // diff の取得を待たないと、比較対象内のファイルまで browse 扱いになる
    if (!diff.isSuccess) return;
    if (browsePath || selectedFile) return;
    if (!hasRestoredUrlPathRef.current) {
      hasRestoredUrlPathRef.current = true;
      const urlPath = getInitialUrlPath();
      if (urlPath) {
        openFile(urlPath);
        return;
      }
    }
    if (files.length > 0) setSelectedPath(files[0]!.path);
  }, [diff.isSuccess, files, selectedFile, browsePath, openFile, setSelectedPath]);

  // Go to Definition などからのファイルオープン要求
  useEffect(() => {
    setFileOpenHandler((target) => {
      setPendingReveal(target);
      openFile(target.path);
    });
    return () => setFileOpenHandler(null);
  }, [openFile, setPendingReveal]);

  // 範囲・表示中ファイルを URL に反映 (リロード・共有用)
  useEffect(() => {
    syncUrl(range, browsePath ?? selectedPath);
  }, [range, selectedPath, browsePath]);

  const [isFileCommentOpen, setIsFileCommentOpen] = useState(false);
  useEffect(() => setIsFileCommentOpen(false), [selectedPath, range]);

  // 編集・保存 (modified 側が working tree のときのみ)。
  // 編集中の内容はプレビューへライブ反映するため、モデルの変更も購読する
  const editTargetRef = useRef<ICodeEditor | null>(null);
  const [liveContent, setLiveContent] = useState<string | null>(null);
  const liveSubscriptionRef = useRef<{ dispose: () => void } | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEditTargetChange = useCallback((editor: ICodeEditor | null) => {
    editTargetRef.current = editor;
    liveSubscriptionRef.current?.dispose();
    liveSubscriptionRef.current = null;
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    if (!editor) {
      setLiveContent(null);
      return;
    }
    setLiveContent(editor.getValue());
    liveSubscriptionRef.current = editor.onDidChangeModelContent(() => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => setLiveContent(editor.getValue()), 200);
    });
  }, []);
  useEffect(
    () => () => {
      liveSubscriptionRef.current?.dispose();
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    },
    [],
  );
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

  // 比較対象外のファイルは、比較範囲によらず working tree の内容をそのまま表示する
  const contentRange = browsePath ? BROWSE_RANGE : range;
  const contents = useFileContent(contentRange, selectedFile);
  const isEditable = contents.data?.modified?.ref === 'working' && !contents.data.isTooLarge;

  // Markdown などのプレビューの既定:
  // Changes から開いたなら比較とプレビューを並べ、Files / Docs から開いたならプレビューのみ。
  // Quick Open や定義ジャンプなど経路が分からないときは、表示中の内容から決める。
  // HTML は working tree のファイルをサーバーから配信して見せるため、
  // 過去のコミットの内容を見ているときはプレビューを出さない (ソースと食い違うため)
  const fileKind = selectedFile ? getPreviewKind(selectedFile.path) : null;
  const previewKind = fileKind === 'html' && !isEditable ? null : fileKind;
  useEffect(() => setPreviewMode(null), [selectedPath, browsePath, setPreviewMode]);
  const defaultPreviewMode: PreviewMode =
    openedFrom === 'changes'
      ? 'split'
      : openedFrom !== null
        ? 'preview'
        : effectiveViewMode === 'file'
          ? 'preview'
          : 'split';
  const effectivePreviewMode: PreviewMode =
    previewKind === null ? 'source' : (previewMode ?? defaultPreviewMode);
  const previewContent = liveContent ?? contents.data?.modified?.content ?? '';
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
  // 比較外のファイルを開いているときは、そのファイルだけを lint 対象にする
  const lintTargets = useMemo(
    () => (browsePath && selectedFile ? [selectedFile] : files),
    [browsePath, selectedFile, files],
  );
  const lint = useLint(range, lintTargets);
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

  // Activity Bar の選択。非 git では Changes を出さないので files に寄せる。
  // 選択中のものをもう一度押したらサイドバーを畳む (VS Code と同じ)
  const storedSidebarTab = useUiStore((state) => state.sidebarTab);
  const setStoredSidebarTab = useUiStore((state) => state.setSidebarTab);
  const sidebarTab: SidebarTab =
    !isGitRepo && storedSidebarTab === 'changes' ? 'files' : storedSidebarTab;
  const selectSidebarTab = useCallback(
    (next: SidebarTab) => {
      if (next === sidebarTab && !sidebar.isCollapsed) {
        sidebar.toggle();
        return;
      }
      setStoredSidebarTab(next);
      if (sidebar.isCollapsed) sidebar.toggle();
    },
    [sidebarTab, sidebar, setStoredSidebarTab],
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
      openFile(comment.path);
    },
    [openFile, setPendingReveal],
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
        isDiffAvailable={!isBrowseRange(range)}
      >
        <CommentsPanel comments={comments} onJump={jumpToComment} onClearAll={() => void clearAllComments()} />
      </Toolbar>
      <QuickOpen
        isOpen={isQuickOpenVisible}
        onClose={() => setIsQuickOpenVisible(false)}
        onSelect={openFile}
      />
      <SettingsDialog />
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
        <ActivityBar
          activeTab={sidebarTab}
          isGitRepo={isGitRepo}
          isCollapsed={sidebar.isCollapsed}
          onSelect={selectSidebarTab}
        />
        {!sidebar.isCollapsed && (
          <aside
            style={{ width: sidebar.width }}
            className="shrink-0 bg-neutral-50 dark:bg-neutral-900"
          >
            <Sidebar
              diffFiles={files}
              tab={sidebarTab}
              selectedPath={selectedPath}
              browsePath={browsePath}
              viewedPaths={viewedPaths}
              commentCounts={commentCounts}
              range={range}
              onRangeChange={setRange}
              onSelectDiffFile={(path) => {
                setOpenedFrom('changes');
                setSelectedPath(path);
              }}
              onOpenFile={openFile}
              onToggleViewed={(file, isViewed) => toggleViewed.mutate({ file, isViewed })}
            />
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
              {previewKind && (
                <div className="flex overflow-hidden rounded border border-neutral-300 dark:border-neutral-700">
                  {PREVIEW_MODES.map(({ mode, label, icon }) => (
                    <button
                      key={mode}
                      type="button"
                      title={label}
                      className={`px-1.5 py-0.5 ${
                        effectivePreviewMode === mode
                          ? 'bg-neutral-300 text-neutral-900 dark:bg-neutral-600 dark:text-white'
                          : 'bg-white text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                      }`}
                      onClick={() => setPreviewMode(mode)}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              )}
              {/* DiffEditor は folding 非対応のため File 表示のときのみ */}
              {effectiveViewMode === 'file' && effectivePreviewMode !== 'preview' && (
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
          <div className="flex min-h-0 flex-1">
          {selectedFile && contentRange && (selectedFile.isBinary || contents.data) ? (
            <>
            {effectivePreviewMode !== 'preview' && (
            <div className="min-w-0 flex-1">
            <DiffView
              range={contentRange}
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
            </div>
            )}
            {effectivePreviewMode !== 'source' && (
              <div className="min-w-0 flex-1 border-l border-neutral-200 dark:border-neutral-800">
                {previewKind === 'html' ? (
                  <HtmlPreview
                    path={selectedFile.path}
                    version={contentVersion(contents.data?.modified?.content ?? '')}
                  />
                ) : (
                  <MarkdownPreview
                    content={previewContent}
                    path={selectedFile.path}
                    theme={theme}
                  />
                )}
              </div>
            )}
            </>
          ) : (
            <div className="flex-1">
              <Centered>
                {selectedFile
                  ? 'Loading file…'
                  : isBrowseRange(range)
                    ? 'Select a file from the tree'
                    : 'No changes to show'}
              </Centered>
            </div>
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
