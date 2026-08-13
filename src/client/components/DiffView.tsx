import { useEffect, useMemo, useRef, useState } from 'react';

import {
  isFileLevelComment,
  type Comment,
  type CommentSide,
  type Diagnostic,
  type DiffFileMeta,
  type FileContentResponse,
  type RangeSpec,
} from '../../shared/types';
import { setDiagnosticMarkers } from '../monaco/markers';
import { getOrCreateModel, repoPathFromUri } from '../monaco/models';
import { monaco } from '../monaco/setup';
import { useUiStore, type RevealTarget, type ViewMode } from '../state/store';
import { anchorComment } from '../utils/commentAnchor';
import { EditorZones, type ZoneItem } from './comments/EditorZones';
import { CommentCard, CommentForm } from './comments/CommentWidgets';

type IDiffEditor = import('monaco-editor/editor/editor.api.js').editor.IStandaloneDiffEditor;
type IStandaloneEditor = import('monaco-editor/editor/editor.api.js').editor.IStandaloneCodeEditor;
type ICodeEditor = import('monaco-editor/editor/editor.api.js').editor.ICodeEditor;
type ITextModel = import('monaco-editor/editor/editor.api.js').editor.ITextModel;

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

interface Draft {
  side: CommentSide;
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
  /** Go to Definition などで開いた後にスクロールする位置 */
  pendingReveal?: RevealTarget | null;
  onCreateComment: (params: {
    side: CommentSide;
    startLine?: number;
    endLine?: number;
    body: string;
    codeSnapshot?: string;
  }) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
}

/** glyph margin hover に「+」を出し、クリックでコメント下書きを開く */
function useCommentGutter(
  editor: ICodeEditor | null,
  isEnabled: boolean,
  side: CommentSide,
  onOpenDraft: (draft: Draft) => void,
) {
  useEffect(() => {
    if (!editor || !isEnabled) return;
    const decorations = editor.createDecorationsCollection();

    const moveListener = editor.onMouseMove((e) => {
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
    const leaveListener = editor.onMouseLeave(() => decorations.clear());
    const downListener = editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      const selection = editor.getSelection();
      const isRangeSelection =
        selection &&
        !selection.isEmpty() &&
        line >= selection.startLineNumber &&
        line <= selection.endLineNumber;
      onOpenDraft(
        isRangeSelection
          ? { side, startLine: selection.startLineNumber, endLine: selection.endLineNumber }
          : { side, startLine: line, endLine: line },
      );
    });

    return () => {
      moveListener.dispose();
      leaveListener.dispose();
      downListener.dispose();
      decorations.clear();
    };
  }, [editor, isEnabled, side, onOpenDraft]);
}

export function DiffView({
  range,
  file,
  contents,
  viewMode,
  diagnostics,
  comments,
  pendingReveal,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
}: DiffViewProps) {
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const fileContainerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<IDiffEditor | null>(null);
  const codeEditorRef = useRef<IStandaloneEditor | null>(null);
  const [modifiedEditor, setModifiedEditor] = useState<ICodeEditor | null>(null);
  const [originalEditor, setOriginalEditor] = useState<ICodeEditor | null>(null);
  const [fileEditor, setFileEditor] = useState<ICodeEditor | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const isDiffMode = viewMode !== 'file';
  /** file モードで表示している側 (deleted ファイルは original) */
  const fileModeSide: CommentSide = contents.modified ? 'modified' : 'original';

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
    setModifiedEditor(isDiffMode ? (diffEditorRef.current?.getModifiedEditor() ?? null) : null);
    setOriginalEditor(isDiffMode ? (diffEditorRef.current?.getOriginalEditor() ?? null) : null);
    setFileEditor(isDiffMode ? null : codeEditorRef.current);
  }, [isDiffMode, viewMode]);

  useEffect(() => {
    diffEditorRef.current?.updateOptions({ renderSideBySide: viewMode === 'split' });
  }, [viewMode]);

  const placeholderMessage = file.isBinary
    ? 'Binary file'
    : contents.isTooLarge
      ? 'File too large to display'
      : null;

  const getSideModel = (side: CommentSide): ITextModel | null => {
    const content = side === 'modified' ? contents.modified : contents.original;
    if (!content) return null;
    return getOrCreateModel({
      side,
      path: side === 'original' ? (file.oldPath ?? file.path) : file.path,
      ref: content.ref,
      content: content.content,
    });
  };

  useEffect(() => {
    if (placeholderMessage) return;

    if (isDiffMode && diffEditorRef.current) {
      const original =
        getSideModel('original') ??
        getOrCreateModel({ side: 'original', path: file.oldPath ?? file.path, ref: 'none', content: '' });
      const modified =
        getSideModel('modified') ??
        getOrCreateModel({ side: 'modified', path: file.path, ref: 'none', content: '' });
      diffEditorRef.current.setModel({ original, modified });
    }

    if (!isDiffMode && codeEditorRef.current) {
      const model = getSideModel(fileModeSide);
      if (model) codeEditorRef.current.setModel(model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDiffMode, file, contents, range, placeholderMessage, fileModeSide]);

  // Go to Definition からのジャンプ先へスクロール (対象モデルが表示されてから消費する)
  useEffect(() => {
    if (!pendingReveal || pendingReveal.path !== file.path || placeholderMessage) return;
    const editor = isDiffMode ? diffEditorRef.current?.getModifiedEditor() : codeEditorRef.current;
    const model = editor?.getModel();
    // モデル未設定・別ファイルのモデルなら、contents 到着後の再実行に任せる
    if (!editor || !model || repoPathFromUri(model.uri) !== file.path) return;
    useUiStore.getState().setPendingReveal(null);
    const position = { lineNumber: pendingReveal.line, column: pendingReveal.column };
    // mount 直後はレイアウト前で reveal が無効化されるため、描画後に実行する
    requestAnimationFrame(() => {
      editor.revealPositionInCenter(position);
      editor.setPosition(position);
      editor.focus();
    });
  }, [pendingReveal, isDiffMode, file, contents, placeholderMessage]);

  // TS/ESLint 診断を modified 側モデルに marker として反映
  useEffect(() => {
    if (placeholderMessage || !contents.modified) return;
    const model = getSideModel('modified');
    if (!model) return;
    setDiagnosticMarkers(model, 'ts', diagnostics ?? []);
    setDiagnosticMarkers(model, 'eslint', diagnostics ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics, file, contents, placeholderMessage]);

  const gutterEditorForModified = isDiffMode ? modifiedEditor : fileModeSide === 'modified' ? fileEditor : null;
  const gutterEditorForOriginal = isDiffMode ? originalEditor : fileModeSide === 'original' ? fileEditor : null;

  useCommentGutter(gutterEditorForModified, !placeholderMessage && !!contents.modified, 'modified', setDraft);
  useCommentGutter(gutterEditorForOriginal, !placeholderMessage && !!contents.original, 'original', setDraft);

  const buildZoneItems = (side: CommentSide): ZoneItem[] => {
    if (placeholderMessage) return [];
    const model = getSideModel(side);
    if (!model) return [];

    const items: ZoneItem[] = comments
      .filter((c) => c.path === file.path && !isFileLevelComment(c) && c.side === side)
      .map((c) => {
        const anchored = anchorComment(model, c);
        return {
          key: `comment:${c.id}`,
          afterLineNumber: anchored.displayLine,
          element: (
            <CommentCard
              comment={c}
              isOutdated={anchored.isOutdated}
              onUpdate={onUpdateComment}
              onDelete={onDeleteComment}
            />
          ),
        };
      });

    if (draft && draft.side === side) {
      items.push({
        key: 'draft',
        afterLineNumber: draft.endLine,
        element: (
          <CommentForm
            onSubmit={(body) => {
              const endColumn = model.getLineMaxColumn(Math.min(draft.endLine, model.getLineCount()));
              const codeSnapshot = model.getValueInRange(
                new monaco.Range(draft.startLine, 1, draft.endLine, endColumn),
              );
              onCreateComment({ ...draft, body, codeSnapshot });
              setDraft(null);
            }}
            onCancel={() => setDraft(null)}
          />
        ),
      });
    }
    return items;
  };

  const modifiedZoneItems = useMemo(
    () => buildZoneItems('modified'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, draft, file, contents, placeholderMessage, onCreateComment, onUpdateComment, onDeleteComment],
  );
  const originalZoneItems = useMemo(
    () => buildZoneItems('original'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, draft, file, contents, placeholderMessage, onCreateComment, onUpdateComment, onDeleteComment],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={diffContainerRef} className={`h-full w-full ${isDiffMode ? '' : 'hidden'}`} />
      <div ref={fileContainerRef} className={`h-full w-full ${isDiffMode ? 'hidden' : ''}`} />
      <EditorZones
        editor={isDiffMode ? modifiedEditor : fileModeSide === 'modified' ? fileEditor : null}
        items={modifiedZoneItems}
      />
      <EditorZones
        editor={isDiffMode ? originalEditor : fileModeSide === 'original' ? fileEditor : null}
        items={originalZoneItems}
      />
      {placeholderMessage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-neutral-400 dark:bg-[#1e1e1e] dark:text-neutral-500">
          {placeholderMessage}
        </div>
      )}
    </div>
  );
}
