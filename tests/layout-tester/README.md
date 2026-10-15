# 組版テスターの検証

## 2026-10-15 本番組版経路への再構築

現行 `layout-tester` は、初版の独自Markdownパーサー／独自レンダラーを入口から外し、本番記事の `article_source.mjs`、`template.css`、埋込 `ArticleSubset`、`paginate.js` を使う構成へ変更しました。

そのため、以下の旧試験結果を現行版の成功件数へ合算しません。

- 初版の純粋ロジック52件
- 初版のメモリ注入ブラウザ22件
- 後続版のロジック・HTTP 55件
- 管理環境でHTTP遷移前に停止したブラウザ0件

旧記録は比較用の履歴です。

## 現行の試験対象

### 単体・HTTP

`tests/layout-tester/unit.mjs` では従来の安全性検査に加えて、実際の次の記事を使います。

```text
202604/04_聖職者花見乱痴気騒ぎ
```

確認項目：

- `/__layout-tester/source` が `layout-source.json` の正本MDを返す
- 正本以外のパスを拒否する
- `/__layout-tester/compose` が本番source contractを持つ候補HTMLを返す
- 候補HTMLが `ArticleSubset` と本番runtimeを保持する
- テスター一時CSSが候補へ入る
- 候補から `article-render-sha256` を外し、本番同期済みHTMLと区別する
- 通常静的ファイルへのPOSTは引き続き拒否する
- 設定値・ブロックIDの範囲を検証する

### ブラウザ

`tests/layout-tester/browser.mjs` もdemo.mdではなく実記事04を開きます。

確認項目：

- 正本記事が初期表示される
- `article-source-contract=1`
- `layout-tester-candidate=1`
- `.fixed-page` が1456×2056
- ArticleSubset使用
- `auditArticleComposition()` 成功
- 本番 `data-source` / `data-figure` の実寸取得
- 一時CSS変更後に同じ本番rendererで再組版
- PNGが本番候補 `.fixed-page` の直接スクリーンショットで1456×2056
- 未処理ブラウザエラーなし

Chromium sandboxは有効のままです。テストのために `--no-sandbox` を追加しません。

## 実行

```sh
npm ci
npx playwright install chromium
npm run test:layout-tester
```

単体・HTTPのみ：

```sh
node tests/layout-tester/unit.mjs
```

既存Chromiumを使う場合：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:layout-tester
```

## 現時点の検証状態

GitHub上の変更後ファイルについて、V8による構文確認は行っています。

```text
layout-tester/app.mjs                  syntax OK
tools/layout_tester_server.mjs        syntax OK
tests/layout-tester/unit.mjs          syntax OK
tests/layout-tester/browser.mjs       syntax OK
```

ただし、この作業環境ではGitHubリポジトリをローカルcloneできず、loopback HTTPを使った現行版のNode/Chromium試験は実行できていません。

したがって、現行本番組版テスターについて「ブラウザ試験N件成功」とはまだ記録しません。`results.json` も、旧結果を現行成功値として扱わない形に更新します。

環境側がloopback HTTPを `ERR_BLOCKED_BY_ADMINISTRATOR` 等で拒否した場合、その保護を解除したり、メモリ注入経路へ切り替えて成功扱いにはしません。

## 旧試験の履歴

初版では、Linux / Chromium 144 / Node 22.16で、独自レンダラーを使うメモリ上ブラウザハーネス22件が成功しました。

その後、メモリ注入経路とsandbox無効化指定を削除し、実HTTP経路だけを使う版では、ロジック・HTTP 55件が成功した一方、ブラウザはloopback遷移を管理環境に拒否され、試験開始前に停止しました。

これらは、今回の「本番rendererを使うテスター」の合格証拠ではありません。
