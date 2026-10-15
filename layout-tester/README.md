# 本番Markdown組版テスター

更新日：2026-10-15。

## 目的

このテスターは、独自のMarkdownレンダラーで誌面を再現するものではありません。

`layout-source.json` を持つ本番記事について、

```text
正本Markdown
  ↓
tools/article_source.mjs の parseArticle
  ↓
tools/article-layout/template.css
  ↓
記事内の埋込 ArticleSubset フォント
  ↓
tools/article-layout/paginate.js
  ↓
.fixed-page
```

という本番組版経路をそのまま使い、そのDOMへ計測UIを重ねます。

本文・画像・既存 `fixed_layout.html`・既存PNGはテスターから上書きしません。画面内で編集したMarkdownと設定値はメモリ上の候補にだけ適用されます。

## 起動

リポジトリ直下で実行します。

```sh
npm run layout:tester
```

ブラウザで次を開きます。

```text
http://127.0.0.1:4173/layout-tester/
```

初期対象は、現在本番Markdown同期が通っている次の記事です。

```text
202604/04_聖職者花見乱痴気騒ぎ
```

「記事ディレクトリ または 正本MD」には、たとえば次のどちらかを指定できます。

```text
202604/04_聖職者花見乱痴気騒ぎ
202604/04_聖職者花見乱痴気騒ぎ/聖職者花見乱痴気騒ぎ.md
```

MDパスを直接指定した場合は、その記事の `layout-source.json` が指す正本MDと一致していることを確認します。

## 何が本番と共通か

候補HTMLは `prepareArticle()` が生成した本番HTMLを土台にします。

本番と共通なのは次です。

- 制約付きMarkdownパーサー `parseArticle`
- `template.css`
- 記事に同梱された `fonts/article.woff`
- `paginate.js`
- 採用画像
- `auditArticleComposition()`
- `.fixed-page` 1456×2056px
- 本文分割、表分割、見出し孤立防止、画像再掲、画像/文字面積判定

テスター固有なのは次だけです。

- Markdown本文のメモリ上差替え
- 一時CSS調整
- 選択枠
- W/H、x/y、margin、padding、紙面端距離の表示
- PNG/ZIPのダウンロードUI

候補HTMLでは、保存済みHTMLの正当性を示す `article-render-sha256` を外し、`layout-tester-candidate=1` を付けます。したがって候補を「同期済み fixed_layout.html」と誤認しません。

## Markdown編集

左側のテキスト欄を編集して「このMDで本番組版」を押すと、保存せずに本番パーサーへ再投入します。

「手元のMDで一時差替え」は、現在選択中の記事の画像・フォント・テンプレートを使ったまま、ローカルMDの本文だけを候補へ差し替えます。

本番パーサーで未対応の記法、節ごとのfigure数不整合、画像欠落、埋込フォント未収録文字は、本番と同じく停止理由です。テスター専用パーサーへフォールバックしません。

## 寸法確認

本番 `paginate.js` は本文要素へ `data-source="bNNN"`、画像figureへ `data-figure="bNNN"` を付けています。

テスターはこれを使ってブロックを選択し、現在の本番DOMから次を取得します。

- W / H
- x / y
- margin 上右下左
- padding 上右下左
- 紙面端までの距離
- 画像枠
- 元画像寸法
- object-fit後の可視範囲

値は画面ズーム前のCSS pxです。

## 一時設定JSON

設定JSONは候補HTMLへCSSオーバーライドとして注入されます。そのCSSが効いた状態で、同じ `paginate.js` が最初から改ページをやり直します。

現在のversionは1です。

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
      "imageHeight": 700,
      "margin": {"top": 0, "right": 0, "bottom": 18, "left": 0},
      "padding": {"top": 0, "right": 0, "bottom": 0, "left": 0}
    }
  }
}
```

個別設定は本番DOMの `data-source` / `data-figure` に対して適用します。

このJSONは現時点では**テスター候補の調整値**です。保存済み本番HTMLへ自動反映・自動上書きはしません。採用する値が決まった後、本番テンプレートまたは記事仕様へ反映する工程は別にします。

## PNG / ZIP

「このページをPNG」「全ページZIP」は、画面用の別レンダラーから画像化しません。

サーバー側で同じ候補HTMLをもう一度生成し、sandboxを有効にしたChromiumで候補ページを開き、`.fixed-page` を直接スクリーンショットします。

1ページは必ず次の寸法を検査します。

```text
1456 × 2056 px
```

全ページZIPも、その同じPNGをページ順に格納します。

PNG出力にはPlaywright Chromiumが必要です。プレビュー自体は、本番候補HTMLをブラウザ内iframeへ表示します。

## 安全性

付属サーバーは127.0.0.1限定です。

通常ファイルはGET/HEADの読取専用です。POSTを受け付けるのは次のメモリ処理だけです。

```text
/__layout-tester/compose
/__layout-tester/export
```

これらは原稿や出力をリポジトリへ書き込みません。

cross-site要求、異なるOrigin、リポジトリ外パス、正本でないMD指定を拒否します。

## 旧試作コード

次のファイルは初版の汎用独自レンダラー実装として残っていますが、現在の `layout-tester/index.html` からは使用しません。

```text
layout-tester/renderer.mjs
layout-tester/export.mjs
layout-tester/defaults.json
```

`core.mjs` はZIP生成など一部の共通処理のみ利用しています。

旧試作の成功件数を、本番組版テスターの成功実績へ合算しません。

## 検証

```sh
npm run test:layout-tester
```

単体試験は、実際の04記事について正本MD読込と候補HTML生成まで確認します。

ブラウザ試験は、HTTP経路から04記事を開き、

- 本番source contract
- 本番fixed-page DOM
- ArticleSubset
- auditArticleComposition
- ブロック実測
- 一時CSSによる本番再組版
- 1456×2056 PNG出力

を確認します。

環境側がloopback HTTPを拒否した場合は、その制限を迂回して成功扱いにはしません。
