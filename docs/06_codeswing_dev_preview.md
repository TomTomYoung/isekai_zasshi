# dev / CodeSwing 固定紙面プレビュー：実装と現在の不調

更新日：2026-09-23。対象：`TomTomYoung/isekai_zasshi` の202604。
実装基準：`7c1f911b0e321de73648df3e38ce1a9bb3abb628`。

## 現在の状態

入口は実装されていますが、利用者から「どうもうまくいかんな」と報告されています。表示のどの段階で止まるかは未特定です。この文書を、devでの動作確認済み手順と読まないでください。

前回はChromiumの試験記事とCodeSwingを模した読込環境で成功したという作業報告がありました。利用者のdev、実際の記事の全資産、最終PNGとの比較は未検証です。入口を追加した3コミットには、その模擬試験を再実行するテストコードは含まれていません。今回の文書監査で追試したという意味でもありません。

再開は [HANDOFF](../HANDOFF.md)、具体的な調査は [切り分け・合格条件](14_preview_acceptance.md) に従います。

## devとCodeSwingの役割

この会話のdevは、GitHubリポジトリをブラウザから編集する `vscode.dev` / `github.dev` です。デスクトップ版、Codespaces、Remote Tunnelsで接続した計算環境とは区別します。

CodeSwingは、指定したフォルダのHTML・CSS・JavaScriptをWebviewへ表示するWeb対応拡張です。`New Swing...` は試作用の新規プロジェクト、`Open Swing...` は既存フォルダを対象にする操作です。前に作成したBasic HTML-Onlyの試作品だけでは、このリポジトリの記事とはつながりません。

根拠：[CodeSwing公開仕様](https://github.com/lostintangent/codeswing)、[VS Code for the Web](https://code.visualstudio.com/docs/remote/vscode-web)。公開ソースと利用者のインストール版が同一かは別途確認します。

## 今回の入口と、意図した使い方

```text
isekai_zasshi/
  index.html        CodeSwingで動く記事ビューアー
  codeswing.json    テーマCSS・README混入等を抑える設定
  preview/
    articles.json   記事選択の一覧
    index.html      別のPages / HTTP用ビューアー
  202604/
    記事フォルダ/
      fixed_layout.html
      画像・CSS等
```

既存の入口を使う場合は、最新の追加ファイルを含むリポジトリで、`CodeSwing: Open Swing...` の対象を最上位フォルダにする構成です。`preview/` や記事フォルダをSwingのルートにする構成ではありません。新しいSwingの作成やWorkspaceの初期化は不要です。

これは実装の設計を示したもので、現在の不調をこの操作だけで解消できると断定する説明ではありません。未保存・未commit変更を消す操作は行いません。

意図した編集ループは次のとおりです。

```text
ビューアーで記事を選ぶ
→ 元のfixed_layout.htmlを編集して保存する
→ ビューアーの「保存後に再読込」を押す
→ 保存済みファイルを読み直す
```

記事本文をindex.htmlへ貼り付けたり、別の原稿ファイルを保守したりしない構成です。確認のためのPNG生成・commit/pushは行わない設計ですが、利用環境でこのループが成立した証拠はまだありません。

## 内部の読込経路

直下のindex.htmlは、選択した固定HTMLをCodeSwingの相対fetch経路で読みます。読み取ったHTMLをDOMParserで解析し、メモリ上だけで調整してiframeの `srcdoc` へ渡します。

表示コピーから既存の `fixed_layout_screen_preview.js` を外して、body余白と二重ガイドを避けます。元記事の画像・CSS・外部JSを探す基準として `base` を加えます。記事内の一部の相対fetchは親の読取関数へ中継します。原本のディスク上の内容は変更しません。

```text
HTML本文の読取
  相対fetch → CodeSwing → workspace.fs → テキスト

画像・外部CSS・外部JSの読取
  記事のbase URL → Webview資産URL → 代理ファイル読取
```

この二つが両方通る必要があります。HTMLの文字が読めただけでは、画像を含む紙面表示が成立したとは言えません。

現在のコードは独自のbaseを持つ記事を拒否します。中継するfetchはGETと一部の相対文字列が対象で、任意のRequest/URL入力やWebアプリ全体を再現する汎用サーバーではありません。srcdocは元記事URLで開く方式とも異なるため、location/originに依存する処理には差が残ります。信頼するリポジトリ内の記事専用です。

## 固定紙面の表示

iframeの内部寸法を1456×2056 CSS pxにし、外側だけを拡大縮小します。ページ選択時は対象 `.fixed-page` へスクロールします。青枠はiframeの外側の確認用表示です。

ページ寸法や先頭位置が合わない場合は警告します。画像の未読込・代替表示、CSS未読込、フォント待ちタイムアウト、JavaScriptエラーも状態欄へ表示する処理があります。ただし完全な資産検査器・はみ出し検出器ではありません。

記事一覧は現在、表紙と制服名鑑の2件です。パス指定は202604の固定HTMLへ制限しています。固定HTMLのない記事を新しく組版する機能や、Markdownから本文を取り込む変換処理はありません。

## 優先して確認する不具合候補

CodeSwingの代理URIは、元のVS Code URI全体をエンコードして組み立てています。一方、直下indexは `new URL('.', document.baseURI)` でディレクトリを求めています。エンコードされた元URIがURLの1セグメントに入る形式では、この操作によりワークスペース情報を失う可能性があります。

これは公開ソースと入口から分かった調査候補です。実機のbaseURI・要求URL・導入版が未取得なので、利用者の不調の原因とは確定していません。通常の階層URLを使った模擬試験とは分けます。

根拠：[CodeSwing Webview実装](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/webview.ts)、[ProxyFileSystemProvider](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/proxyFileSystemProvider.ts)。限定的なURL検証は [検証手順](14_preview_acceptance.md) に記録しています。

ほかに拡張側の起動、外部CDN、CSP、ファイル読取エラー時の返答、資産キャッシュを確認します。現在のタイムアウト文は原因を特定するものではなく、利用者がフォルダを間違えた証拠でもありません。

## 次に残すべき結果

正しい入口が起動すること、HTMLを読むこと、画像/CSS/JSを読むこと、保存後に更新すること、固定寸法が維持されることを別々に試験します。環境・対象commit・失敗した最初の段階・再現コードを残します。

通常HTTPでの実記事試験、利用者のdev試験、最終PNG比較の合否は別項目です。CodeSwingで制約が確認された場合の代替案は [方式比較](12_preview_methods.md) を使います。実装を増やしただけで問題を解決済みとはしません。

202603、記事原本、既存のPNG出力処理はこの文書更新では変更していません。
