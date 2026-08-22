# kaleido

Monaco Editor ベースのローカル Web ファイルビューア。CLI から起動し、ブラウザで手元のファイルを読む・比較する・レビューする。git リポジトリなら diff レビューができ、**git 管理外のディレクトリでもそのまま開ける**。

![diff から Docs・Markdown プレビュー・HTML プレビューまでの操作](docs/kaleido-demo.gif)

## 特長

- 対象プロジェクトの `ts.LanguageService` を動かすので、型ホバー・定義ジャンプ・参照検索が IDE と同じ内容になる
- Markdown は目次と mermaid 付きでプレビュー、HTML はレンダリングして表示
- 読みながらその場で編集・保存でき、外部からの変更も自動で反映される
- 行コメントとレビュー済みマークはサーバー側に残り、AI へ渡せる形式でコピーできる

## インストール

Node.js 20 以上が必要。コマンド名は `kaleido`。

```bash
npx @adanami/kaleido            # インストールせずに試す
npm install -g @adanami/kaleido # 常用する (pnpm add -g でも可)
```

## 使い方

```bash
kaleido                     # cwd。git 管理下なら自動判定、そうでなければファイル閲覧モード
kaleido ./docs              # そのディレクトリを開く
kaleido working             # unstaged changes (index vs working tree)
kaleido staged              # staged changes (HEAD vs index)
kaleido <commit>            # そのコミットの diff (<commit>^ vs <commit>)
kaleido <target> <base>     # 任意の比較 (base vs target)

kaleido comments [target] [base]   # 保存済みコメントを AI プロンプト形式で stdout に出力
```

位置引数は「ディレクトリ」または「比較範囲」。commit-ish として解決できなければディレクトリと解釈する (`--dir` で明示もできる)。
引数なしのときは staged 変更 → working 変更 → 直近コミットの順に自動判定する。

表示中の状態は URL クエリ (`?target=&base=&path=&tab=`) に同期されるので、リロード・共有できる。

| オプション | 説明 |
|---|---|
| `--port <port>` | 使用ポート (既定 4890、埋まっていれば自動加算) |
| `--host <host>` | バインドホスト (既定 127.0.0.1) |
| `--dir <path>` | 対象ディレクトリ (既定 cwd)。`--repo` は別名 |
| `--exclude <pattern>` | ファイル一覧から隠すパターンを追加 (繰り返し可) |
| `--no-open` | ブラウザを自動で開かない |
| `--no-keep-alive` | 全タブが閉じられたらサーバーを終了する |

キーボード: `j` / `k` でファイル移動、`v` でレビュー済みトグル、⌘P で Quick Open、⌘B でサイドバー、⌘S で保存。

## 機能

- **サイドバー**: `Changes` (比較対象) / `Files` (全ファイル) / `Docs` (Markdown・HTML だけの一覧) をアイコン帯で切替
- **表示モード**: side-by-side diff / inline diff / ファイル単体表示
- **Markdown プレビュー**: `github-markdown-css` + 日本語の組版調整。見出しの目次、mermaid の描画、コードブロックのコピー。編集中の内容をライブで反映
- **HTML プレビュー**: `/preview` から配信するので相対パスの CSS / JS / 画像も読め、スクリプトも動く
- **型情報と診断**: hover / 型エラー / 定義ジャンプ / 参照検索と、プロジェクトの eslint による行マーカー
- **レビュー** (git のみ): 比較範囲の切替、内容ハッシュで残るレビュー済みマーク、行/範囲コメント。状態はサーバー側にファイル保存されるのでブラウザを変えても消えない
- **設定**: 歯車から配色 (既定は OS 追従) と文字サイズ、ライセンス表記

![型情報のホバーと行コメント](docs/kaleido-demo-hover-comment.gif)

### ファイル一覧の除外設定

既定で `node_modules` / `.git` / `dist` / `.next` などを除外する (git リポジトリでは加えて gitignore が効く)。
ルート直下に `.kaleido.json` を置くと上書きできる。

```json
{
  "exclude": ["docs/generated", "**/*.min.js"],
  "useDefaultExcludes": true,
  "maxFiles": 20000
}
```

`exclude` は gitignore 風のパターン (`/` を含まなければ任意階層のベース名にマッチ)。
`useDefaultExcludes: false` で既定の除外リストを使わない。`maxFiles` は一覧の件数上限。

## 開発

```bash
pnpm install
pnpm dev                          # API サーバー (tsx watch) + vite dev server
pnpm typecheck
pnpm build                        # tsup (cli/server) + vite build (client)
```

## アーキテクチャ

```
src/
├── shared/    # クライアント・サーバー共有型
├── cli/       # commander エントリ。引数解釈 → サーバー起動 → ブラウザオープン
├── server/    # Hono。files (git 非依存のファイル層) / git / ts / store / eslint / watcher
└── client/    # React 19 + Monaco
```

設計上のポイント:

- **TS ワーカーはバンドルしない**: 型情報はサーバーで対象プロジェクトの TypeScript を動かし、`/api/lang/*` への proxy provider で供給する
- **型ホバーは modified 側のみ**: old 側は当時の依存を再現できず誤情報になるため
- **git は「あれば使う」層**: 比較なしの状態も `{ target: 'browse', base: 'browse' }` という擬似 range で表し、diff モードと処理を共通化している
- **プレビューは隔離する**: `allow-same-origin` なしの sandbox iframe で開き、`/api/*` は `Origin` を見て別オリジンからのリクエストを 403 にする
