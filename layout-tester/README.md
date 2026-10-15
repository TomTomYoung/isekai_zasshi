# 本番Markdown組版テスター

更新日：2026-10-15。

## 利用者側の前提

**専用ローカルサーバーの起動、`npm run layout:tester`、専用APIへの接続は不要です。**

リポジトリを既存の静的プレビュー環境で開き、`layout-tester/index.html` を表示すれば、そのまま正本Markdownを読み、組版・計測・PNG出力まで行う構成です。

`npm run layout:tester` は自動試験や単純なローカル静的配信に使える補助コマンドとして残していますが、利用手順ではありません。

## 目的

Markdownを正本とする記事について、本番で使う組版処理そのものをブラウザ上で動かし、そのDOMを計測します。

```text
layout-source.json
  ↓
正本 Markdown
  ↓
本番 parseArticle と同一の parser
  ↓
tools/article-layout/template.css
  ↓
記事内 fonts/article.woff
  ↓
tools/article-layout/paginate.js
  ↓
.fixed-page
  ↓
計測・調整・PNG/ZIP
```

テスター専用のページ分割器で本番を再現する方式には戻しません。

## 読み込み

記事欄へ、たとえば次を指定します。

```text
202604/04_聖職者花見乱痴気騒ぎ
```

ブラウザは同じ静的Webルートから直接、

```text
202604/04_聖職者花見乱痴気騒ぎ/layout-source.json
202604/04_聖職者花見乱痴気騒ぎ/聖職者花見乱痴気騒ぎ.md
tools/article-layout/template.css
tools/article-layout/paginate.js
202604/04_聖職者花見乱痴気騒ぎ/fonts/font.json
202604/04_聖職者花見乱痴気騒ぎ/fonts/article.woff
```

をGETします。

`/__layout-tester/source` のような動的エンドポイントは使用しません。

CodeSwing等で `window.fetch` が差し替えられて日本語パスが変形される問題を避けるため、資産読込には同一originの空iframeから取得したブラウザ本来の `fetch` を使用します。

## Markdown parser

Node側の本番 `tools/article_source.mjs` 自体は変更しません。変更すると既存 `fixed_layout.html` の依存ハッシュ契約が変わるためです。

ブラウザではNode依存を持たない `tools/article_parse.mjs` を使用します。このファイルの `parseArticle()` 関数本体は本番側と同一に保ち、単体試験で

```text
parseArticle.toString()
```

の一致と、実記事04の解析結果一致を検査します。

したがってブラウザだけ別のMarkdown仕様へ拡張することは認めません。

## 本番組版

ブラウザ内で候補HTMLをメモリ生成します。

使用するものはリポジトリ上の本番資産です。

- `template.css`
- `paginate.js`
- 記事同梱の `article.woff`
- Markdownで明示された採用画像

`paginate.js` が生成した本文要素の `data-source="bNNN"` と、画像figureの `data-figure="bNNN"` を計測キーとして使います。

## 計測

選択した本番DOMについて、少なくとも次を表示します。

- W / H
- x / y
- margin 上右下左
- padding 上右下左
- 紙面端までの距離
- ページ番号
- 画像枠
- 元画像寸法
- 縦横比を保った可視範囲

画面上の縮小表示は計測値へ影響しません。

## 一時調整

本文文字サイズ、行高、画像枠高、および本番ブロック単位の幅・margin・padding等を一時設定できます。

設定変更後は、既に組んだ紙面の見た目だけを変えるのではなく、変更後CSSを含む候補HTMLを作り直し、本番 `paginate.js` を最初から実行します。

設定JSONも正本や本番HTMLを自動上書きしません。

## PNG / ZIP

PNG生成にも専用HTTPエンドポイントやPlaywrightサーバーを要求しません。

表示中の本番 `.fixed-page` DOMを複製し、

1. 選択枠を除去
2. 使用画像をdata URLへ自己完結化
3. 本番CSSと埋込フォントを保持
4. SVG `foreignObject` 経由でCanvasへラスタライズ
5. 1456×2056 PNGとしてダウンロード

します。

「全ページZIP」は同じ方法で各ページをPNG化し、ブラウザ内でZIPを作ります。

これは旧版の「独自rendererで別紙面を作ってからPNG化」とは異なります。PNG化の入力は、画面で検査した本番 `.fixed-page` DOMそのものです。

## 専用APIの廃止

PR #13で一度、次のローカル専用エンドポイントを導入しました。

```text
GET  /__layout-tester/source
POST /__layout-tester/compose
POST /__layout-tester/export
```

この方式は、利用者が `tools/layout_tester_server.mjs` を起動することを暗黙の前提にしていました。

静的プレビュー環境では、

```text
Cannot GET /__layout-tester/source
```

となり、画面は開けても正本MDを読めませんでした。

現行版ではこの依存を廃止しています。`tools/layout_tester_server.mjs` にも動的エンドポイントはなく、必要なら自動試験用の読取専用静的サーバーとしてだけ使えます。

## 初期対象と合格条件

初期対象：

```text
202604/04_聖職者花見乱痴気騒ぎ
```

既知の正本構成：

```text
45 blocks
5 figures
5 groups
6 pages
```

最低合格条件：

1. 専用APIへ一度もアクセスせず正本MDを読める。
2. ブラウザparserと本番parserの関数本体が一致する。
3. 実記事04が45 blocks / 5 figures / 5 groupsになる。
4. 本番ArticleSubsetを使用する。
5. 本番 `paginate.js` で6ページになる。
6. `auditArticleComposition()` が成功する。
7. 本番DOMをクリックして実寸を取得できる。
8. 設定変更後に本番paginateをやり直す。
9. ブラウザ内PNGが1456×2056になる。
10. 正本MD、画像、保存済み `fixed_layout.html`、既存PNGを変更しない。

自動ブラウザ試験では、`/__layout-tester/` へのrequestを記録し、1件でも発生したら失敗とします。
