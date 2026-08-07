import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  Comment,
  Diagnostic,
  DiffFileMeta,
  FileContentResponse,
  RangeSpec,
} from '../../shared/types';
import { setDiagnosticMarkers } from '../monaco/markers';
import { getOrCreateModel } from '../monaco/models';
import { monaco } from '../monaco/setup';
import type { ViewMode } from '../state/store';
import { EditorZones, type ZoneItem } from './comments/EditorZones';
import { CommentCard, CommentForm } from './comments/CommentWidgets';

type IDiffEditor = import('monaco-editor/editor/editor.api.js').editor.IStandaloneDiffEditor;
type IStandaloneEditor = import('monaco-editor/editor/editor.api.js').editor.IStandaloneCodeEditor;
type ICodeEditor = import('monaco-editor/editor/editor.api.js').editor.ICodeEditor;

const COMMON_OPTIONS = {
  readOnly: true,
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  renderWhitespace: 'selection',
  fixedOverflowWidgets: true,
  glyphMargin: true,
  // readOnly エディタではデフォルトで marker が描画されないため明示的に有効化
  renderValidationDecorations: 'on',
} as const;

interface DraftRange {
  startLine: number;
  endLine: number;
}

interface DiffViewProps {
  range: RangeSpec;
  file: DiffFileMeta;
  contents: FileContentResponse;
  viewMode: ViewMode;
  diagnostics?: Diagnostic[];
  comments: Comment[];
  onCreateComment: (params: { startLine: number; endLine: number; body: string; codeSnapshot?: string }) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
}

export function DiffView({
  range,
  file,
  contents,
  viewMode,
  diagnostics,
  comments,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
}: DiffViewProps) {
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const fileContainerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<IDiffEditor | null>(null);
  const codeEditorRef = useRef<IStandaloneEditor | null>(null);
  const [activeEditor, setActiveEditor] = useState<ICodeEditor | null>(null);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const isDiffMode = viewMode !== 'file';

  // ファイルが変わったら下書きを破棄
  useEffect(() => setDraft(null), [file.path]);

  useEffect(() => {
    return () => {
      diffEditorRef.current?.dispose();
      diffEditorRef.current = null;
      codeEditorRef.current?.dispose();
      codeEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isDiffMode && diffContainerRef.current && !diffEditorRef.current) {
      const editor = monaco.editor.createDiffEditor(diffContainerRef.current, {
        ...COMMON_OPTIONS,
        renderSideBySide: viewMode === 'split',
        hideUnchangedRegions: { enabled: true, contextLineCount: 5 },
        diffAlgorithm: 'advanced',
        ignoreTrimWhitespace: false,
        maxComputationTime: 5000,
        originalEditable: false,
        renderOverviewRuler: true,
      });
      diffEditorRef.current = editor;
    }
    if (!isDiffMode && fileContainerRef.current && !codeEditorRef.current) {
      codeEditorRef.current = monaco.editor.create(fileContainerRef.current, {
        ...COMMON_OPTIONS,
      });
    }
    setActiveEditor(
      isDiffMode
        ? (diffEditorRef.current?.getModifiedEditor() ?? null)
        : codeEditorRef.current,
    );
  }, [isDiffMode, viewMode]);

  useEffect(() => {
    diffEditorRef.current?.updateOptions({ renderSideBySide: viewMode === 'split' });
  }, [viewMode]);

  const placeholderMessage = file.isBinary
    ? 'Binary file'
    : contents.isTooLarge
      ? 'File too large to display'
      : null;

  useEffect(() => {
    if (placeholderMessage) return;
    const originalRef = contents.original?.ref ?? 'none';
    const modifiedRef = contents.modified?.ref ?? 'none';

    if (isDiffMode && diffEditorRef.current) {
      const original = getOrCreateModel({
        side: 'original',
        path: file.oldPath ?? file.path,
        ref: originalRef,
        content: contents.original?.content ?? '',
      });
      const modified = getOrCreateModel({
        side: 'modified',
        path: file.path,
        ref: modifiedRef,
        content: contents.modified?.content ?? '',
      });
      diffEditorRef.current.setModel({ original, modified });
    }

    if (!isDiffMode && codeEditorRef.current) {
      const side = contents.modified ?? contents.original;
      const model = getOrCreateModel({
        side: contents.modified ? 'modified' : 'original',
        path: file.path,
        ref: side?.ref ?? 'none',
        content: side?.content ?? '',
      });
      codeEditorRef.current.setModel(model);
    }
  }, [isDiffMode, file, contents, range, placeholderMessage]);

  // TS/ESLint 診断を modified 側モデルに marker として反映
  useEffect(() => {
    if (placeholderMessage || !contents.modified) return;
    const model = getOrCreateModel({
      side: 'modified',
      path: file.path,
      ref: contents.modified.ref,
      content: contents.modified.content,
    });
    setDiagnosticMarkers(model, 'ts', diagnostics ?? []);
    setDiagnosticMarkers(model, 'eslint', diagnostics ?? []);
  }, [diagnostics, file, contents, placeholderMessage]);

  // glyph margin hover に「+」を出し、クリックでコメント下書きを開く
  useEffect(() => {
    if (!activeEditor || !contents.modified) return;
    const decorations = activeEditor.createDecorationsCollection();

    const moveListener = activeEditor.onMouseMove((e) => {
      const isGutter =
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      const line = e.target.position?.lineNumber;
      if (isGutter && line) {
        decorations.set([
          {
            range: new monaco.Range(line, 1, line, 1),
            options: { glyphMarginClassName: 'kaleido-comment-glyph', isWholeLine: false },
          },
        ]);
      } else {
        decorations.clear();
      }
    });
    const leaveListener = activeEditor.onMouseLeave(() => decorations.clear());
    const downListener = activeEditor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      const selection = activeEditor.getSelection();
      const isRangeSelection =
        selection &&
        !selection.isEmpty() &&
        line >= selection.startLineNumber &&
        line <= selection.endLineNumber;
      setDraft(
        isRangeSelection
          ? { startLine: selection.startLineNumber, endLine: selection.endLineNumber }
          : { startLine: line, endLine: line },
      );
    });

    return () => {
      moveListener.dispose();
      leaveListener.dispose();
      downListener.dispose();
      decorations.clear();
    };
  }, [activeEditor, contents.modified]);

  const zoneItems = useMemo<ZoneItem[]>(() => {
    if (placeholderMessage || !contents.modified) return [];
    const items: ZoneItem[] = comments
      .filter((c) => c.path === file.path && c.side === 'modified')
      .map((c) => ({
        key: `comment:${c.id}`,
        afterLineNumber: c.endLine,
        element: (
          <CommentCard comment={c} onUpdate={onUpdateComment} onDelete={onDeleteComment} />
        ),
      }));
    if (draft) {
      items.push({
        key: 'draft',
        afterLineNumber: draft.endLine,
        element: (
          <CommentForm
            onSubmit={(body) => {
              const model = activeEditor?.getModel();
              const codeSnapshot = model
                ? model.getValueInRange(
                    new monaco.Range(
                      draft.startLine,
                      1,
                      draft.endLine,
                      model.getLineMaxColumn(draft.endLine),
                    ),
                  )
                : undefined;
              onCreateComment({ ...draft, body, codeSnapshot });
              setDraft(null);
            }}
            onCancel={() => setDraft(null)}
          />
        ),
      });
    }
    return items;
  }, [
    comments,
    draft,
    file.path,
    contents.modified,
    placeholderMessage,
    activeEditor,
    onCreateComment,
    onUpdateComment,
    onDeleteComment,
  ]);

  return (
    <div className="relative h-full w-full">
      <div ref={diffContainerRef} className={`h-full w-full ${isDiffMode ? '' : 'hidden'}`} />
      <div ref={fileContainerRef} className={`h-full w-full ${isDiffMode ? 'hidden' : ''}`} />
      <EditorZones editor={activeEditor} items={zoneItems} />
      {placeholderMessage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e] text-sm text-neutral-500">
          {placeholderMessage}
        </div>
      )}
    </div>
  );
}
