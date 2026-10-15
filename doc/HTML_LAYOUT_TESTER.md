# Markdown組版HTMLテスター 仕様

更新日：2026-10-15。対象：TomTomYoung/isekai_zasshi。

## 1. 利用条件

利用者に専用ローカルサーバーの起動を要求しない。

```text
npm run layout:tester
```

は製品利用手順ではない。

既存の静的プレビュー環境で `layout-tester/index.html` を開けば、正本Markdownの読込、本番組版、計測、PNG/ZIP出力まで動作することを正規条件とする。

## 2. 目的

Markdownを正本とする記事について、本番組版のDOMそのものをブラウザで確認・計測する。

別のページ分割器で本番を模倣しない。

```text
layout-source.json
  ↓
正本 Markdown
  ↓
本番 parseArticle と同一の parser
  ↓
template.css
  ↓
記事同梱 ArticleSubset
  ↓
paginate.js
  ↓
.fixed-page
  ↓
計測・調整・PNG
```

## 3. 静的読込

記事パスが、

```text
202604/04_聖職者花見乱痴気騒ぎ
```

なら、ブラウザはリポジトリルートから直接次をGETする。

```text
202604/04_聖職者花見乱痴気騒ぎ/layout-source.json
202604/04_聖職者花見乱痴気騒ぎ/聖職者花見乱痴気騒ぎ.md
tools/article-layout/template.css
tools/article-layout/paginate.js
202604/04_聖職者花見乱痴気騒ぎ/fonts/font.json
202604/04_聖職者花見乱痴気騒ぎ/fonts/article.woff
```

動的な `/__layout-tester/*` エンドポイントは使用しない。

日本語パスについて、CodeSwing等による `window.fetch` 差替えの影響を避けるため、同一originの空iframeから得たブラウザ本来のfetchを使用する。

## 4. Markdown parser

Node本番の `tools/article_source.mjs` は既存 `fixed_layout.html` の依存ハッシュ契約に含まれるため、テスター都合で変更しない。

ブラウザ用にNode依存のない `tools/article_parse.mjs` を置く。

このファイルの `parseArticle()` 関数本体は、本番 `article_source.mjs` 内の関数本体と同一に保つ。

自動試験で、

```text
parseArticle.toString()
```

の一致を検査する。

さらに実記事04を両方へ入力し、解析結果の完全一致を検査する。

ブラウザ側だけ記法を追加・削除してはならない。

## 5. 本番候補HTML

候補HTMLはブラウザ内でメモリ生成する。

構成：

```text
<meta name="article-source-contract" content="1">
<meta name="layout-tester-candidate" content="static-browser">
<base href="記事フォルダー">
<style>
  @font-face ArticleSubset
  本番 template.css
  テスター一時設定
</style>
<main id="article-pages"></main>
<script id="article-source" type="application/json">...</script>
<script>本番 paginate.js</script>
```

フォントは記事の `article.woff` をdata URLとして候補HTMLへ埋め込む。

画像はMarkdownで指定された記事内相対パスを、`base` により記事フォルダーへ解決する。

## 6. 本番組版

本番 `paginate.js` をそのまま実行する。

本文要素：

```text
data-source="bNNN"
```

画像figure：

```text
data-figure="bNNN"
```

を計測キーとして使う。

独自の `.sheet` / `.flow` / `.block` ページネータを現行入口では使わない。

## 7. 計測

選択ブロックについて次を表示する。

- W / H
- x / y
- ページ番号
- margin 上右下左
- padding 上右下左
- 紙面端までの距離
- ブロック種別

figureでは追加で、

- 画像枠W/H
- 元画像W/H
- object-fit
- 縦横比を維持した可視範囲W/H

を表示する。

画面表示倍率はiframeの外側へ適用し、iframe内部の1456×2056座標を変えない。

## 8. 一時設定

version 1では次を候補CSSとして適用できる。

共通：

```text
body.fontSize
body.lineHeight
image.landscapeHeight
image.portraitHeight
```

ブロック別：

```text
width
fontSize
lineHeight
imageHeight
margin.top/right/bottom/left
padding.top/right/bottom/left
```

設定変更後は、旧DOMへCSSだけ後付けせず、候補HTMLを再構築して本番 `paginate.js` を最初から実行する。

## 9. 組版検査

候補生成後に `auditArticleComposition()` を実行する。

本番側の検査対象をそのまま利用する。

- 原稿ブロック順
- 分割範囲の連続性
- 本文欠落・重複
- 表行欠落・重複
- figure採用画像・alt・caption
- figure再掲identity
- 見出し孤立
- 主要部品重なり
- 画像/文字面積
- 本文下端

audit失敗時はPNG/ZIP出力を許可しない。

## 10. PNG / ZIP

PNG生成にも専用サーバーやPlaywright起動を要求しない。

画面で検査済みの `.fixed-page` DOMそのものを入力にする。

処理：

```text
.fixed-page をclone
  ↓
テスター選択枠を除去
  ↓
使用画像をdata URL化
  ↓
本番style + 埋込ArticleSubsetを保持
  ↓
SVG foreignObject
  ↓
Canvas
  ↓
1456×2056 PNG
```

全ページZIPは、同じ処理で各ページをPNG化し、ブラウザ内でZIPを生成する。

旧独自rendererをPNG入力にしてはならない。

## 11. 保護範囲

テスターから次を上書きしない。

- 正本Markdown
- `layout-source.json`
- 採用画像
- 保存済み `fixed_layout.html`
- `pages/`
- `intermediate/`
- 編集承認状態

テスター内の編集・設定変更はメモリ上だけに適用する。

## 12. 専用API方式の廃止

PR #13では、

```text
GET  /__layout-tester/source
POST /__layout-tester/compose
POST /__layout-tester/export
```

を `tools/layout_tester_server.mjs` に実装した。

この方式は利用者がそのサーバーを起動する前提となり、普通の静的プレビューでは、

```text
Cannot GET /__layout-tester/source
```

で停止した。

現行仕様ではこれらのエンドポイントを廃止する。

`tools/layout_tester_server.mjs` は必要なら自動試験で使う読取専用の静的サーバーに限定する。

## 13. 初期実記事

```text
202604/04_聖職者花見乱痴気騒ぎ
```

既知の構成：

```text
45 blocks
5 figures
5 groups
6 pages
1456 × 2056 px / page
```

## 14. 合格条件

最低条件：

1. 既存静的プレビューから開ける。
2. `/__layout-tester/*` へ1件もHTTP requestを出さない。
3. `layout-source.json` を直接読める。
4. 正本Markdownを日本語パスのまま直接読める。
5. ブラウザparserと本番parserの関数本体が一致する。
6. 04記事が45 blocks / 5 figures / 5 groupsになる。
7. ArticleSubsetがロードされる。
8. 本番paginate.jsで6ページになる。
9. `auditArticleComposition()` が成功する。
10. 本番DOMの実寸を取得できる。
11. 一時設定後に本番paginateを再実行する。
12. 現在ページのPNGが1456×2056になる。
13. PNG出力後も `/__layout-tester/*` requestが0件である。
14. 正本・既存HTML・既存PNGを変更しない。

利用者へ追加のサーバー起動手順を要求した時点で、この仕様を満たしていない。
