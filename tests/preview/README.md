# 固定紙面プレビューの再現試験

実施日：2026-09-23。開始master：b6e8c40aff115628b6203706b8e5be691adc3bb5。
[修正版の結果](results.json)、[旧入口の失敗再現](baseline-results.json)。実行コードは [run.mjs](run.mjs) です。記録したファイルhashが試験対象の版を示します。

## 結果

修正版は12件成功、失敗0件。旧入口は3件の検査で日本語HTML読取の停止を再現しました。これは模擬CodeSwing経路であり、利用者devの実機試験ではありません。

SOURCE_REVIEWED：CodeSwing 0.0.25相当の公開commit 96060049ee9795cc6dc92fb60274072d22ed815e。webview.tsのhttpRequestとproxyFileSystemProvider.tsを確認しました。CDNが返したfetch-mock版は9.11.0、mock-xmlhttprequestは5.1.0でした。利用者の導入拡張版は未確認です。

MOCK_PASSED：実物のfetch-mock 9.11.0のブラウザbundleとvscode-uri 3.2.0を使用。CodeSwingのURL正規化→Uri.joinPath→workspace読取の不一致と、ProxyFileSystemProviderのURI解析順を模したローカルHTTPサーバーで検査しました。service worker、CSP、CORS、VS Code仮想ワークスペースの実装は模擬していません。

日本語・空白のHTML/CSS/JS/画像/JSON、string・URL・Request形式のGET、元ファイルの保存に相当するfixture更新、同名画像のキャッシュ更新、遅延画像、連続再読込、404、CSS欠落、JS例外、fixed-page不在、202603拒否を検査しました。fixture更新はサーバーメモリ上で、記事原本を編集しません。

内部viewport1456×2056、各紙面のborder-box、先頭・中間・最終ページ整列、25%・50%・100%・幅合わせ、狭い画面、青枠のon/offを検査しました。

HTTP_ARTICLE_PASSED：開始masterの表紙1ページ・制服名鑑5ページを、直下indexの通常HTTP経路でも確認しました。制服名鑑のimg6要素はouka.png、kinjishi.png、barajuji.pngの実画像を読みました。素材の画像名や記事本文を変更していません。

PNG_COMPARED（同一ローカル環境）：同じ元HTMLを直接開いたPlaywrightの要素撮影PNGと、srcdocの表示を全6ページ比較しました。PNG実寸は全て1456×2056。全要素とテキスト行のページ相対座標は一致（0.001 CSS px丸め）。青枠なしの画像を比較し、直接ガイドを有効にしても座標が変わらないことを検査しました。既存の製品PNGやbuild_article全工程を検査したという意味ではありません。

画素は完全一致ではありません。紙面を別の画面位置・合成面で描画するためと考えられる、グラデーション・輪郭付近の微小差が観測されました。この説明は推定です。平均絶対チャンネル差は最大約0.1383（0〜255）、差が16を超える画素は最大約0.0411%、最大チャンネル差72でした。採用した上限は順に0.3、0.1%、100です。座標と行分割の一致を別の必須条件とし、差分を正解画像へ置き換えて通す方法は使っていません。5ページ目はPNGバイトも一致しました。

DEV_ARTICLE_PASSED：未達。クラウドブラウザでgithub.dev→vscode.devとGitHub Repositories認証許可画面を確認しただけです。「許可」の操作はアクセス範囲の明示承認不足を理由に自動承認レビューで拒否され、実機のWebview表示、保存・再読込、拡張版は確認していません。

## 再実行

Nodeを実行できる環境で行います。ブラウザ版dev単体のコマンドではありません。

```sh
npm install
npx playwright install chromium
npm run test:preview
```

手元のChromiumを使う場合は次の形式です。

```sh
PREVIEW_CHROMIUM=/absolute/path/to/chromium npm run test:preview
```

既定の出力先はexports/preview-testsです。PREVIEW_TEST_OUTPUTで別の一時出力先を指定できます。テストサーバーは127.0.0.1に限定し、終了時に閉じます。元HTMLや既存記事previewへ書き込みません。tests/preview/results.jsonは記録用なので、試験だけでは上書きされません。

旧入口の停止は、基準commitのHTMLを一時ファイルへ取り出して同じハーネスで確認できます。

```sh
git show b6e8c40aff115628b6203706b8e5be691adc3bb5:index.html > /tmp/isekai-preview-baseline.html
PREVIEW_TEST_INDEX=/tmp/isekai-preview-baseline.html PREVIEW_TEST_BASELINE=1 PREVIEW_TEST_OUTPUT=exports/preview-baseline npm run test:preview
```

## 実行環境と再現限界

Node v24.19.0、Playwright 1.60.0（リポジトリ既存lockfileの版）、Chromium 133.0.6943.0、Linux x86_64、DPR 1、screen media。標準PlaywrightのChromiumダウンロードは不完全なZIPで失敗したため、この実行ではnpmの@sparticuz/chromium 133.0.0に含まれるChromiumを使用しました。これはローカル試験の実行環境で、利用者devのブラウザを変更していません。

Google FontsのNoto Sans JP可変TTFをローカルのfontconfigへ追加しました。元記事指定のHiragino/Yu Gothic等がこのLinuxにないため、フォント代替のある環境です。フォントhashはresults.jsonに保存し、フォント本体は再配布していません。利用者Windowsとの文字描画一致は主張しません。フォント取得元は https://github.com/google/fonts/tree/main/ofl/notosansjp です。

背景画像、CSS内url()/@importの依存・キャッシュ、未使用Webフォント、遅延フォントの専用fixture、srcsetの特殊なdata URL、長いタイマー・module import・location依存は未検証です。現行2記事の合格を任意の記事の合格へ拡張しないでください。

## 202603保護

202603の原稿・画像・出力へ変更なし。旧出力ツールを実行していません。Git差分で変更0件、ツリーSHAは6dde79372cc505e2b732f31193b38b8bdda47bcbのままです。202604も記事原本と画像は変更なしです。
