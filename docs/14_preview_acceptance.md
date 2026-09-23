# プレビューの切り分けと合格条件

更新日：2026-09-23。目的は、同じ未確認操作を利用者に繰り返させず、どの段で失敗するかを最小の証拠で特定することです。修正対象は202604と必要な共通プレビュー処理に限定し、202603は保護します。

## 証拠の段階

`SOURCE_REVIEWED`：ソースコードで処理の存在を確認。

`MOCK_PASSED`：模擬のURL・データ・拡張中継で試験成功。

`HTTP_ARTICLE_PASSED`：通常HTTP上で対象commitの実記事・実資産を試験。

`DEV_ARTICLE_PASSED`：利用するdev/CodeSwing版で実記事・実資産・保存再読込を試験。

`PNG_COMPARED`：対象ソース・環境を記録して出力PNGと比較。

一つのラベルで全部を代用しません。今回の再現コード・環境・結果は [tests/preview](../tests/preview/README.md) に保存しています。旧入口の失敗を再現し、修正版の模擬・実記事HTTP試験と同一環境PNG比較を実施し、12件が成功しました。DEV_ARTICLE_PASSEDは未達です。GitHub Repositories認証の許可操作が自動承認レビューに拒否されたため、実機の資産表示・保存再読込へ進んでいません。

PNG比較は、既存記事のソースを同じ環境のPlaywrightで撮影した検査用PNGとsrcdoc表示の比較です。既存の製品PNGの再生成やbuild_article全工程の検証ではありません。紙面内の全要素とテキスト行の相対座標を一致させた上で、描画時の小差を計測します。画素完全一致とは記載しません。

## 最初に残す環境情報

```text
確認日：
repo / branch / commit：
devのURL種別（vscode.dev / github.dev / 接続先あり）：
ブラウザ名・版・OS：
CodeSwingの導入版：
開いているSwingのルート：
入口に表示された状態文字列：
Consoleの最初のエラー：
失敗した資産の種類とパス：
```

認証トークン・Cookie・私的なURLパラメータは保存しません。ブランチ切替や再読込の前に未保存/未commit変更を保護します。表示の失敗を消すためにブラウザの保存データを無差別に削除しません。

## ゲート1：入口の実行

既存の直下indexを開いているかを確認します。「記事選択」「保存後に再読込」「倍率」等が目印です。CodeSwingの新規HTML-only試作品が表示されても、この入口の合格ではありません。

現行の「読込診断」で、スクリプト起動、Webview資産/native fetch経路、HTML本文読取、資産読取、紙面準備の各段階を表示します。単一のタイムアウトだけでフォルダ選択ミスと断定しないでください。

## ゲート2：読取経路を一種類ずつ確認

最小HTMLの見出しが表示されることを確認し、次に既知の小さな画像1点、外部CSS1本、外部JS1本、相対fetchのJSON1件の順で追加します。試験資産のパス・サイズ・返却内容を記録します。

日本語フォルダ、空白を含むファイル、親フォルダの許可範囲内の相対参照、欠落ファイルも試します。HTTP成功だけでなく、CSSの期待プロパティ、JSの期待した表示、画像のnaturalWidth/Heightを検査します。404ページを画像やHTMLの成功データと取り違えません。

修正版は本文もWebview資産URLから読みます。本文、画像/CSS/JSは診断項目として分け、CORSやCSPは実機で確認します。`document.baseURI` とブラウザが要求したURLを、認証情報を除いた形で記録します。

## ゲート3：保存と再読込

元の固定HTML内の試験文字列を変更・保存し、入口の再読込だけで変化することを確認します。commit/pushを挟みません。次に外部CSS、外部JS、同名画像の差替えをそれぞれ確認します。

未保存テキストも反映する設計へ変更する場合は、保存済みファイル読取とは別の仕様とします。現在の入口は保存後の明示的再読込を意図しています。画像や外部ファイルがキャッシュで旧版にならないことを検査します。

## ゲート4：実紙面・固定寸法

最初に202604の表紙、次に制服名鑑を使用します。元記事の改稿・新規画像制作を試験のために勝手に行いません。必要なら独立したテスト用ディレクトリとfixtureを使います。

iframe内の `innerWidth/innerHeight`、`.fixed-page` のborder-box、選択したページの先頭位置を確認します。1456×2056を基準に、25%・50%・100%と狭いエディタ幅で内部寸法が変わらないことを確かめます。

先頭・中間・最終ページへの切替を試します。最後のページでスクロール上限により余白が残る場合も、成功にしません。`.fixed-page` の大きさを見た目だけで合わせるのではなく、記事内部の改行・要素位置も比較します。

青枠のon/offで記事の幅、高さ、改行、スクロール基準が変わらないことを確認します。Pages側の動的iframe高さ、body余白、通常ブラウザ専用ガイドは別々に試験します。

## ゲート5：失敗・遅延・資産の完了

遅い画像、壊れた画像、フォント待ち、CSS欠落、JS例外、`.fixed-page` 不在を確認します。`img.complete` だけでは合格としません。候補画像をすべて試した結果の `.missing` 等も、欠落として報告します。

背景画像、srcset、Webフォント、記事が後から差し込む画像にも注意します。記事が独自の準備完了Promiseや属性を提供する方式は未実装案であり、採用時は撮影側も同じ契約を待つようにします。固定の500ms待機を「全資産準備完了」と説明しません。

連続再読込や記事切替では、古い非同期処理が新しい画面の状態を書き換えないことも確認します。

## ゲート6：PNGとの比較

同一ソース版を通常HTTPでPlaywrightへ渡し、撮影対象とページ数を揃えます。ブラウザ・OS・viewport・DPR・フォント・media・アニメーション・資産待機条件を記録します。

青枠やバッジが出力へ入らないこと、PNGの実寸が1456×2056であることを実ファイルで確認します。manifestへ定数を書くだけでは寸法検査になりません。

同一環境なら可能な範囲で画素比較、異なるOSなら主要要素の相対座標・改行・切れ・ページ数を中心に比較します。許容差は結果を見て明示し、失敗画像を正解へ自動更新して通しません。

## 前回の限定的なURL検証と今回の訂正

2026-09-23、Node v22.16.0で以下の3assertが成功しました。使用ドメインは説明用です。実機のCodeSwingから取得したURLではありません。

```javascript
const assert = require('node:assert/strict');
const virtual = 'vscode-vfs://github/TomTomYoung/isekai_zasshi/';
const wrapped = 'https://proxy.example.invalid/' + encodeURIComponent(virtual);
const normal = 'https://preview.example.invalid/isekai_zasshi/';
const article = '202604/00_表紙/fixed_layout.html';
const after = new URL('.', wrapped);
assert.equal(after.pathname, '/');
assert.equal(new URL(article, after).pathname,
  '/202604/00_%E8%A1%A8%E7%B4%99/fixed_layout.html');
assert.equal(new URL('.', normal).pathname, '/isekai_zasshi/');
```

エンコードされた元URIを一つのセグメントに持つURLにdirname処理をすると、通常の階層URLとは違ってワークスペース情報を失う、という確認です。実機のURL形式、CodeSwingの導入版、要求の中継先を確認するまで、利用者の不調の原因とは確定しません。

同日後続の検証で、上記の例は実際のCodeSwing URI変換を再現していないことが分かりました。Uri.parseがデコードした後の代理pathは `/vscode-vfs://github/.../` で、Webview変換後も階層が保たれます。vscode-uri 3.2.0を使うテストを追加し、dirnameによるworkspace喪失仮説を撤回しました。

新たに再現したのはfetch-mock 9.11.0のURL正規化とCodeSwing workspace.fs中継の不一致です。表紙のパスが `%E8%A1%A8%E7%B4%99` を文字どおり含む別名になります。修正は入口のテキスト読取をブラウザ本来のWebview資産fetchへ移すものです。拡張側のコードやURI形式を書き換える対応ではありません。

## 自動試験の再実行

Nodeを実行できる作業環境で `npm install`、`npx playwright install chromium`、`npm run test:preview` を実行します。dev単体でこのコマンドを実行できるという意味ではありません。既存Chromiumを使う場合はPREVIEW_CHROMIUMへ実行ファイルのパスを指定できます。

試験用サーバーはloopback限定です。既存記事とGitにある資産を読み、独立fixtureをメモリで配信し、結果をexports/preview-testsへ保存します。202603や記事原本へ書き込みません。実機のWebview service worker / CORS / CSPまでは模擬しません。

ソースhash、環境、検査対象、画素差の条件、未実施事項はtests/preview/README.mdとresults.jsonに記録します。CSS内部依存や背景画像、フォント全般を無条件で合格扱いにしないでください。

## 引き渡す成果物

再現可能なテストコード、fixture、失敗時のログ、成功時の環境情報、対象commit、代表画面または出力の参照をリポジトリへ残します。共有してよい画像だけを対象にし、認証情報やフォントファイルを外部へ配布しません。

利用者環境で確認できていない項目は未確認のまま残します。テスト結果を本書とHANDOFFに反映し、ソース差分が202603へ及んでいないことをGitの差分とツリーSHAで検証します。
