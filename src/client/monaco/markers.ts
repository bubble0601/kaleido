import type { editor } from 'monaco-editor/editor/editor.api.js';

import type { Diagnostic } from '../../shared/types';
import { monaco } from './setup';

const SEVERITY_MAP = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
} as const;

/** owner ('ts' | 'eslint') ごとに独立して marker を設定する */
export function setDiagnosticMarkers(
  model: editor.ITextModel,
  owner: 'ts' | 'eslint',
  diagnostics: Diagnostic[],
): void {
  const markers: editor.IMarkerData[] = diagnostics
    .filter((d) => d.source === owner)
    .map((d) => ({
      severity: SEVERITY_MAP[d.severity],
      message: d.code ? `${d.message} (${d.code})` : d.message,
      startLineNumber: d.startLine,
      startColumn: d.startColumn,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
    }));
  monaco.editor.setModelMarkers(model, owner, markers);
}

export function clearDiagnosticMarkers(model: editor.ITextModel): void {
  monaco.editor.setModelMarkers(model, 'ts', []);
  monaco.editor.setModelMarkers(model, 'eslint', []);
}
