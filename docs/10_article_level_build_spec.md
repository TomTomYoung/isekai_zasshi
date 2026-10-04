# 記事単位ビルド：現行実装と運用上の制限

更新日：2026-10-04。
記事単位の検査・出力節は今回の `tools/build_article.mjs` に対応します。号全体・EPUBの後段は今回変更していません。

この文書は現在のコードが行う処理を示します。今回ビルドを実行した記録や、202604全号がビルド可能という宣言ではありません。202603は今回の変更・再生成対象外です。

## 実行環境と正本

Node.jsとPlaywright Chromiumを実行できるPC・サーバー等が必要です。Pythonを使用する後段ではPythonも必要です。通常の `vscode.dev` / `github.dev` 単体にこれらの実行環境がある前提にしません。

本文はMarkdownが正本ですが、これらのPNGビルドは既存の固定HTMLを撮影する処理です。MarkdownからHTMLの生成・同期は、04花見記事に追加した `sync_article_layout.mjs` の別工程です。[16 組版仕様](16_markdown_article_composition.md) を参照してください。[正本規則](09_markdown_source_rule.md) を参照してください。

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

開始時に記事の `preview/` を削除して作り直します。記事原稿用の保存場所ではありません。`.fixed-page` がなければ失敗します。この確認用スクリプトには、以下の `build_article.mjs` の安全検査・一時出力・既存出力の復元処理は追加していません。

`--fail-on-broken-image` は検出した壊れたimgで処理を止めるオプションです。ただし背景画像や、img自体を代替表示へ置換した場合などを含む完全な検査ではありません。フォント・画像待機には上限があり、全資産の準備完了を厳密に保証するコードとはしていません。

## 記事manifestを伴うビルド

実装は `tools/build_article.mjs`。リポジトリ直下から対象記事を明示します。

```bash
npm run build:article -- "202604/00_表紙" --check-only --safety-px=28
```

`--check-only` は元HTMLを実際のChromiumで開き、画像・フォント等の準備と共通の紙面検査を行います。記事フォルダへの書込、PNG撮影、出力ディレクトリの作成は行いません。成功・失敗ともJSONを標準出力へ返し、失敗時は終了コードが0以外になります。ログは標準エラー出力へ分けます。

検査結果をファイルで受け取る場合は `--report <path>` を指定します。これは `--check-only` 専用です。この場合はJSONを指定先へ書き、標準出力には出しません。記事ディレクトリ内の指定は実パスも含めて拒否します。相対レポートパスは実行時のカレントディレクトリを基準に解釈します。通常のビルドでは `intermediate/` 内のレポートを使用します。

```bash
node tools/build_article.mjs "202604/00_表紙" --check-only --report /tmp/isekai-cover-check.json
```

既存Chromiumを指定する場合は環境変数 `PREVIEW_CHROMIUM` を使用できます。指定がない場合はPlaywright既定のChromiumです。

```bash
PREVIEW_CHROMIUM=/absolute/path/to/chromium node tools/build_article.mjs "202604/00_表紙" --check-only
```

検査結果と対象HTMLの内容を確認した後、PNGも生成する場合は `--check-only` を外します。

```bash
npm run build:article -- "202604/00_表紙" --safety-px=28
```

現在の処理は次の順です。

```text
元のfixed_layout.htmlを一時HTTPサーバーで開く
→ 画像decode・使用フォント・通信・DOMの静止を待機
→ ガイド非混入、.fixed-pageの寸法・安全域・内部クリップ等を実測検査
→ 検査成功後に記事内の一時ディレクトリを作成
→ fixed_layout.html、存在するCSS・本文Markdownを一時出力へコピー
→ 各ページの撮影直前にも再検査して、一時出力へPNGを保存
→ PNGヘッダーの実寸1456×2056と、撮影中の幾何変化がないことを確認
→ 一時出力へarticle_manifest.json・layout_report.jsonを保存
→ 既存pages/・intermediate/を退避し、新しい2フォルダへ置換
→ 置換成功後に旧出力の退避分を削除
```

Markdownの中間コピーは本文変換ではありません。`layout-source.json` のある新経路では元HTMLとMarkdown・資産・テンプレートの同期も検査します。設定のない旧HTMLは `legacy-untracked` と記録します。`layout_report.json` には既存の矩形記録と、新しい `layoutSafety` の検査結果を保存します。

`.fixed-page` がない場合、画像や使用Webフォントが欠落した場合、資産待機がタイムアウトした場合、共通紙面検査にerrorがある場合は失敗します。原因確認用のfallback紙面を作って成功出力する処理は廃止しました。画像の候補ファイルを順に試して、最終的な画像が正常に読めた場合は、使わなかった候補の404だけで失敗させません。最終画像の欠落、`.missing` の代替表示、参照中の背景画像等の通信失敗は拒否します。

既存の `intermediate/` と `pages/` は、検査・撮影の失敗時には変更しません。2フォルダの置換の途中で通常のI/Oエラーが起きた場合も復元します。復元自体が失敗した場合は退避ディレクトリを残して場所を報告します。2つのディレクトリを同時に原子的に置換する仕組みではないため、置換中の強制終了や電源断からの自動復旧は未実装です。

`--safety-px` の既定値28は仮の運用基準です。適合するDOM要素の箱と文字行が紙面の内側に収まることを、現在のブラウザ・フォント環境で実測します。影、疑似要素、画像の内部に描かれた文字などには別の限界があり、warning・limitationsを伴う結果でも `ok: true` になり得ます。異なる環境や今後の原稿にも絶対にはみ出しがないという証明にはしません。[安全検査の契約](15_layout_safety_contract.md)を参照してください。

## 記事manifest

保存先は記事の `intermediate/article_manifest.json` です。次は構造の例であり、実際にこの枚数を生成したという記録ではありません。

```json
{
  "article": "01_王都女学院春の制服名鑑",
  "articleDir": "202604/01_王都女学院春の制服名鑑",
  "sourceHtml": "202604/01_王都女学院春の制服名鑑/fixed_layout.html",
  "mode": "build",
  "ok": true,
  "width": 1456,
  "height": 2056,
  "safetyPx": 28,
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

実際のJSONには `readiness`、`layoutSafety`、`environment`、`errors` も含みます。`pages[].width/height` はPNGヘッダーから読んだ実寸です。`--check-only` のJSONは `mode: "check-only"` となり、撮影しないため `pages` は空配列です。測定ページ数とページごとの問題は `layoutSafety` を参照します。

新経路のmanifestには `sourceSync`（入力群とHTMLのハッシュ）、`composition`（内容・画像面積・重なりの検査）、`pages[].sha256` が加わります。既存の旧HTMLに対するmanifestではMarkdown同期を保証せず、`sourceSync.status` は `legacy-untracked` です。旧号収集処理はまだこれらのハッシュを検証しません。

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

記事単位の `build_article.mjs` には、資産待機の失敗拒否、共通の紙面実測検査、PNG実寸確認、検査後の出力置換を追加しました。旧確認用PNG・号全体の出力・号統合・EPUBには同じ変更を広げていません。明示的な収録記事リスト、依存資産込みのソース版記録、号全体の全入力検証後の出力置換、過去のfallback manifestの統合拒否は引き続き改善候補です。

HTMLの読込と実際の紙面表示を先に検証し、必要な時点だけPNGを作ります。devでの確認は [方式比較](12_preview_methods.md)、最終PNGとの対応を含む試験は [検証手順](14_preview_acceptance.md) を参照してください。
