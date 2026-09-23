# 異世界雑誌：再開用ハンドオフ

更新日：2026-09-23。対象：TomTomYoung/isekai_zasshi、master。
開始時のmaster：`b6e8c40aff115628b6203706b8e5be691adc3bb5`。

## 現在地

dev用入口の日本語ファイル読取を修正しました。CodeSwingが使うfetch-mock 9.11.0とVS Code URIの組合せで旧入口が止まることを再現し、修正版は同じ模擬経路を含む12件の試験に成功しました。実行結果と環境は [tests/preview/README.md](tests/preview/README.md) を参照してください。

利用者のvscode.dev / github.devでの成功は未確認です。クラウドブラウザからgithub.devを開き、vscode.devのリポジトリ画面とGitHub Repositoriesの認証許可ダイアログまで確認しました。「許可」の操作は自動承認レビューで拒否されました。拡張へ与えるGitHubアクセスの対象・範囲が明示承認されていない、という理由です。認証を迂回していません。GitHubコネクターによるリポジトリ読取・反映とは別の権限です。

今回の結論は「再現できたコード不整合を修正、模擬とHTTPで検証、dev実機は認証段階で未確認」です。利用者が前回どの段階で止まったか、導入版、Swingルートは依然不明です。

## 保護範囲

`202603/` は変更・再生成していません。旧出力スクリプト・号全体ビルド・EPUBビルドは実行していません。202604の原稿HTML、Markdown、画像も変更していません。試験は既存の表紙と制服名鑑、およびメモリ上の独立fixtureです。生成PNGは検査用の一時成果物で、既存記事のpreview PNGへ上書きしません。

`202603` のツリーSHAは `6dde79372cc505e2b732f31193b38b8bdda47bcb`。差分と反映後のtreeで不変を確認します。別会話のローカル作業にあった未commit変更は触らず、別の作業場所を使いました。

## 原因の切り分け

旧入口は `fetch('202604/00_表紙/fixed_layout.html')` をCodeSwingの中継へ渡していました。fetch-mock 9.11.0はこれを `/202604/00_%E8%A1%A8%E7%B4%99/fixed_layout.html` に正規化します。CodeSwingのhttpRequest処理は `Uri.joinPath(swing, value.url)` にそのまま渡し、workspace.fsは「表紙」ではなく「%E8%A1%A8…」という名前を探します。さらに公開実装にはこのreadFile失敗をhttpResponseとして返すcatchがなく、画面側はタイムアウトを待ちます。

修正では、同一originの空iframeから取得したブラウザ本来のfetchを使い、記事本文も画像と同じWebview資産URLで読みます。CodeSwingのfetch-mockを改造せず、新規拡張・サービスも追加しません。本文は元のfixed_layout.htmlから読み、srcdocはメモリ上だけです。

前回の「dirnameでworkspaceが消える」仮説は、実際のURI変換では再現しませんでした。`Uri.parse` が一度デコードし、Webview URLのパスは `/vscode-vfs%3A//github/.../` の階層を保ちます。以前の3assertはURI.parseを省略した仮定の試験であり、今回の原因の証拠にはしません。

## 実装した修正

入口に、スクリプト起動、資産基準、HTML要求・返答サイズ、iframe、紙面検査、停止理由の診断欄を追加しました。未起動時の案内は静的HTMLにもあります。単一のタイムアウトをフォルダ選択ミスと断定しません。

読み直しごとにHTML、直接参照する画像・CSS・JS、記事内のGET fetchへ更新用の識別子を付けます。日本語・空白の静的パス、後からimg.srcへ設定する候補画像、string / URL / Requestのfetchを扱います。GET以外と外部fetchは対象外です。

画像・候補切替・fetch・使用フォントの準備待ち、資産やJavaScriptのエラー表示、遅延変更の継続監視を追加しました。読込世代ごとの状態とAbortControllerで、連続再読込・記事切替時の古い処理を切り離しました。

内部viewportは1456×2056を維持し、外側だけを縮小します。青枠はiframe外です。直接表示用ガイドは `?fixedPreviewGuide=1` の明示指定でのみ有効にし、body余白の変更とnavigator.webdriver分岐を除去しました。iframe内では直接表示用ガイドを起動しません。

## 検証と限界

[試験記録](tests/preview/README.md)、[機械可読結果](tests/preview/results.json)、[旧入口の失敗再現](tests/preview/baseline-results.json) を参照してください。手順と合格範囲は [docs/14](docs/14_preview_acceptance.md) です。

SOURCE_REVIEWED、MOCK_PASSED、HTTP_ARTICLE_PASSEDを確認しました。同一環境のPNG比較は全6ページの寸法・要素・文字行座標が一致し、微小な画素差は試験記録に数値と上限を残しました。既存の製品PNG全工程の検証とは分けます。DEV_ARTICLE_PASSEDは未達です。実機のCSP・service worker・Webview資産のCORS・GitHub仮想ワークスペースの保存/キャッシュは模擬サーバーでは証明できません。

背景画像、CSSのurl() / @import、未使用Webフォント、長いタイマーで追加される全依存資産の完全検査は未対応です。外部CSS自体は更新対象ですが、その内部の同名画像等のキャッシュ更新は保証しません。モジュールのimportやlocation依存のWebアプリを再現する汎用サーバーでもありません。今回対象の表紙・制服名鑑の範囲を、任意の記事へ拡大して保証しないでください。

## 次に行うこと

GitHub Repositoriesへの認証許可についてユーザーの明示承認を得た場合に、ブラウザ実機を続けます。新たなOAuth権限画面が出たら、その実際の権限範囲を確認してください。未保存・未commit編集の削除、初期化、新規Swing作成は不要です。

最新masterを開いたdevで、CodeSwingの既存Swingとしてリポジトリ直下を開きます。記事の保存と入口の「保存後に再読込」を行い、表紙→制服名鑑、画像、ページ切替、倍率、青枠を確認します。環境・CodeSwing版・ルート・診断欄・最初のエラーを一度に記録します。ここが成功するまで作業全体を完了扱いにしません。

## 別系統の残件

`preview/index.html` / `preview/app.js` は別のPages/HTTP入口です。今回そこには統合していません。iframe高さを文書全体へ伸ばす処理とページ余白の変更は残ります。Pagesの公開設定は変更していません。今回の反映commitには `[skip ci]` を付け、既存のPages公開workflowは起動させません。GitHub Actions上での試験成功を主張しません。前回APIのhas_pages=falseという記録を今回再検証した値とは扱いません。

Markdown改稿と固定HTML同期は別問題です。記事の編集承認は [202604/HANDOFF.md](202604/HANDOFF.md) と [STATUS](202604/STATUS.md) を参照し、古い画像数を再集計せず今日の値にしないでください。

ビルドの全記事対象選択、統合前の出力削除、missing-only、fallback、EPUB検査等は [文書監査](docs/13_documentation_audit.md) に残る別件です。今回、全文改稿・画像再採用・全号再生成・Notion操作は行っていません。

## 文書の入口

[docs/README](docs/README.md)、[CodeSwing](docs/06_codeswing_dev_preview.md)、[方式比較](docs/12_preview_methods.md)、[文書監査](docs/13_documentation_audit.md)、[合格条件](docs/14_preview_acceptance.md)。前回の文書のみの監査は開始commitの履歴に残っています。
