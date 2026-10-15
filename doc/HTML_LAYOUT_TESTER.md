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
layout-tester/paginate_compat.js
202604/04_聖職者花見乱痴気騒ぎ/fonts/font.json
202604/04_聖職者花見乱痴気騒ぎ/fonts/article.woff
```

動的な `/__layout-tester/*` エンドポイントは使用しない。

日本語パスについて、CodeSwing等による `window.fetch` 差替えの影響を避けるため、同一originの空iframeから得たブラウザ本来のfetchを使用する。

## 4. エクスプローラ記事フォルダー入力

利用者は記事パス入力だけでなく、「記事フォルダーをエクスプローラで選択」も利用できる。

フォルダー入力は `<input type="file" webkitdirectory multiple>` を使う。

選択結果から `layout-source.json` をちょうど1つ見つけ、そのファイルがある階層を記事フォルダーのルートとする。複数見つかった場合は、号フォルダー等を選んだものとして停止し、記事フォルダー単位の選択を要求する。

次を選択フォルダーから読む。

```text
layout-source.json
layout-source.json.source が指す正本MD
fonts/font.json
fonts/article.woff
figureで指定された採用画像
```

正本MD・フォント・画像をリポジトリ側の同名ファイルへ勝手に差し替えない。

本番 `template.css` は共用する。ページ分割は `layout-tester/paginate_compat.js` を使う。これは本番 `paginate.js` のアルゴリズムを基礎にした実ファイルで、画像なし節対応を追加する。

選択フォルダー内の画像はblob URLへ変換し、候補article-sourceのfigure srcにも同じblob URLを入れることで、本番 `auditArticleComposition()` の画像identity検査を維持する。

フォルダー入力を解除・別記事へ切り替えたときは、生成したblob URLをrevokeする。

## 5. 記事フォントfallback

記事フォルダーの `fonts/font.json` / `fonts/article.woff` は任意とする。

両方ある場合：

- 記事専用 `article.woff` を `ArticleSubset` として使用
- SHA-256を `font.json.sha256` と照合
- Markdown中の文字を `font.json.codepoints` と照合

両方ない場合：

- `202604/04_聖職者花見乱痴気騒ぎ/fonts/article.woff` を共通fallbackとして使用
- fallback WOFF自体のSHA-256は04の `font.json` と照合
- 記事固有のcodepoint検査は行わない
- fallback WOFFにない字形は `ArticleSubset,sans-serif` の後段へ委ねる

片方だけ存在する場合は資産不整合として停止する。

記事をテスターで読むためだけに、各記事へフォントsubsetを複製してはならない。

## 6. 202604互換層

本番 `parseArticle()` 自体は変更せず、その前後でテスター専用の互換処理を行う。

正規化対象：

- 既存figure属性
- 画像srcの `./` 有無
- h1直後のh2省略
- 画像なし節
- 1節複数画像
- inlineの太字・強調・code・linkの表示文字化
- 引用中の空 `>`
- `<br>`
- `<small>`
- 区切り線
- 単純な箇条書き

画像なし節ではfigureを推測しない。テキストだけのページを生成する。

1節複数画像では画像を削除せず、内部組版グループを分割する。

正規化はメモリ上のみで行い、正本Markdownへ書き戻さない。

## 7. Markdown parser

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

## 8. 本番候補HTML

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
<script>layout-tester/paginate_compat.js</script>
```

フォントは記事の `article.woff` をdata URLとして候補HTMLへ埋め込む。

画像はMarkdownで指定された記事内相対パスを、`base` により記事フォルダーへ解決する。

## 9. 本番組版

### 文字列置換禁止

本番 `paginate.js` のソース文字列を検索し、断片置換して互換化する方式は禁止する。改行・空白・小変更で適用不能になるためである。

テスターの互換差分は `layout-tester/paginate_compat.js` の実ファイルとして管理し、構文検査とブラウザ試験の対象にする。

`layout-tester/paginate_compat.js` を実行する。文字列検索・置換で本番 `paginate.js` を実行時改造してはならない。

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

## 10. ChatGPT指示範囲

紙面上の任意矩形を、組版修正指示の対象として指定できること。

対象は本文・画像等のDOM要素に限定しない。空白領域も選択できる。

指示矩形はページ内CSS pxで保持する。

保持項目：

- 記事パス
- 正本MD名
- 入力種別
- ページ番号 / 総ページ数
- 紙面サイズ1456×2056
- x / y / W / H
- 空白または要素上
- 範囲に重なる `data-source` / `data-figure`
- 直前のブロック
- 直後のブロック
- text-only pageか
- 当該pageのfigure id
- 任意指示文

コピー文字列末尾へ `LAYOUT_TARGET_JSON` を付け、別会話でも対象位置を復元できる情報量を持たせる。

選択矩形は赤枠オーバーレイとしてpageに置く。ただしabsolute配置とし、組版計測へ影響させない。

通常PNG/ZIPでは `.layout-instruction-region` を必ず除去する。

指示PNGだけは赤枠を残して1456×2056で出力できる。

対応ブラウザでは `ClipboardItem` に `text/plain` と `image/png` を載せる。失敗時は位置情報テキストのコピーへフォールバックする。

## 11. 計測

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

## 12. 一時設定

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

設定変更後は、旧DOMへCSSだけ後付けせず、候補HTMLを再構築して `paginate_compat.js` を最初から実行する。

## 13. 組版検査

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

## 14. PNG / ZIP

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

## 15. 保護範囲

テスターから次を上書きしない。

- 正本Markdown
- `layout-source.json`
- 採用画像
- 保存済み `fixed_layout.html`
- `pages/`
- `intermediate/`
- 編集承認状態

テスター内の編集・設定変更はメモリ上だけに適用する。

## 16. 専用API方式の廃止

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

## 17. 初期実記事

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

## 18. 合格条件

最低条件：

1. 既存静的プレビューから開ける。
2. `/__layout-tester/*` へ1件もHTTP requestを出さない。
3. `layout-source.json` を直接読める。
4. 正本Markdownを日本語パスのまま直接読める。
5. エクスプローラから実記事04フォルダーを選び、正本MD・5採用画像・記事フォントをFileから解決できる。
6. ブラウザparserと本番parserの関数本体が一致する.
7. 04記事が45 blocks / 5 figures / 5 groupsになる。
8. ArticleSubsetがロードされる。
9. `paginate_compat.js` で04記事が6ページになる。
10. `auditArticleComposition()` が成功する。
11. 本番DOMの実寸を取得できる。
12. 一時設定後に互換ページネータを再実行する。
13. エクスプローラ入力の状態でも現在ページのPNGが1456×2056になる。
14. PNG出力後も `/__layout-tester/*` requestが0件である。
15. 正本・既存HTML・既存PNGを変更しない。

利用者へ追加のサーバー起動手順を要求した時点で、この仕様を満たしていない。
