import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type tsTypes from 'typescript';

import type { DefinitionLocation, Diagnostic, HoverResponse } from '../../shared/types.js';

type Ts = typeof tsTypes;

const PROJECT_IDLE_DISPOSE_MS = 10 * 60 * 1000;

/** path が絶対パスの Location (repo 相対変換前) */
type AbsoluteLocation = Omit<DefinitionLocation, 'path'> & { path: string };

interface Overlay {
  content: string;
  version: number;
}

/**
 * 対象リポジトリの tsconfig + node_modules を使った ts.LanguageService 群を管理する。
 * - ファイルごとに最近傍の tsconfig.json を探して Project を遅延生成
 * - overlay: staged/commit 比較時にエディタ表示中の全文を重ねて解析する
 */
export class TsService {
  private ts: Ts;
  private tsSource: 'project' | 'bundled';
  private projects = new Map<string, Project>();
  private documentRegistry: tsTypes.DocumentRegistry;

  constructor(private repoRoot: string) {
    const loaded = loadTypescript(repoRoot);
    this.ts = loaded.ts;
    this.tsSource = loaded.source;
    this.documentRegistry = this.ts.createDocumentRegistry();
  }

  get tsVersionInfo(): string {
    return `${this.ts.version} (${this.tsSource})`;
  }

  isSupportedFile(path: string): boolean {
    return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path);
  }

  private toAbsPath(repoRelPath: string): string {
    const normalized = repoRelPath.replace(/\\/g, '/');
    if (isAbsolute(normalized) || normalized.split('/').includes('..')) {
      throw new Error('Invalid path');
    }
    const abs = resolve(this.repoRoot, normalized);
    if (abs !== this.repoRoot && !abs.startsWith(`${this.repoRoot}${sep}`)) {
      throw new Error('Path outside repository');
    }
    return abs;
  }

  private getProjectFor(absPath: string): Project | null {
    const configPath = this.ts.findConfigFile(dirname(absPath), this.ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) return null;
    let project = this.projects.get(configPath);
    if (!project) {
      project = new Project(this.ts, configPath, this.documentRegistry);
      this.projects.set(configPath, project);
    }
    project.touch();
    this.disposeIdleProjects();
    return project;
  }

  hover(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): HoverResponse | null {
    const absPath = this.toAbsPath(params.path);
    if (!this.isSupportedFile(absPath)) return null;
    const project = this.getProjectFor(absPath);
    if (!project) return null;
    return project.hover(absPath, params.line, params.column, params.content);
  }

  diagnostics(params: { path: string; content?: string }): Diagnostic[] {
    const absPath = this.toAbsPath(params.path);
    if (!this.isSupportedFile(absPath)) return [];
    const project = this.getProjectFor(absPath);
    if (!project) return [];
    return project.diagnostics(absPath, params.content);
  }

  definition(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): DefinitionLocation[] {
    return this.locate('definition', params);
  }

  references(params: {
    path: string;
    line: number;
    column: number;
    content?: string;
  }): DefinitionLocation[] {
    return this.locate('references', params);
  }

  private locate(
    kind: 'definition' | 'references',
    params: { path: string; line: number; column: number; content?: string },
  ): DefinitionLocation[] {
    const absPath = this.toAbsPath(params.path);
    if (!this.isSupportedFile(absPath)) return [];
    const project = this.getProjectFor(absPath);
    if (!project) return [];
    const locations =
      kind === 'definition'
        ? project.definition(absPath, params.line, params.column, params.content)
        : project.references(absPath, params.line, params.column, params.content);
    // repo 外 (同梱 TS の lib.d.ts 等) は開けないため除外し、repo 相対パスへ変換
    const result: DefinitionLocation[] = [];
    for (const location of locations) {
      if (
        location.path === this.repoRoot ||
        !location.path.startsWith(`${this.repoRoot}${sep}`)
      ) {
        continue;
      }
      result.push({ ...location, path: relative(this.repoRoot, location.path).split(sep).join('/') });
    }
    return result;
  }

  /** diff 取得後にバックグラウンドで Program を構築しておく (初回 hover の体感改善) */
  warmup(repoRelPaths: string[]): void {
    setImmediate(() => {
      for (const path of repoRelPaths) {
        try {
          if (!this.isSupportedFile(path)) continue;
          const absPath = this.toAbsPath(path);
          this.getProjectFor(absPath)?.ensureProgram();
        } catch {
          // warm-up は best effort
        }
      }
    });
  }

  /** watcher からのファイル変更通知 */
  invalidateFile(repoRelPath: string): void {
    try {
      const absPath = this.toAbsPath(repoRelPath);
      for (const project of this.projects.values()) {
        project.bumpDiskVersion(absPath);
      }
    } catch {
      // 変更通知は best effort
    }
  }

  private disposeIdleProjects(): void {
    const now = Date.now();
    for (const [key, project] of this.projects) {
      if (now - project.lastUsedAt > PROJECT_IDLE_DISPOSE_MS) {
        project.dispose();
        this.projects.delete(key);
      }
    }
  }
}

function loadTypescript(repoRoot: string): { ts: Ts; source: 'project' | 'bundled' } {
  const require = createRequire(join(repoRoot, 'noop.js'));
  try {
    const projectTs = require('typescript') as Ts;
    if (typeof projectTs.createLanguageService === 'function') {
      return { ts: projectTs, source: 'project' };
    }
  } catch {
    // 対象プロジェクトに typescript がない
  }
  // TS7 (native) は createLanguageService を持たないため同梱の TS5 にフォールバック
  const bundledRequire = createRequire(import.meta.url);
  return { ts: bundledRequire('typescript') as Ts, source: 'bundled' };
}

class Project {
  private languageService: tsTypes.LanguageService;
  private rootFiles: Set<string>;
  private extraRoots = new Set<string>();
  private overlays = new Map<string, Overlay>();
  private diskVersions = new Map<string, number>();
  private compilerOptions: tsTypes.CompilerOptions;
  private projectDir: string;
  lastUsedAt = Date.now();

  constructor(
    private ts: Ts,
    configPath: string,
    documentRegistry: tsTypes.DocumentRegistry,
  ) {
    this.projectDir = dirname(configPath);
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config ?? {},
      ts.sys,
      this.projectDir,
      undefined,
      configPath,
    );
    this.compilerOptions = parsed.options;
    this.rootFiles = new Set(parsed.fileNames);

    const host: tsTypes.LanguageServiceHost = {
      getScriptFileNames: () => [...this.rootFiles, ...this.extraRoots],
      getScriptVersion: (fileName) => {
        const overlay = this.overlays.get(fileName);
        if (overlay) return `overlay-${overlay.version}`;
        return `disk-${this.diskVersions.get(fileName) ?? 0}`;
      },
      getScriptSnapshot: (fileName) => {
        const overlay = this.overlays.get(fileName);
        if (overlay) return ts.ScriptSnapshot.fromString(overlay.content);
        const content = ts.sys.readFile(fileName);
        if (content === undefined) return undefined;
        return ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => this.projectDir,
      getCompilationSettings: () => this.compilerOptions,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => this.overlays.has(fileName) || ts.sys.fileExists(fileName),
      readFile: (fileName) => this.overlays.get(fileName)?.content ?? ts.sys.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    };
    this.languageService = ts.createLanguageService(host, documentRegistry);
  }

  touch(): void {
    this.lastUsedAt = Date.now();
  }

  ensureProgram(): void {
    this.languageService.getProgram();
  }

  dispose(): void {
    this.languageService.dispose();
  }

  bumpDiskVersion(absPath: string): void {
    this.diskVersions.set(absPath, (this.diskVersions.get(absPath) ?? 0) + 1);
  }

  private ensureFileInProject(absPath: string): void {
    if (!this.rootFiles.has(absPath) && !this.extraRoots.has(absPath)) {
      this.extraRoots.add(absPath);
    }
  }

  private syncOverlay(absPath: string, content: string | undefined): void {
    const existing = this.overlays.get(absPath);
    if (content === undefined) {
      if (existing) this.overlays.delete(absPath);
      return;
    }
    if (existing?.content !== content) {
      this.overlays.set(absPath, {
        content,
        version: (existing?.version ?? 0) + 1,
      });
    }
  }

  private getSourceFile(absPath: string): tsTypes.SourceFile | undefined {
    return this.languageService.getProgram()?.getSourceFile(absPath);
  }

  hover(absPath: string, line: number, column: number, content?: string): HoverResponse | null {
    this.ensureFileInProject(absPath);
    this.syncOverlay(absPath, content);

    const sourceFile = this.getSourceFile(absPath);
    if (!sourceFile) return null;
    let offset: number;
    try {
      offset = this.ts.getPositionOfLineAndCharacter(sourceFile, line - 1, column - 1);
    } catch {
      return null;
    }

    const info = this.languageService.getQuickInfoAtPosition(absPath, offset);
    if (!info) return null;

    const contents: string[] = [];
    const display = this.ts.displayPartsToString(info.displayParts);
    if (display) contents.push('```typescript\n' + display + '\n```');
    const docs = this.ts.displayPartsToString(info.documentation);
    if (docs) contents.push(docs);
    for (const tag of info.tags ?? []) {
      const text = this.ts.displayPartsToString(tag.text);
      contents.push(`*@${tag.name}*${text ? ` — ${text}` : ''}`);
    }
    if (contents.length === 0) return null;

    const start = this.ts.getLineAndCharacterOfPosition(sourceFile, info.textSpan.start);
    const end = this.ts.getLineAndCharacterOfPosition(
      sourceFile,
      info.textSpan.start + info.textSpan.length,
    );
    return {
      contents,
      range: {
        startLine: start.line + 1,
        startColumn: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      },
    };
  }

  definition(
    absPath: string,
    line: number,
    column: number,
    content?: string,
  ): AbsoluteLocation[] {
    const offset = this.prepareOffset(absPath, line, column, content);
    if (offset === null) return [];
    const defs = this.languageService.getDefinitionAtPosition(absPath, offset) ?? [];
    return this.spansToLocations(defs);
  }

  references(
    absPath: string,
    line: number,
    column: number,
    content?: string,
  ): AbsoluteLocation[] {
    const offset = this.prepareOffset(absPath, line, column, content);
    if (offset === null) return [];
    const refs = this.languageService.getReferencesAtPosition(absPath, offset) ?? [];
    return this.spansToLocations(refs);
  }

  /** overlay 同期 + 1-based line/column → offset 変換 */
  private prepareOffset(
    absPath: string,
    line: number,
    column: number,
    content?: string,
  ): number | null {
    this.ensureFileInProject(absPath);
    this.syncOverlay(absPath, content);
    const sourceFile = this.getSourceFile(absPath);
    if (!sourceFile) return null;
    try {
      return this.ts.getPositionOfLineAndCharacter(sourceFile, line - 1, column - 1);
    } catch {
      return null;
    }
  }

  private spansToLocations(
    entries: readonly { fileName: string; textSpan: tsTypes.TextSpan }[],
  ): AbsoluteLocation[] {
    const program = this.languageService.getProgram();
    const result: AbsoluteLocation[] = [];
    for (const entry of entries) {
      const targetSf = program?.getSourceFile(entry.fileName);
      if (!targetSf) continue;
      const start = this.ts.getLineAndCharacterOfPosition(targetSf, entry.textSpan.start);
      const end = this.ts.getLineAndCharacterOfPosition(
        targetSf,
        entry.textSpan.start + entry.textSpan.length,
      );
      result.push({
        path: entry.fileName,
        startLine: start.line + 1,
        startColumn: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      });
    }
    return result;
  }

  diagnostics(absPath: string, content?: string): Diagnostic[] {
    this.ensureFileInProject(absPath);
    this.syncOverlay(absPath, content);

    const sourceFile = this.getSourceFile(absPath);
    if (!sourceFile) return [];

    const all = [
      ...this.languageService.getSyntacticDiagnostics(absPath),
      ...this.languageService.getSemanticDiagnostics(absPath),
    ];

    const result: Diagnostic[] = [];
    for (const diag of all) {
      if (diag.start === undefined || diag.length === undefined) continue;
      const start = this.ts.getLineAndCharacterOfPosition(sourceFile, diag.start);
      const end = this.ts.getLineAndCharacterOfPosition(sourceFile, diag.start + diag.length);
      result.push({
        source: 'ts',
        severity:
          diag.category === this.ts.DiagnosticCategory.Error
            ? 'error'
            : diag.category === this.ts.DiagnosticCategory.Warning
              ? 'warning'
              : 'info',
        message: this.ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        code: `TS${diag.code}`,
        startLine: start.line + 1,
        startColumn: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
      });
    }
    return result;
  }
}
