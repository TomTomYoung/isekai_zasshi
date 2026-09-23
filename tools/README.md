# tools：現行処理と安全上の注意

更新日：2026-09-23。照合基準：`7c1f911b0e321de73648df3e38ce1a9bb3abb628`。

このフォルダには、記事の画像化、号統合、EPUB生成、過去の同期・正規化など異なる役割の処理が併存しています。すべてを順番に実行する場所ではありません。

今回の対象外である `202603/` は、旧スクリプトの既定値や固定パスに使われています。既存スクリプトが全般的に202603を保護する実装ではないため、実行する対象・書込先を先に確認します。今回の文書監査では生成スクリプトを実行していません。

## 記事を見る・撮影する

`preview_fixed_layout_article_here.mjs` は、カレントディレクトリの記事を一時HTTPサーバーで開き、`.fixed-page` を記事内 `preview/001.png` 等へ撮影します。開始時にその `preview/` を削除します。`.fixed-page` 不在はエラーです。壊れたimgに対しては `--fail-on-broken-image` を指定できますが、完全な資産検査器ではありません。

`build_article.mjs` は、指定記事の既存固定HTMLを撮影して `pages/` と `intermediate/` を作ります。両フォルダを削除・再作成します。既存Markdownの中間コピーは行いますが、MarkdownからHTMLを生成する処理ではありません。fallback紙面が出る場合は正常記事として扱いません。

両者ともNodeとPlaywright Chromiumが必要です。通常のdev単体では実行する環境がありません。dev用のHTMLプレビューは [直下index.html](../index.html) の別系統で、日本語パスを修正済みで、dev実機確認が残っています。

## 号をまとめる

`build_issue_articles.mjs` は指定号の `NN_` フォルダを走査し、固定HTMLのある記事を記事単位ビルドへ渡します。`--missing-only` はmanifestの存在判定であって、ソース変更を調べる差分ビルドではありません。

`collect_issue_pages.mjs` は全 `NN_` フォルダのmanifestを要求し、号別 `kindle_pages/` へ連番でコピーします。一括ビルドと同じスキップ規則ではありません。また入力を全部確認する前に出力フォルダを削除します。全号統合の前に、対象記事、全manifest、PNG、fallback、並び順を確認する必要があります。

`build_fixed_layout_epub.py` は `exports/<issue>/kindle_pages/` だけを入力として号別EPUBを作ります。号なし入力へフォールバックするという旧説明は現在のコードと異なります。

`check_fixed_layout_outputs.py` はPNG実寸・連番・一部のmanifest/EPUB件数を検査します。ただし号別入力がなければlegacyモードへ切り替わります。生成側と検査側の入力選択を混同しません。完全なEPUB規格検証や記事内容の検証ではありません。

詳しいコマンドと前提は [記事単位ビルド仕様](../docs/10_article_level_build_spec.md) に集約しています。

## 従来の全体書き出し

`export_fixed_layout_images.mjs` は、指定号の既存固定HTMLから `exports/<issue>/fixed_layout_images/` へ記事名付きPNGを出力します。旧READMEにあった号なしパスを現在の出力先としません。出力先を削除・再生成し、fallbackや時間制限を伴います。

`package.json` の `export:fixed-layout` と `prepare:kindle-pages` は202603を引数に固定しています。`build:fixed-layout-epub` はこの経路を呼びます。202604のプレビュー作業としてそのまま実行しません。

`build_fixed_layout_all.mjs`、旧同期・headパッチ・計測用スクリプトも、対象号の指定が一貫していると仮定しません。特に `seed_202604_articles.mjs` を再実行して現行原稿を旧企画へ戻さないでください。

## Pages用の静的配置

`build_fixed_layout_preview_site.mjs` は、既存固定HTMLのある対象記事と資産、`preview/` を `_site/` へコピーします。現在のworkflowは202604を指定しています。このスクリプトは202603を拒否しますが、その保護はほかの出力スクリプトへ自動的に及びません。

この処理はPNGを生成しません。Markdownから固定HTMLも生成しません。公開範囲・資産参照・除外対象を確認してから使用します。2026-09-23時点ではリポジトリAPIの `has_pages=false` で、公開は確認できていません。

## 旧正規化・変換処理

`create_reflow_files.py`、`normalize_reflow_html.py`、`normalize_epub_html.py` 等は、過去のreflow/EPUB工程のための処理です。これらを固定紙面プレビューの修理として実行しません。

旧 `convert.py` も、現在の固定HTML表示を自動的に直す処理ではありません。過去工程の文書は [docs案内](../docs/README.md) から参照します。既存の202603向けworkflowも今回変更していません。

## 新しい作業で記録すること

対象commit、入力ファイル、出力先の削除・置換範囲、実行環境、資産待機、fallbackの有無、実ファイルの検査結果を残します。スクリプトの終了コードだけで「最新原稿・全資産・全紙面・校了」をまとめて保証しません。

次回の優先事項は [HANDOFF](../HANDOFF.md)、プレビュー方式は [方式比較](../docs/12_preview_methods.md)、試験の合格条件は [検証手順](../docs/14_preview_acceptance.md) です。
