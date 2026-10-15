# 組版テスターの検証

更新日：2026-10-15。

## 現行版の対象

現行版は「専用ローカルサーバーなし」で動くことを検証対象にする。

利用者へ `npm run layout:tester` を要求しない。`tools/layout_tester_server.mjs` は自動ブラウザ試験で普通の静的HTTP配信を再現するためだけに使う。

## 単体試験

`tests/layout-tester/unit.mjs` では次を確認する。

- 既存静的サーバーの日本語パス配信
- ZIP基礎処理
- 一時設定の型・範囲
- ブラウザ用 `parseArticle()` と本番 `parseArticle()` の関数本体完全一致
- 実記事04に対する解析結果完全一致
- `layout-source.json` がある202604本文24件をすべて互換parserで解析
- 04記事が45 blocks / 5 figures / 5 groups
- `layout-tester/app.mjs` に `/__layout-tester/` 依存がない
- 本番 `layout-source.json` とbrowser exportを使う構造
- ブラウザ試験がsandbox無効化やメモリ注入へ逃げない

## ブラウザ試験

`tests/layout-tester/browser.mjs` は普通の静的HTTPサーバーから、

```text
/layout-tester/
```

を開く。

全requestを監視し、

```text
/__layout-tester/
```

で始まるrequestが1件でもあれば失敗させる。

実記事04で確認する項目：

1. `layout-source.json` と正本MDを静的GETできる。
2. エクスプローラ記事フォルダー入力へ、記事専用font.json/article.woffを持たない03ディレクトリを渡し、正本MD・採用画像をローカルFileから読める。
3. 記事専用フォントがない03では04の共通ArticleSubset fallbackを使う。
3. リポジトリ入力では候補に `layout-tester-candidate=static-browser`、フォルダー入力では `folder-browser` が付く。
4. 候補に `article-source-contract=1` がある。
5. 45 blocks / 5 figures / 5 groups。
6. 本番ArticleSubset使用。
7. フォルダー入力のscene-imageがすべてローカルblob URLから正常ロードされる。
8. 本番paginate.jsで6ページ。
9. audit成功。
10. `.fixed-page` が1456×2056。
11. 本番blockをクリックして実寸を取得。
12. 一時CSS変更後に本番paginateで再組版。
13. フォルダー入力状態の現在DOMからブラウザ内PNGをダウンロード。
14. PNGが1456×2056。
15. PNG出力後も専用endpoint requestが0件。
16. 未処理browser errorが0件。

## 実行コマンド

開発・CIで自動試験を行う場合のみ：

```sh
npm ci
npx playwright install chromium
npm run test:layout-tester
```

これは**利用者が組版テスターを使うための手順ではない**。

## 現時点

変更後ソースの構文確認は成功している。

この作業環境ではGitHubへのネットワークcloneとloopback Chromium実行ができないため、現行静的版のruntime/browser成功件数はまだ記録しない。

旧独自renderer版、PR #13の専用API版の試験成功数を現行版へ合算しない。
