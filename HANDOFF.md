# 異世界雑誌：再開用ハンドオフ

更新日：2026-10-04。対象：TomTomYoung/isekai_zasshi。
この変更の開始時master：`817ee167c908a3422ff6225d085146d6b62c5454`。

## 現在地

直下プレビューに、ページ内の要素箱・文字行箱のはみ出し、親要素による切れ、上下左右の最小余白を調べる共通検査を追加しました。必要余白の初期値は28 CSS pxで変更できます。資産の読込成功と、紙面の検査結果を別表示にし、後から本文が追加・削除された場合も旧合格を残しません。

`tools/build_article.mjs` も同じ検査をPNG生成前に実行します。資産準備の失敗やfallbackを成功扱いにせず、失敗時は既存出力を保持します。`--check-only --safety-px=28` は記事フォルダへ書き込まずJSONと終了コードを返します。正常生成は一時領域で全PNGとmanifestを用意してから既存の出力を置き換えます。

仕様の正本は [docs/15 紙面の安全余裕](docs/15_layout_safety_contract.md)、出力コマンドは [docs/10](docs/10_article_level_build_spec.md)、今回の再現試験と実測結果は [tests/layout-safety](tests/layout-safety/README.md) です。以下の9月23日の記録にある記事単位ビルドの削除・fallback・待機の問題は、この版では上記の変更を優先します。旧一括export、従来のpreview PNG、号全体収集・EPUBの経路は別の残件です。

## 計測できたことと限界

開始時の固定HTMLは202604の表紙と制服名鑑の2件・計6ページだけです。現在の原稿Markdownを自動同期する仕組みではありません。既存HTMLの検査合格を、改稿済み原稿の組版完了や記事承認へ置き換えません。

Chromium 133・Linux・Noto Sans CJK JPの環境では、計測対象の最小余白は表紙約60.2px、制服名鑑約64.3pxでした。制服名鑑の本文要素側の下端残りは約297〜1159pxです。疑似要素の上部帯・ページ番号、影等は別の描画なので、この数値に含みません。

共通検査の合格は現在の要素箱・文字行箱に限ります。影・疑似要素・mask・paint containment等、未計測の描画は警告と限界として返します。要素同士の重なり、原稿の欠落、Markdown同期、別環境の改行は別問題です。28pxを取れば任意の原稿が絶対安全、という保証はしていません。

利用者のvscode.dev / github.devでの実機保存・再読込は、引き続き未確認です。今回も模擬CodeSwing、通常HTTP、同一環境PNG比較を実機成功へ格上げしません。前回の認証段階の経緯は下の記録に残しています。Pagesも2026-10-04のAPI確認でhas_pages=falseです。

## 保護した範囲

202603のツリーSHAは `6dde79372cc505e2b732f31193b38b8bdda47bcb` のままです。202604の原稿・HTML・画像・既存PNGも変更していません。実記事には検査だけを行い、PNG出力・失敗保持・rollbackの試験は独立fixtureで行います。

## 次の作業

利用者のdev環境の実機確認は残っています。認証が必要な場合は実際の拡張と権限範囲を確認し、前回の自動承認レビュー拒否を無視して許可操作を繰り返しません。

最新Markdownの組版へ進むときは、正本と固定HTMLの対応・版を明示して同期し、画像の採用状態を保持します。全号へ広げる前に1記事を完成させて実測します。

一定のバッファで保証する範囲を広げるには、フォント・ブラウザ・画像枠・最大行数・装飾の張り出しを規定し、超過時の分割と出力停止をつなぎます。今回実装したのは実測と停止の工程です。詳しい順序はdocs/15を優先します。

## 2026-09-23の作業記録

更新日：2026-09-23。対象：TomTomYoung/isekai_zasshi、master。
開始時のmaster：`b6e8c40aff115628b6203706b8e5be691adc3bb5`。

### 現在地

dev用入口の日本語ファイル読取を修正しました。CodeSwingが使うfetch-mock 9.11.0とVS Code URIの組合せで旧入口が止まることを再現し、修正版は同じ模擬経路を含む12件の試験に成功しました。実行結果と環境は [tests/preview/README.md](tests/preview/README.md) を参照してください。

利用者のvscode.dev / github.devでの成功は未確認です。クラウドブラウザからgithub.devを開き、vscode.devのリポジトリ画面とGitHub Repositoriesの認証許可ダイアログまで確認しました。「許可」の操作は自動承認レビューで拒否されました。拡張へ与えるGitHubアクセスの対象・範囲が明示承認されていない、という理由です。認証を迂回していません。GitHubコネクターによるリポジトリ読取・反映とは別の権限です。

今回の結論は「再現できたコード不整合を修正、模擬とHTTPで検証、dev実機は認証段階で未確認」です。利用者が前回どの段階で止まったか、導入版、Swingルートは依然不明です。

### 保護範囲

`202603/` は変更・再生成していません。旧出力スクリプト・号全体ビルド・EPUBビルドは実行していません。202604の原稿HTML、Markdown、画像も変更していません。試験は既存の表紙と制服名鑑、およびメモリ上の独立fixtureです。生成PNGは検査用の一時成果物で、既存記事のpreview PNGへ上書きしません。

`202603` のツリーSHAは `6dde79372cc505e2b732f31193b38b8bdda47bcb`。差分と反映後のtreeで不変を確認します。別会話のローカル作業にあった未commit変更は触らず、別の作業場所を使いました。

### 原因の切り分け

旧入口は `fetch('202604/00_表紙/fixed_layout.html')` をCodeSwingの中継へ渡していました。fetch-mock 9.11.0はこれを `/202604/00_%E8%A1%A8%E7%B4%99/fixed_layout.html` に正規化します。CodeSwingのhttpRequest処理は `Uri.joinPath(swing, value.url)` にそのまま渡し、workspace.fsは「表紙」ではなく「%E8%A1%A8…」という名前を探します。さらに公開実装にはこのreadFile失敗をhttpResponseとして返すcatchがなく、画面側はタイムアウトを待ちます。

修正では、同一originの空iframeから取得したブラウザ本来のfetchを使い、記事本文も画像と同じWebview資産URLで読みます。CodeSwingのfetch-mockを改造せず、新規拡張・サービスも追加しません。本文は元のfixed_layout.htmlから読み、srcdocはメモリ上だけです。

前回の「dirnameでworkspaceが消える」仮説は、実際のURI変換では再現しませんでした。`Uri.parse` が一度デコードし、Webview URLのパスは `/vscode-vfs%3A//github/.../` の階層を保ちます。以前の3assertはURI.parseを省略した仮定の試験であり、今回の原因の証拠にはしません。

### 実装した修正

入口に、スクリプト起動、資産基準、HTML要求・返答サイズ、iframe、紙面検査、停止理由の診断欄を追加しました。未起動時の案内は静的HTMLにもあります。単一のタイムアウトをフォルダ選択ミスと断定しません。

読み直しごとにHTML、直接参照する画像・CSS・JS、記事内のGET fetchへ更新用の識別子を付けます。日本語・空白の静的パス、後からimg.srcへ設定する候補画像、string / URL / Requestのfetchを扱います。GET以外と外部fetchは対象外です。

画像・候補切替・fetch・使用フォントの準備待ち、資産やJavaScriptのエラー表示、遅延変更の継続監視を追加しました。読込世代ごとの状態とAbortControllerで、連続再読込・記事切替時の古い処理を切り離しました。

内部viewportは1456×2056を維持し、外側だけを縮小します。青枠はiframe外です。直接表示用ガイドは `?fixedPreviewGuide=1` の明示指定でのみ有効にし、body余白の変更とnavigator.webdriver分岐を除去しました。iframe内では直接表示用ガイドを起動しません。

### 検証と限界

[試験記録](tests/preview/README.md)、[機械可読結果](tests/preview/results.json)、[旧入口の失敗再現](tests/preview/baseline-results.json) を参照してください。手順と合格範囲は [docs/14](docs/14_preview_acceptance.md) です。

SOURCE_REVIEWED、MOCK_PASSED、HTTP_ARTICLE_PASSEDを確認しました。同一環境のPNG比較は全6ページの寸法・要素・文字行座標が一致し、微小な画素差は試験記録に数値と上限を残しました。既存の製品PNG全工程の検証とは分けます。DEV_ARTICLE_PASSEDは未達です。実機のCSP・service worker・Webview資産のCORS・GitHub仮想ワークスペースの保存/キャッシュは模擬サーバーでは証明できません。

背景画像、CSSのurl() / @import、未使用Webフォント、長いタイマーで追加される全依存資産の完全検査は未対応です。外部CSS自体は更新対象ですが、その内部の同名画像等のキャッシュ更新は保証しません。モジュールのimportやlocation依存のWebアプリを再現する汎用サーバーでもありません。今回対象の表紙・制服名鑑の範囲を、任意の記事へ拡大して保証しないでください。

### 次に行うこと

GitHub Repositoriesへの認証許可についてユーザーの明示承認を得た場合に、ブラウザ実機を続けます。新たなOAuth権限画面が出たら、その実際の権限範囲を確認してください。未保存・未commit編集の削除、初期化、新規Swing作成は不要です。

最新masterを開いたdevで、CodeSwingの既存Swingとしてリポジトリ直下を開きます。記事の保存と入口の「保存後に再読込」を行い、表紙→制服名鑑、画像、ページ切替、倍率、青枠を確認します。環境・CodeSwing版・ルート・診断欄・最初のエラーを一度に記録します。ここが成功するまで作業全体を完了扱いにしません。

### 別系統の残件

`preview/index.html` / `preview/app.js` は別のPages/HTTP入口です。今回そこには統合していません。iframe高さを文書全体へ伸ばす処理とページ余白の変更は残ります。Pagesの公開設定は変更していません。今回の反映commitには `[skip ci]` を付け、既存のPages公開workflowは起動させません。GitHub Actions上での試験成功を主張しません。前回APIのhas_pages=falseという記録を今回再検証した値とは扱いません。

Markdown改稿と固定HTML同期は別問題です。記事の編集承認は [202604/HANDOFF.md](202604/HANDOFF.md) と [STATUS](202604/STATUS.md) を参照し、古い画像数を再集計せず今日の値にしないでください。

ビルドの全記事対象選択、統合前の出力削除、missing-only、fallback、EPUB検査等は [文書監査](docs/13_documentation_audit.md) に残る別件です。今回、全文改稿・画像再採用・全号再生成・Notion操作は行っていません。

### 文書の入口

[docs/README](docs/README.md)、[CodeSwing](docs/06_codeswing_dev_preview.md)、[方式比較](docs/12_preview_methods.md)、[文書監査](docs/13_documentation_audit.md)、[合格条件](docs/14_preview_acceptance.md)。前回の文書のみの監査は開始commitの履歴に残っています。
