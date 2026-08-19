import { useEffect, useRef, useState } from 'react';

import licenses from '../generated/licenses.json';
import {
  EDITOR_FONT_SIZES,
  PREVIEW_FONT_SIZES,
  useUiStore,
  type ThemePreference,
} from '../state/store';

type Section = 'appearance' | 'about';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * 設定ダイアログ。左のナビゲーションでセクションを切り替える。
 * <dialog> の showModal を使うので、Esc で閉じる・背面を触れない挙動は
 * ブラウザ任せにできる。
 */
export function SettingsDialog() {
  const isOpen = useUiStore((state) => state.isSettingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<Section>('appearance');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(880px,90vw)] rounded-lg border border-neutral-300 bg-white p-0 text-neutral-800 shadow-2xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      onClose={() => setOpen(false)}
      // 背景 (::backdrop) のクリックで閉じる
      onClick={(e) => {
        if (e.target === dialogRef.current) setOpen(false);
      }}
    >
      <div className="flex h-[min(560px,80vh)]">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-neutral-200 p-2 dark:border-neutral-800">
          <div className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Settings
          </div>
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded px-2 py-1.5 text-left text-sm ${
                section === item.id
                  ? 'bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">
              {SECTIONS.find((item) => item.id === section)?.label}
            </h2>
            <button
              type="button"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
              title="Close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {section === 'appearance' ? <AppearanceSection /> : <AboutSection />}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function AppearanceSection() {
  const themePreference = useUiStore((state) => state.themePreference);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const editorFontSize = useUiStore((state) => state.editorFontSize);
  const setEditorFontSize = useUiStore((state) => state.setEditorFontSize);
  const previewFontSize = useUiStore((state) => state.previewFontSize);
  const setPreviewFontSize = useUiStore((state) => state.setPreviewFontSize);
  return (
    <section className="flex flex-col gap-5">
      <SettingRow
        id="theme-select"
        label="Theme"
        note="System にすると OS の外観設定に追従します。"
      >
        <select
          id="theme-select"
          className={SELECT_CLASS}
          value={themePreference}
          onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        id="editor-font-size-select"
        label="Editor font size"
        note="diff・ファイル表示のエディタに適用されます。"
      >
        <FontSizeSelect
          id="editor-font-size-select"
          sizes={EDITOR_FONT_SIZES}
          value={editorFontSize}
          onChange={setEditorFontSize}
        />
      </SettingRow>

      <SettingRow
        id="preview-font-size-select"
        label="Preview font size"
        note="Markdown プレビュー本文の基準サイズ。見出しやコードはこれに比例します。"
      >
        <FontSizeSelect
          id="preview-font-size-select"
          sizes={PREVIEW_FONT_SIZES}
          value={previewFontSize}
          onChange={setPreviewFontSize}
        />
      </SettingRow>
    </section>
  );
}

const SELECT_CLASS =
  'rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800';

function SettingRow({
  id,
  label,
  note,
  children,
}: {
  id: string;
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {children}
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{note}</p>
    </div>
  );
}

function FontSizeSelect({
  id,
  sizes,
  value,
  onChange,
}: {
  id: string;
  sizes: number[];
  value: number;
  onChange: (size: number) => void;
}) {
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {sizes.map((size) => (
        <option key={size} value={size}>
          {size} px
        </option>
      ))}
    </select>
  );
}

function AboutSection() {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <div className="text-base font-semibold">kaleido</div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Monaco Editor ベースのローカル Web ファイルビューア
        </p>
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
          Copyright (c) 2026 bubble0601 — MIT License
        </p>
        <a
          className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
          href="https://github.com/bubble0601/kaleido"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/bubble0601/kaleido
        </a>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Third-party licenses</h3>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {licenses.length} packages
        </span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {licenses.map((entry) => (
          <li key={`${entry.name}@${entry.version}`} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs">
                {entry.name}
                <span className="text-neutral-500 dark:text-neutral-400"> {entry.version}</span>
              </span>
              <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                {entry.license}
              </span>
            </div>
            {entry.copyright && (
              <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {entry.copyright}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
