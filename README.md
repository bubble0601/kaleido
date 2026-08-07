# kaleido

Monaco Editor ベースのローカル Web diff viewer。CLI から起動し、ブラウザで git diff をレビューする。

- **Monaco DiffEditor** による side-by-side / inline diff 表示、ファイル単体表示
- **本物の TypeScript 型情報ホバー**: サーバー側で対象プロジェクトの tsconfig + node_modules を使って `ts.LanguageService` を起動し、hover / 型エラーを表示 (Monaco 内蔵 TS ワーカーは不使用)
- **ESLint 診断**: プロジェクトの `node_modules/.bin/eslint` を実行して行マーカー表示 (working tree 系比較のみ)
- **レビュー済みマーク**: diff 内容のハッシュをキーに保存。比較範囲を切り替えても同一内容なら既読を維持
- **行/範囲コメント**: エディタ内インライン表示、difit 互換形式で AI プロンプトとしてコピー可能
- **比較範囲の切替**: working tree / staged / commit / branch (merge-base) を UI から変更
- **自動リロード**: ファイル変更を watch して SSE で反映
- コメント・レビュー済み状態は **サーバー側でファイル保存** (`~/Library/Application Support/kaleido` / XDG data dir)。ブラウザを変えても保持される

## 使い方

```bash
kaleido                     # HEAD と working tree の diff (全 uncommitted changes)
kaleido working             # unstaged changes (index vs working tree)
kaleido staged              # staged changes (HEAD vs index)
kaleido <commit>            # そのコミットの diff (<commit>^ vs <commit>)
kaleido <target> <base>     # 任意の比較 (base vs target)
```

オプション:

| オプション | 説明 |
|---|---|
| `--port <port>` | 使用ポート (既定 4890、埋まっていれば自動加算) |
| `--host <host>` | バインドホスト (既定 127.0.0.1) |
| `--repo <path>` | 対象リポジトリ (既定 cwd) |
| `--no-open` | ブラウザを自動で開かない |
| `--no-keep-alive` | 全タブが閉じられたらサーバーを終了する |

キーボード: `j` / `k` でファイル移動、`v` でレビュー済みトグル (次ファイルへ自動移動)。

## 開発

```bash
pnpm install
pnpm dev                          # API サーバー (tsx watch) + vite dev server
KALEIDO_TARGET_REPO=../some-repo pnpm dev -- HEAD~5   # 対象リポジトリ・範囲を指定
pnpm typecheck
pnpm build                        # tsup (cli/server) + vite build (client)
node dist/cli/index.js --repo ../some-repo
```

## アーキテクチャ

```
src/
├── shared/    # クライアント・サーバー共有型 (RangeSpec, DiffFileMeta, Comment, Diagnostic...)
├── cli/       # commander エントリ。引数解釈 → サーバー起動 → ブラウザオープン
├── server/    # Hono
│   ├── git/       # simple-git + git cat-file による diff 取得・全文取得
│   ├── ts/        # ts.LanguageService 管理 (最近傍 tsconfig 探索, overlay, warm-up)
│   ├── store/     # コメント / viewed の JSON 永続化 (atomic write)
│   ├── eslint.ts  # プロジェクトの eslint を --format json で実行
│   └── watcher.ts # @parcel/watcher + SSE
└── client/    # React 19 + Monaco
    ├── monaco/    # ワーカー構成 (editor worker のみ)、hover provider proxy、markers
    └── components/ # DiffEditor 1 インスタンス + ファイルツリー + ViewZone コメント
```

設計上のポイント:

- **TS ワーカーを一切バンドルしない**: `monaco-editor/features/register.all` (エディタ機能) と `languages/definitions/*` (monarch ハイライトのみ) を個別 import。型情報は `/api/lang/hover` への proxy provider で供給
- **型ホバーは modified 側のみ**: old 側は依存の当時状態を再現できず誤情報になるため。staged/commit 比較時は表示中の全文を overlay として添付し「approximate」注記付きで表示
- **TS 本体は対象プロジェクトのものを優先**: `require.resolve('typescript', { paths: [repo] })`。TS7 (native) は LanguageService API が無いため同梱の TS5 にフォールバック
