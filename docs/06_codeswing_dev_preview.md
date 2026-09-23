# dev / CodeSwing 固定紙面プレビュー

更新日：2026-09-23。対象：TomTomYoung/isekai_zasshi の202604。

## 状態

日本語パスを含む記事本文の読取不整合を修正しました。旧入口の失敗再現と修正版の模擬試験を [tests/preview](../tests/preview/README.md) に保存しています。利用者のvscode.dev / github.devでの動作確認は未完了です。

クラウドブラウザではvscode.devのGitHub Repositories認証許可画面まで到達しましたが、その許可操作は自動承認レビューに拒否されました。実機の導入版、Swingルート、画像の読取、未commitの保存・再読込は未確認です。GitHubへの反映と実機の合格を分けます。

## 入口と操作

CodeSwingで既存リポジトリの最上位フォルダを開く構成です。直下の `index.html` がビューアー、`codeswing.json` が設定です。新規Swing作成・Workspace初期化・記事の貼り付けは不要です。記事や `preview/` をSwingルートにする構成ではありません。

入口の目印は「記事」「保存後に再読込」「ページ」「表示倍率」「青枠」「読込診断」です。記事の `fixed_layout.html`、外部CSS、画像を元の場所で編集・保存し、「保存後に再読込」で確認します。本文コピーを別のファイルへ保存しません。

devはブラウザ版vscode.dev / github.devを指します。Nodeの実行、Tasks、bat、デスクトップ専用メニューをこの環境の手順に置き換えないでください。

## 修正した読取経路

旧入口はCodeSwingが差し替えたfetchへ日本語パスを渡していました。実際に読まれたCDNライブラリfetch-mock 9.11.0は相対パスをURLエンコードします。CodeSwingのworkspace.fs読取はその文字列をデコードせずUri.joinPathへ渡すため、表紙フォルダを `%E8%A1%A8%E7%B4%99` という名前で探して失敗します。公開ソースのreadFile失敗には返答処理もなく、呼出側のタイムアウトまで止まります。

修正版は同一originの空iframeからブラウザ本来のfetchを取得します。HTML・記事一覧のテキストも、画像と同じWebview資産URLへ要求します。CodeSwingのfetch-mockによる文字列中継を使いません。独自拡張の配布や外部サーバーは追加していません。

```text
元のfixed_layout.html / CSS / JS / 画像
→ Webview資産URL
→ CodeSwing ProxyFileSystemProvider
→ workspace.fs
→ メモリ上のsrcdoc（内部1456×2056）
```

`srcdoc` 内のfetchはブラウザ本来のfetchで記事フォルダ基準へ解決します。string、URL、RequestのGETを試験しています。POST等と外部fetchは対象外です。信頼する既存記事専用であり、任意のHTMLを隔離実行する仕組みではありません。

画像・外部CSS・外部JSの直接参照、および後からimg.srcへ代入する候補画像に、読込世代の識別子を付けます。元ファイルは変更しません。CSS内部のurl()/@importまで再帰的に書き換える実装ではありません。

## 代理URLの前回仮説の訂正

以前の「エンコードした元URIが一つのセグメントになりdirnameで消える」試験は、VS CodeのUri.parse処理を省いていました。vscode-uri 3.2.0で実際の処理順を通すと、Webview用URLは `/vscode-vfs%3A//github/.../` の階層になります。通常のdirname操作でworkspaceは失われません。

現行修正はこの誤った仮説に合わせたURLの再エンコードではありません。未知の一段エンコード形式が実機で観測された場合は、診断を残して停止します。

## 診断と固定寸法

入口の静的な初期メッセージはスクリプト未起動を判別できます。起動後は読込診断に、経路、基準URL、HTML要求、返答サイズ、iframe、紙面数、失敗した資産を記録します。URLのqueryは診断へ記載しません。利用者の認証情報やCookieを貼る必要はありません。

iframeは常に1456×2056で、外側を25%・50%・100%・幅合わせにします。ページ先頭へスクロールし、整列不能や寸法不一致を警告します。青枠は外側のoutlineなので記事の余白・改行を変えません。

画像・候補切替・fetch・使用フォントの準備を待ち、失敗、代替画像表示、CSS読込エラー、JS例外を表示します。後から増える画像等は継続監視します。AbortControllerと読込世代により古い非同期処理が新画面を変更するのを防ぎます。

背景画像、CSS内url()/@import、長いタイマーによる全依存の準備完了、モジュールimport、location依存、特殊なdata URL混在のsrcsetは未検証です。「読込検査完了」は検出対象の検査終了で、任意の記事の完全性やdev実機の合格を意味しません。

## 別の入口

`preview/index.html` はPages/HTTP用の別入口で、iframe全体の高さやページ余白の既知の差が残ります。今回、devの修正をそこへ統合していません。通常HTTPで直下indexを開くこともできますが、dev実機の検証とは分けます。

原本を直接開いたときの `fixed_layout_screen_preview.js` は、`?fixedPreviewGuide=1` の明示指定で青枠とバッジを付けます。指定なしは撮影用の素の表示です。navigator.webdriverによる分岐とbody余白の変更は廃止し、iframe内では起動しません。

## 次の実機確認

[HANDOFF](../HANDOFF.md) と [合格条件](14_preview_acceptance.md) に従い、認証許可後にCodeSwingの版、Swingルート、診断、表紙と制服名鑑の全資産、保存前後の変化を記録します。既存の未保存・未commit編集を消す操作はしません。

根拠となるCodeSwing公開ソースは [webview.ts](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/webview.ts) と [proxyFileSystemProvider.ts](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/proxyFileSystemProvider.ts) です。この版は0.0.25ですが、利用者の導入版は未記録です。
