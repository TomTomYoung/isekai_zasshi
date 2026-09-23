# 固定紙面プレビュー：方式と選択肢

更新日：2026-09-23。対象は `isekai_zasshi` の202604。再開は [HANDOFF](../HANDOFF.md)、試験は [検証手順](14_preview_acceptance.md) です。

## 先に分ける四つの問題

「どのソースを見るか」「どこで描画するか」「何を確認するか」「PNGをどこで作るか」は独立です。

```text
ソース：devの未commit編集 / GitHub上のcommit / PCの作業フォルダ
描画場所：CodeSwing / 通常ブラウザ / サーバー側Chromium
確認対象：本文内容 / 固定組版 / 実際の出力PNG
出力場所：ローカルPlaywright / Actions / 別の実行サービス
```

PNGを作らなくてもHTMLで固定組版を確認できます。ただしGitHub上のHTMLを開くだけでは、devの未commit編集を読めません。素材画像のPNGを置く作業と、紙面全体のPNG生成も別です。

方式の状態は「既存実装」「このリポジトリでは未検証」「未実装案」を区別します。機能の一般的な存在を、このリポジトリでの動作確認に置き換えません。

## A. dev + CodeSwing + 読取専用入口

状態：日本語パスの中継不整合を修正。旧入口の失敗再現と修正版の模擬試験あり。利用者dev実機は未確認。

リポジトリ直下の `index.html` と `codeswing.json` が入口です。記事をWebview資産URLへのブラウザ本来のfetchで読み、1456×2056のsrcdoc iframeに表示します。保存後の再読込を意図しているため、成功すればレイアウト確認ごとのcommit/pushやPNG生成は不要です。本文HTMLを複製ファイルへ保存しません。

旧版はCodeSwingのfetch-mockが日本語パスをURLエンコードし、workspace.fsが別名として探す不整合がありました。現行はテキストも画像と同じ資産経路へ統一しました。実機のCSP、CORS、service worker、仮想ワークスペースのキャッシュは未確認です。独自base・外部fetch・CSS内部依存の再帰的更新等には制限があります。string / URL / RequestのGETは模擬試験済みです。

最もユーザーの既存作業に近いので、まず最小の読込試験で可否を判断します。既に動作済みという前提で入口を増殖させません。

根拠：[CodeSwingの公開仕様](https://github.com/lostintangent/codeswing)、[Webview実装](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/webview.ts)、[代理ファイル読取](https://github.com/lostintangent/codeswing/blob/96060049ee9795cc6dc92fb60274072d22ed815e/src/preview/proxyFileSystemProvider.ts)。利用者に導入された版は別途確認が必要です。

## B. GitHub Pages + 固定HTMLビューアー

状態：`preview/`、サイト生成処理、workflowは存在。2026-09-23時点のAPIは `has_pages=false`。公開未確認。

GitHubのcommitを静的サイトへ配置し、ブラウザで紙面を描画します。PNG生成は不要です。HTML/CSS/画像を同じ公開ルートから読めるため、devの仮想ファイルシステムに橋渡しする必要はありません。

通常はcommit/pushと公開反映を待つ方式です。devの未commit編集を自動で参照する機能ではありません。公開後も、現実装ではiframeの高さが文書全体へ変わる点とページ間余白を修正・検証する必要があります。直接表示ガイドの二重起動は今回抑止しました。

`tools/build_fixed_layout_preview_site.mjs` は `_site/` を作り、既存の固定HTMLを持つ記事と共有画像を配置します。号全体のMarkdownを組版する処理ではありません。設定からリポジトリ全体をそのまま公開するのではなく、202604だけを選ぶ現在のビルド経路を前提にします。記事フォルダ内の原稿・企画等までコピーされる範囲は、公開前に確認が必要です。

根拠：[GitHub Pagesのカスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。Pagesは静的配信であり、Pages自身にPlaywrightの実行環境が付くわけではありません。

## C. 通常のHTTPサーバー + ブラウザ

状態：PNG用のNodeスクリプトには一時HTTPサーバーがある。ただし開発者が継続閲覧するサーバーとしては別途起動が必要。前回監査では未実行。今回の修正では直下indexと実記事2件をHTTPで検査し、結果はtests/previewへ記録。

PCの作業フォルダをHTTP配信し、`fixed_layout.html` または固定寸法ビューアーを開きます。ファイル保存と再読込だけで確認でき、GitHubへのpushは不要です。相対画像・CSS・fetchを通常のWebと同じ経路で扱えるため、CodeSwing固有の問題を除外した基準試験にも向きます。

PC等に実行環境が必要です。devがGitHubリポジトリを仮想的に開いている場合、その未commit編集はPCのフォルダへ自動同期されません。ローカルフォルダを同じ実体として編集するか、後述のリモート環境を使う必要があります。

例はNode/Python等を実行できる端末向けです。サーバーを全ネットワークへ公開する必要はなく、通常はloopbackへ限定します。公開済み202603を作り直す工程は不要です。

## D. Playwrightで実際のページPNGを確認

状態：既存の `preview_fixed_layout_article_here.mjs`、`build_article.mjs`、`export_fixed_layout_images.mjs` に実装あり。今回の監査ではPNG未生成。

通常HTTPで記事を開き、Chromiumが描画した `.fixed-page` を撮影します。最終PNGそのものを確認できる方式です。dev単体ではなくNodeとブラウザの実行環境が必要です。既存の各スクリプトは出力先やエラー時の扱いが異なります。詳細は [記事ビルド仕様](10_article_level_build_spec.md) を参照します。

手元のHTMLプレビューと併用できます。毎回の軽いレイアウト調整までPNG生成を必須にする必要はありません。画像の未読込・フォントの代替・fallbackページを検出し、PNG寸法も実ファイルで検査します。

根拠：[Playwright screenshots](https://playwright.dev/docs/screenshots)、[描画差の注意](https://playwright.dev/docs/test-snapshots)。ブラウザ、OS、フォント等による差は分けて記録します。

## E. Web専用の紙面プレビュー拡張

状態：未実装案。CodeSwingへの適合ではなく、目的に必要な機能だけをWeb拡張として実装する案。

VS Codeの `TextDocument.getText()` や `workspace.fs.readFile()` で作業中のファイルを読み、Webviewへ渡します。未保存の編集を含めるか、保存済みだけを読むかを明示できます。現在のHTMLをコピーせず、変更通知で再表示する導線も設計できます。

利点は、仮想ワークスペースのURIを最初から正規のVS Code APIで扱い、読込失敗のログを自前で制御できることです。画像・CSS・フォント・JS・相対fetchのマッピング、CSP、信頼する文書の範囲を実装し、全資産に同じ基準を使います。未保存のCSSと保存済み画像を混ぜる場合の版管理も必要です。

課題は拡張のビルド・配布・インストール・保守です。リポジトリに拡張のソースを置くだけでは利用者のdevに自動導入されません。適用先の版でWeb拡張と仮想ワークスペースの実機試験を行います。

根拠：[Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)、[Webview API](https://code.visualstudio.com/api/extension-guides/webview)。

## F. dev + Remote Tunnels

状態：未導入案。手持ちPC等の計算環境をdevから利用する方式。

実行用PCに同じ作業ツリーとHTTPサーバーを置き、ブラウザのdevからその環境を操作します。保存と実行が同じ作業ツリーに揃えば、HTTPプレビューとPlaywrightを同じ環境で使えます。Remote Explorerは接続先を扱う入口であり、単独でHTMLを描画する機能ではありません。

実行PCの稼働、接続設定、認証が必要です。GitHubリポジトリを開く通常のdevと、計算環境へ接続したdevは区別します。既存の未commit変更の移行方法も確認します。

根拠：[VS Code for the WebのRemote Tunnels説明](https://code.visualstudio.com/docs/remote/vscode-web)、[Remote Tunnels](https://code.visualstudio.com/docs/remote/tunnels)。

## G. GitHub Codespaces + HTTP / Playwright

状態：未導入案。

ブラウザで編集しながら、別途割り当てられた計算環境でNodeやサーバーを動かします。commit前のファイルをHTTPで確認でき、同じ環境でPNGも作れます。仮想ファイルからCodeSwingへ資産を渡す方式とは別です。

起動待ち、利用枠・料金、停止時の扱い、ブラウザとフォントの固定が必要です。ユーザーが使う無料の軽量devと同一サービスだと説明しません。課金や環境作成を無断で実施しません。

根拠：[GitHubによるdevとCodespacesの比較](https://docs.github.com/en/codespaces/the-githubdev-web-based-editor)。金額や無料枠の数字はここに固定せず、採用時に確認します。

## H. ActionsでPNGを自動生成し、成果物へ配置

状態：未実装案。現在のPages workflowはHTMLの配置であり、PNGを生成しない。

対象記事の変更後または手動実行で、Actions上のPlaywrightがPNGを生成し、Actions artifactやPagesへ配置します。PNGを一枚ずつコピーしてdevからアップする手間を自動化できます。ソースcommit、撮影条件、成果物の対応をmanifestに残します。

通常はGitHubへ届いたソースが対象で、devの未commit編集は見えません。即時の編集プレビューと最終出力を別系統にする案です。全画像のGit履歴への自動commitは必須ではありません。

対象を202604に限定し、まず記事単位で実行します。失敗時は既存成果物を残し、空画像やfallbackを成功成果物にしません。実行権限、外部資産へのネットワーク、保持期間、公開範囲も検討します。

根拠：[Playwright CI](https://playwright.dev/docs/ci)、[Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## I. ブラウザ上の小さな編集・プレビュー専用画面

状態：未実装案。二つの運用を区別する。

一つはPagesに編集欄を用意し、HTML/CSSを貼り付けてiframeへ即時表示する方式です。PNGは不要で初期実装は比較的小さくできますが、devと編集欄の二重管理が生じるため主方式にはしません。明示的な一時試験に限り、未保存の内容を取り出せるようにします。画像を既存Pagesから参照すると、未commitの新画像は反映されない点を表示します。

もう一つはユーザーが許可したローカルフォルダをFile System API等で読み込む方式です。同じフォルダを編集するならcommit前の確認が可能です。しかしGitHubを開いたdevのブラウザ内編集データを、別サイトから勝手に読むことはできません。初回取得、ファイル選択権限、対応ブラウザ、画像/CSSのBlob URL化や相対参照が課題です。

根拠：[VS Codeの保存・ローカルフォルダ説明](https://code.visualstudio.com/docs/remote/vscode-web)、[showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)。API対応と許可の条件は採用時にも確認します。

## J. 専用のHTMLプレビュー／撮影サーバー

状態：未実装案。

dev用拡張等から未commitの必要ファイルを版付きで一時送信し、サーバーの固定Chromiumで描画する方式です。実際のPNG確認も可能ですが、サーバーがGitHubをpullするだけでは未commit変更は渡りません。

受信ファイルのサイズ制限、サンドボックス、任意URLへの接続制限、認証、削除期限、ソースの機密性を設計する必要があります。PlaywrightをPages内部で動かすのではなく、別の実行サービスです。外部サービス利用を既定にはしません。

## K. DOM画像化ライブラリ、画面キャプチャ、印刷プレビュー

状態：補助候補。基準のPNG生成経路の置換としては未採用。

html2canvas等はDOMやCSSをもとに別途画像を組み立てる方式であり、Chromiumの要素スクリーンショットと同じではありません。CSSの対応範囲やクロスオリジン資産の制限があり、組版一致の検証が必要です。「ブラウザ上でPNGを作れる」だけを根拠に最終出力へ採用しません。

タブ/画面キャプチャは、ユーザーの許可を伴う表示の記録としては使えますが、画面倍率・DPR・見切れ・青枠の混入・ページ送りを別途扱う必要があります。1456×2056の全ページを自動で正確に取り出せる仕組みが最初から付くわけではありません。

印刷プレビューやPDFは、`@media print`、用紙寸法、余白などで別のレイアウトになることがあるため、screen描画のPNGの代理とはしません。

根拠：[html2canvasの説明と制限](https://html2canvas.hertzen.com/documentation)、[getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)。

## 採用判断の順番

現在の優先は修正版Aの実機確認です。認証許可操作が自動承認レビューで拒否された経緯と必要な承認はHANDOFFを参照します。HTTP基準試験Cを併用し、記事自体の破綻とCodeSwingの資産読取問題を分けます。Aが成立しない場合はE、または実行環境を許容するF/Gを検討します。Bは公開後確認、Hは最終PNGの手動アップロード削減に向きます。

これは提案であり、E〜Kの実装や新サービスの利用を承認済みと扱いません。どの方式でも、元HTMLと同じ内容・固定寸法・資産読込完了・青枠を除いた出力を確認する合格条件は共通です。

外部根拠の確認日：2026-09-23。ローカル/クラウド/公開/未commitの区分を省略して「devならできる」「Pagesなら同じ」と断定しないでください。
