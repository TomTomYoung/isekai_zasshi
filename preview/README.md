# fixed_layout ブラウザプレビュー

202604 以降の `fixed_layout.html` を、Playwright のPNG基準である 1456×2056 CSS px を保ったままブラウザ確認するためのプレビューです。

## Pages

Pages の入口は `preview/index.html` です。

プレビュー画面は `fixed_layout.html` を同一オリジンの iframe に 1456px 幅で読み込み、iframe 全体だけを縮小表示します。ページ内部のCSS座標は変更しません。

青枠は `.fixed-page` の境界です。1456×2056 から1pxを超えて外れたページは赤枠になります。

## fixed_layout.html を直接開いた場合

202604 の対応済み `fixed_layout.html` は `../../preview/fixed_layout_screen_preview.js` を読み込みます。

通常ブラウザではページ境界を青枠表示します。Playwright 実行時は `navigator.webdriver` を検出してプレビュー装飾を追加しないため、PNGには青枠やバッジが入りません。

## vscode.dev / ブラウザ版VS Code

HTMLをレンダリングできる Live Preview 系のWeb拡張から `preview/index.html` を開けば、作業ツリー上の `fixed_layout.html` を確認できます。

拡張側でHTML実行ができない環境では、vscode.dev単体は静的HTMLを実行しないため、コミット後のGitHub Pagesプレビューを使用します。

## 対象号

Pagesビルドは 202604 のみを対象とします。202603 は公開成果物に含めず、ビルドスクリプトでも明示的に拒否します。
