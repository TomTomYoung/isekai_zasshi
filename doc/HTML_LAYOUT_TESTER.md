# Markdown組版HTMLテスター 仕様

更新日：2026-10-15。対象：TomTomYoung/isekai_zasshi。

## 1. 目的

Markdownを正本とする記事について、**本番の組版経路そのもの**をブラウザで確認し、本文・画像・余白の実寸を測定する。

テスター専用のMarkdownパーサー、ページ分割器、誌面CSSを本番とは別に持たない。

本番記事では次を共用する。

```text
layout-source.json
  ↓
正本 .md
  ↓
tools/article_source.mjs / parseArticle()
  ↓
tools/article-layout/template.css
  ↓
記事同梱 fonts/article.woff
  ↓
tools/article-layout/paginate.js
  ↓
.fixed-page
```

テスターは、この本番候補DOMへ計測・調整・出力UIを追加する。

## 2. 保護範囲

`layout-tester` から次を上書きしない。

- 正本Markdown
- `layout-source.json`
- 採用画像
- `fixed_layout.html`
- `pages/`
- `intermediate/`
- 記事承認状態

テスターで編集したMarkdownと設定値はメモリ上の候補にだけ反映する。

候補HTMLからは `article-render-sha256` を除き、`layout-tester-candidate=1` を付与する。候補を本番同期済みHTMLとして扱わない。

## 3. 初期対象

本番Markdown同期が確認済みの次の記事を初期対象とする。

```text
202604/04_聖職者花見乱痴気騒ぎ
```

記事指定は次のどちらでもよい。

```text
202604/04_聖職者花見乱痴気騒ぎ
202604/04_聖職者花見乱痴気騒ぎ/聖職者花見乱痴気騒ぎ.md
```

MDパスを指定した場合は、その記事の `layout-source.json.source` と一致しなければ拒否する。

## 4. 原稿の扱い

テスターは `parseArticle()` を直接使う。

したがって、対応記法・未対応記法・figure構造・節構造は本番と同じである。

未対応記法をテスターだけで平文化しない。画像を推測採用しない。

画面内でMarkdownを編集した場合も、再度 `parseArticle()` を通す。

埋込フォントに未収録の文字が追加された場合は停止する。

MDから参照された画像が記事フォルダーに存在しない場合も停止する。

## 5. 本番候補HTML

候補HTMLの土台は `prepareArticle()` が生成するHTMLである。

テスターは次だけをメモリ上で差し替える。

1. `article-source` JSON
2. 一時CSS設定
3. 記事資産を解決する `base`

テンプレートCSS、埋込フォント、`paginate.js` は本番生成物をそのまま使う。

## 6. 計測対象

本番 `paginate.js` が生成する次の属性を選択キーとする。

```text
data-source="bNNN"
data-figure="bNNN"
```

選択したブロックについて次を表示する。

- W / H
- x / y
- margin 上右下左
- padding 上右下左
- 紙面端までの距離
- ページ番号
- ブロック種別

画像figureでは追加で次を表示する。

- 画像要素の枠W/H
- 元画像W/H
- object-fit
- 実可視領域W/H

画面ズームは計測値へ影響させない。

## 7. ページ表示

本番ページは1456×2056 CSS pxで保持する。

中央プレビューではiframe自体を外側から縮小表示する。iframe内部のDOM寸法は変えない。

ページ移動は、本番文書中の各 `.fixed-page` 位置へiframeをスクロールする。

## 8. 一時設定

version 1では次を候補HTMLへCSSオーバーライドとして注入できる。

### 共通

```text
body.fontSize
body.lineHeight
image.landscapeHeight
image.portraitHeight
```

### ブロック別

```text
width
fontSize
lineHeight
imageHeight
margin.top/right/bottom/left
padding.top/right/bottom/left
```

例：

```json
{
  "version": 1,
  "body": {
    "fontSize": 28,
    "lineHeight": 42
  },
  "image": {
    "landscapeHeight": 885,
    "portraitHeight": 1030
  },
  "blocks": {
    "b003": {
      "width": 1200,
      "fontSize": 30,
      "lineHeight": 44,
      "margin": {
        "bottom": 18
      }
    }
  }
}
```

設定を変えるたびに、変更後CSSを適用した状態で本番 `paginate.js` を最初から実行する。

既存ページへ見た目だけ後付けし、ページ分割結果を旧状態のまま残す方式は禁止する。

## 9. 組版検査

候補生成後、`auditArticleComposition()` を実行する。

少なくとも次を本番側検査として扱う。

- 原稿ブロック順
- 本文分割範囲の連続性
- 本文欠落・重複
- 表行欠落・重複
- figure採用画像・alt・caption
- figure再掲identity
- 見出し孤立
- 主要部品重なり
- 画像/文字面積
- 本文下端

audit失敗時はPNG出力を許可しない。

## 10. PNG出力

ブラウザ画面用の別レンダラーからPNGを作らない。

出力時は、現在のMarkdownと設定からサーバー側で同じ候補HTMLを再構築する。

sandboxを有効にしたChromiumで候補HTMLを同一originから開き、`.fixed-page` 要素を直接スクリーンショットする。

PNG寸法は必ず次を確認する。

```text
1456 × 2056
```

全ページ出力では、同じ方法で得たPNGをZIPへ格納する。

## 11. HTTPサーバー

通常のリポジトリファイルはGET/HEAD専用とする。

テスター専用API：

```text
GET  /__layout-tester/source
POST /__layout-tester/compose
POST /__layout-tester/export
```

POSTはメモリ上の組版・画像化だけに使い、リポジトリへ書き込まない。

127.0.0.1のみで待受ける。

次を拒否する。

- cross-site
- 異なるOrigin
- リポジトリ外パス
- `..`
- 隠しパス
- 正本でないMD
- 不正設定
- 過大な原稿/JSON

## 12. 旧初版との関係

初版では、`layout-tester/core.mjs` / `renderer.mjs` / `export.mjs` に独自Markdown組版器を実装していた。

これは本番 `article_source.mjs` / `template.css` / `paginate.js` と別系統であり、実記事の本番誌面を保証できなかった。

現行入口では独自 `renderer.mjs` と `export.mjs` を使わない。

`core.mjs` はZIP生成等の共通処理だけ利用する。

初版の模擬ブラウザ試験成功数を、現行本番テスターの成功実績へ合算しない。

## 13. 合格条件

現行の最低合格条件は、実記事04で次が成立すること。

1. 正本MDをリポジトリから読める。
2. 候補HTMLに `article-source-contract=1` がある。
3. 候補HTMLに `ArticleSubset` がロードされる。
4. `.fixed-page` が1456×2056で生成される。
5. `auditArticleComposition()` が成功する。
6. 本番ブロックをクリックして実寸を取得できる。
7. 一時設定変更後に同じ `paginate.js` が再組版する。
8. PNG出力が1456×2056になる。
9. 正本MD・既存HTML・既存PNGを変更しない。

ブラウザ環境がloopback HTTPを管理ポリシーで拒否した場合、その制限を迂回した模擬経路を合格条件へ置き換えない。
