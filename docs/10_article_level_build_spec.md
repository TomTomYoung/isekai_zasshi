# 記事単位ビルド：現行実装と運用上の制限

更新日：2026-09-23。
照合基準：`7c1f911b0e321de73648df3e38ce1a9bb3abb628`。

この文書は現在のコードが行う処理を示します。今回ビルドを実行した記録や、202604全号がビルド可能という宣言ではありません。202603は今回の変更・再生成対象外です。

## 実行環境と正本

Node.jsとPlaywright Chromiumを実行できるPC・サーバー等が必要です。Pythonを使用する後段ではPythonも必要です。通常の `vscode.dev` / `github.dev` 単体にこれらの実行環境がある前提にしません。

本文はMarkdownが正本ですが、これらのPNGビルドは既存の固定HTMLを撮影する処理です。MarkdownからHTMLの生成・同期は別工程です。[正本規則](09_markdown_source_rule.md) を参照してください。

lockfileを使う環境準備の例です。リポジトリ直下で実行するもので、文書監査中に実行済みとはしていません。

```bash
npm ci
npx playwright install chromium
```

## 出力先の違い

```text
記事フォルダ/preview/
  preview_fixed_layout_article_here.mjs の確認用PNG

記事フォルダ/intermediate/
  build_article.mjs の中間コピー・計測結果・記事manifest

記事フォルダ/pages/
  build_article.mjs の記事内連番PNG

exports/<issue>/fixed_layout_images/
  export_fixed_layout_images.mjs の記事名付きPNG

exports/<issue>/kindle_pages/
  号全体の連番PNG。後段のEPUB入力

exports/<issue>/isekai_marumie_jitsuwa_<issue>_fixed_layout.epub
  固定レイアウトEPUB
```

`preview/001.png` と `pages/001.png` は異なるコマンドの出力です。記事内番号と号全体の番号も別です。同じ版の成果物であるか、更新日やソースを照合します。

## 確認用PNGだけを出す処理

実装は `tools/preview_fixed_layout_article_here.mjs` です。実行時のカレントディレクトリを記事フォルダとして扱います。

```bash
cd "202604/01_王都女学院春の制服名鑑"
node ../../tools/preview_fixed_layout_article_here.mjs --fail-on-broken-image
```

対象記事の既存 `fixed_layout.html` を一時HTTPサーバー経由で開き、`.fixed-page` ごとに `preview/001.png` から保存します。viewportは1456×2056、deviceScaleFactorは1です。

開始時に記事の `preview/` を削除して作り直します。記事原稿用の保存場所ではありません。`.fixed-page` がなければ失敗します。このスクリプトに記事ビルド側と同じfallback生成があるわけではありません。

`--fail-on-broken-image` は検出した壊れたimgで処理を止めるオプションです。ただし背景画像や、img自体を代替表示へ置換した場合などを含む完全な検査ではありません。フォント・画像待機には上限があり、全資産の準備完了を厳密に保証するコードとはしていません。

## 記事manifestを伴うビルド

実装は `tools/build_article.mjs`。リポジトリ直下から対象記事を明示します。

```bash
npm run build:article -- "202604/01_王都女学院春の制服名鑑"
```

現在の処理は次の順です。

```text
対象記事のintermediate/とpages/を削除・再作成
→ fixed_layout.html、存在するCSS・本文Markdownを中間フォルダへコピー
→ 元のfixed_layout.htmlを一時HTTPサーバーで開く
→ .fixed-pageの検出、資産待機、DOMの矩形取得
→ pages/001.png、002.png … を撮影
→ intermediate/article_manifest.json等を保存
```

Markdownの中間コピーは本文変換ではありません。元HTMLとMarkdownの同期チェックも行いません。`layout_report.json` に矩形が書かれても、それだけで配置の合格判定をしたことにはなりません。

`.fixed-page` がない場合は原因確認用のfallback紙面を作り、記事manifestに `fallback: true` を記録します。これは正常な記事ページではありません。後段で自動的に除外される実装にはなっていないため、統合前に人または検査処理が拒否する必要があります。

既存の `intermediate/` と `pages/` は削除され、失敗時には途中出力が残る可能性があります。必要な旧成果物は別の場所に保全してから実行します。manifestのwidth/heightは期待値の定数であり、PNGヘッダーを読んだ実寸検査ではありません。

## 記事manifest

保存先は記事の `intermediate/article_manifest.json` です。次は構造の例であり、実際にこの枚数を生成したという記録ではありません。

```json
{
  "article": "01_王都女学院春の制服名鑑",
  "articleDir": "202604/01_王都女学院春の制服名鑑",
  "sourceHtml": "202604/01_王都女学院春の制服名鑑/fixed_layout.html",
  "width": 1456,
  "height": 2056,
  "fallback": false,
  "pages": [
    {
      "articlePage": 1,
      "file": "pages/001.png",
      "width": 1456,
      "height": 2056
    }
  ]
}
```

現在のmanifestは、依存画像・CSS・本文のハッシュが揃ったことや、最新の保存内容を使ったことまで証明するものではありません。

## 号内一括ビルドとmissing-only

`tools/build_issue_articles.mjs` は、明示した号の直下にある `NN_` 形式のフォルダを順に処理します。固定HTMLがないフォルダはスキップします。処理結果は `exports/<issue>/article_build_results.json` です。

`--missing-only` は `intermediate/article_manifest.json` の存在だけを見てスキップします。原稿、HTML、CSS、画像の変更を比較する差分ビルドではありません。変更した記事は、既存manifestの有無にかかわらず記事単位で明示的に作り直します。

一括ビルドが成功しても、固定HTMLのない記事を含めて全号が完成したとは言えません。次の統合処理とは対象選択が一致していないためです。

## 号統合の制限：先に確認すること

`tools/collect_issue_pages.mjs` は全 `NN_` フォルダのmanifestを要求します。一括ビルドのように固定HTMLがないフォルダをスキップしません。起動用だけのフォルダ、未生成記事、番号重複がある現在の202604へ、確認なしに全号コマンドを流さないでください。

さらに現在の統合処理は、すべての入力manifestを検証する前に `exports/<issue>/kindle_pages/` を削除します。入力不備で止まっても、従来の画像出力が残るとは限りません。

統合に進む前に、収録すべき記事と並び順、全manifest、全入力PNG、fallback不在、実PNG寸法、ソース版の対応を確認します。コードには承認済み収録リストによる対象制御や、全入力検証後の安全な出力置換はまだありません。

確認済みの対象だけで運用を成立させた後に使用するコマンドは、リポジトリ直下から次です。現段階の通常プレビュー手順ではありません。

```bash
node tools/collect_issue_pages.mjs 202604
```

統合はフォルダ名順とmanifest内の順に画像をコピーして、号全体の `0001.png` 形式の番号と `issue_manifest.json` を作ります。誌面内部に描かれたページ番号を書き直す処理ではありません。

## EPUB生成と検査

`tools/build_fixed_layout_epub.py` は `exports/<issue>/kindle_pages/` のPNGだけを読みます。号なし `exports/kindle_pages/` へフォールバックするという旧説明は現コードと一致しません。

統合入力が準備できている場合の明示的な202604指定です。Pythonスクリプトはカレントディレクトリを基準にするため、リポジトリ直下から実行します。

```bash
python tools/build_fixed_layout_epub.py 202604
python tools/check_fixed_layout_outputs.py 202604
```

EPUB生成側はPNGの実寸や全記事の存在を検証しません。出力検査側はPNGヘッダーの寸法、連番、manifestのページ配列件数、EPUB内の一部の構造・件数を確認します。完全なEPUB規格検証、全リンクの正しさ、内容や画像の欠落、記事収録の妥当性まで検証するものではありません。

検査側には、号別kindle_pagesとEPUBが存在しない場合にlegacyへ切り替わる処理が残っています。生成側と同じ入力選択をするわけではありません。検査ログの `mode`、`issue`、実際の入力先を確認し、別系統の出力を検査して合格した結果を流用しません。

## 従来の全体出力経路との関係

`tools/export_fixed_layout_images.mjs` は現在 `exports/<issue>/fixed_layout_images/` へ記事名付きPNGを出します。号なしパスという旧説明を現在の既定として使いません。この方式と記事内 `pages/` 方式は別経路です。

`package.json` の `export:fixed-layout` と `prepare:kindle-pages` は202603を引数に固定しています。`build:fixed-layout-epub` はそれらを呼ぶため、202604のプレビュー目的に実行しません。末尾に202604を追加しても、先に書かれた202603引数が置き換わるわけではありません。

`tools/build_fixed_layout_all.mjs` や旧同期・パッチ処理も、この文書を読んだだけで安全な202604経路にはなりません。202603を触らないという今回の作業方針は、すべての既存スクリプトに自動ガードが実装されていることを意味しません。

## 改善候補と合格判定

明示的な収録記事リスト、依存資産込みのソース版記録、全入力を検証してからの出力置換、fallbackの統合拒否、厳密な資産待機、PNG実寸確認を改善候補として残します。今回これらのコード修正はしていません。

HTMLの読込と実際の紙面表示を先に検証し、必要な時点だけPNGを作ります。devでの確認は [方式比較](12_preview_methods.md)、最終PNGとの対応を含む試験は [検証手順](14_preview_acceptance.md) を参照してください。
