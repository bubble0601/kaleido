// JSON は monaco の monarch 定義群 (languages/definitions) に含まれず、
// worker ベースの languages/features/json が担当している。worker を読み込まない
// 構成のため、monarch トークナイザを自前で登録する。
// トークン名は本家 json mode と同じ (string.key.json 等) にして vs / vs-dark の
// テーマ配色をそのまま効かせる。
import * as monaco from 'monaco-editor/editor/editor.api.js';

monaco.languages.register({
  id: 'json',
  extensions: ['.json', '.jsonc', '.json5', '.babelrc', '.eslintrc', '.prettierrc'],
  filenames: ['.babelrc', '.eslintrc', '.prettierrc', 'composer.lock'],
  aliases: ['JSON', 'json'],
  mimetypes: ['application/json'],
});

monaco.languages.setLanguageConfiguration('json', {
  brackets: [
    ['{', '}'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  // jsonc 用
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
});

monaco.languages.setMonarchTokensProvider('json', {
  defaultToken: '',
  tokenPostfix: '.json',
  tokenizer: {
    root: [
      // キー ("...": の形)
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'string.key'],
      // 文字列値
      [/"(?:[^"\\]|\\.)*"/, 'string.value'],
      [/\b(?:true|false)\b/, 'keyword'],
      [/\bnull\b/, 'keyword'],
      [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/[{}\[\]]/, 'delimiter.bracket'],
      [/[,:]/, 'delimiter'],
      // jsonc のコメント
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/[ \t\r\n]+/, ''],
    ],
    comment: [
      [/\*\//, 'comment', '@pop'],
      [/[^*]+/, 'comment'],
      [/./, 'comment'],
    ],
  },
});
