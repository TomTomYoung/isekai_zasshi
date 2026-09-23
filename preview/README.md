# 固定紙面プレビュー：入口と検証状況

更新日：2026-09-23。対象は202604。次の作業は [リポジトリ直下HANDOFF](../HANDOFF.md) です。

## このフォルダはPages / HTTP用

このフォルダの [index.html](index.html) は、同じHTTPサイト内の `fixed_layout.html` をiframeで表示するビューアーです。記事選択、倍率、青枠、ページ寸法の確認を行うコードがあります。生成済みPNGを並べる画面ではありません。

CodeSwing用の入口は [リポジトリ直下のindex.html](../index.html) です。このフォルダのindex.htmlとは読込経路が異なります。devでこのフォルダをSwingのルートにすることが、今回のCodeSwing実装の手順ではありません。

記事フォルダ内の `preview/001.png` などは、さらに別のPNG出力先です。同じpreviewという名前でも区別してください。

## 公開状況

サイト生成処理とPages用workflowは存在します。しかし2026-09-23に確認したGitHub APIでは `has_pages=false` でした。公開URLの開通や実際のPages表示は未確認です。

`tools/build_fixed_layout_preview_site.mjs` は、対象記事と資産を `_site/` に配置します。PlaywrightによるPNG生成や、Markdownからの紙面生成はしません。現行workflowは202604を指定し、このビルドスクリプトは202603を拒否します。

Pagesを有効にする場合も、リポジトリ全体をそのまま配信するのではなく、202604を選ぶ配置経路と公開資産の範囲を確認します。現コードは記事フォルダのファイルを広くコピーするため、原稿・企画・不要な画像等まで出る範囲の見直しが必要です。

Pagesに表示されるのはGitHubへ届いて公開された版で、devの未commit編集は反映されません。根拠：[GitHub Pagesのカスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 現行コードの寸法とガイド

`app.js` はiframeの幅を1456 CSS pxに保ち、外側を拡大縮小します。ただし高さは文書全体のscrollHeightに合わせて伸ばす実装です。常に1456×2056のviewportで開いている、という説明は不正確です。高さ依存のCSSがある紙面では、撮影時と組版条件が異なります。

ページ境界はoutlineで表示しますが、同時にページ間のmarginも追加します。記事内に読み込まれる `fixed_layout_screen_preview.js` はbody余白と別のoutline・バッジを追加するため、青枠切替との二重制御も調査対象です。

直接表示用ガイドは `navigator.webdriver` がtrueの場合に処理をスキップします。そのため、通常ブラウザと自動化されたブラウザの表示経路が一致するかは別途試験が必要です。PNGへガイドが入らないという設計意図と、出力の実検証を区別してください。

以上のコードは今回の文書更新では修正していません。青枠は紙面を自動修正する機能ではなく、寸法確認だけで改行・はみ出し・資産の完全性まで保証しません。

## 記事一覧

`articles.json` の現行登録は表紙と制服名鑑の2件です。サイト生成時には、指定号の既存固定HTMLを持つ記事から配置用一覧を作る処理があります。本文Markdownだけの未組版記事を自動で固定HTMLにする機能ではありません。

ビューアーのパス判定は202604向けです。ビルドの引数が6桁の号数を受け付けることだけで、以後すべての号に対応済みとは扱いません。

## devでの確認と今後の選択

dev用入口も現在は利用者環境で不調です。まず [CodeSwing文書](../docs/06_codeswing_dev_preview.md) と [検証手順](../docs/14_preview_acceptance.md) に従い、入口・本文読取・画像/CSS/JS・保存再読込を順に切り分けます。

Pages、通常HTTP、CodeSwing、実PNG確認は用途が異なります。未実装の代替案を含めて [方式比較](../docs/12_preview_methods.md) にまとめています。
