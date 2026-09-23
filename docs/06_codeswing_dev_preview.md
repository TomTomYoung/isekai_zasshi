# dev / CodeSwing 固定紙面プレビュー

## 開く場所

対象リポジトリは `TomTomYoung/isekai_zasshi`。`neta_chou` ではありません。

`vscode.dev` または `github.dev` でこのリポジトリの最新変更を取り込み、F1 → `CodeSwing: Open Swing...` でリポジトリ最上位（`README.md`、`202604`、`index.html` があるフォルダ）を選択します。

`New Swing...` や `Initialize Workspace as Swing` を実行して上書きする必要はありません。以前の動作確認で作成した一時Swingとは別です。`preview/` フォルダをSwingのルートに選ぶ構成でもありません。

CodeSwing公式のOpen Swingおよびマニフェスト仕様: https://github.com/lostintangent/codeswing#readme

## 編集と確認

記事を選択し、元の `202604/NN_記事名/fixed_layout.html` を編集・保存（Ctrl+S）したあと、プレビュー内の「保存後に再読込」を押します。

これによるレイアウト確認にはPNG生成、GitHubへのcommit/push、Pages公開は不要です。キー入力のたびの自動更新ではなく、保存後の明示的な再読込です。初回にこの入口の追加変更をdevへ取り込む作業は必要です。

本文MarkdownからHTMLを生成する処理はこの入口にはありません。既存HTMLを閲覧する仕組みであり、本文の正本をMarkdownとする運用は変更しません。

## 構成

`index.html` はHTML読込、固定寸法iframe、ページ選択、倍率、青枠表示を持つ読取専用の入口です。

`codeswing.json` はCodeSwingの設定です。テーマCSSとREADMEのプレビュー内挿入を無効にします。

記事一覧には既存の `preview/articles.json` を利用します。一覧にない202604の記事はパス欄から指定できます。対象には既存の `.fixed-page` を持つ `fixed_layout.html` が必要です。未作成の記事の紙面を自動生成する機能ではありません。

記事HTMLをfetchで読み、メモリ上のsrcdocに入れます。本文HTMLの複製ファイルを保存したり、原本へ書き戻したりはしません。画像・CSS・外部スクリプトの相対パスは、CodeSwingのリソース用base URLと元記事の位置を基準に解決します。記事内の文字列による相対fetch（GET）はCodeSwingのworkspace読取へ中継します。

iframeの内部viewportは幅1456×高さ2056 CSS pxに固定し、外側だけを拡大縮小します。ページを選ぶとその `.fixed-page` の先頭へスクロールします。青枠はiframeの外側に表示します。サイズ不一致は赤枠、画像の未読込・代替表示、CSS未読込、JavaScriptエラー、フォント待ちタイムアウトは状態欄で警告します。完全なはみ出し検出器ではありません。

以前追加された `fixed_layout_screen_preview.js` だけはメモリ上の表示コピーから外し、body余白や二重ガイドが加わるのを防ぎます。ディスク上のHTMLおよびPNG出力処理は変更しません。

独自のbase要素を持つHTMLは対象外です。srcdocなのでlocation.hrefやorigin依存の処理、任意のWebアプリ、全種類のfetch/XHRまで同じ環境になることは保証しません。信頼するリポジトリ内の記事専用です。

## 202603の保護

今回の追加はリポジトリ直下の `index.html`、`codeswing.json` とこの文書のみです。202603、202604の記事原本、既存の共有スクリプト、Pagesビルド、PNG出力スクリプトは変更していません。入口で選択できるのは202604の記事のみです。既存の202603向け正規化ワークフローのpush対象パスにも該当しません。

## 検証範囲（2026-09-23）

こちらのChromiumで、テスト用の2ページ記事とメモリ配信するCSS・JavaScript・画像・JSONを使用し、以下を確認しました。

固定viewport 1456×2056、外部CSS/JavaScript/画像の読込、記事内の相対fetch、狭い画面と倍率変更での内部寸法維持、ページ切替、青枠の切替、保存したHTMLの再読込、202603指定および親ディレクトリ指定の拒否。

さらに、CodeSwingの相対fetch中継と異なるリソース用base URLを模したテストでもCSS・JavaScript・画像・相対fetchを確認しました。これはCodeSwing実機ではなく模擬環境です。

利用者のdev上での実際のCodeSwing実行、記事内の全画像、全記事の紙面、最終PNGとのピクセル比較は未検証です。記事で使っているシステムフォントは変更していないため、OSやフォント環境が異なれば文字の描画・改行に差が残る可能性があります。最終PNGと完全一致するという宣言ではありません。
