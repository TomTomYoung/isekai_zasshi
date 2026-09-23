# 文書・実装整合の監査記録

実施日：2026-09-23。
基準コミット：`7c1f911b0e321de73648df3e38ce1a9bb3abb628`。
今回の変更：文書のみ。ソース実装、本文、画像、202603、PNG/EPUBの再生成は対象外。

## 同日追補：プレビュー修正後の状態

以下のDOC-01〜14は開始commit時点の文書監査記録です。「未修正」「今回文書のみ」はその監査時点を指します。同日後続の実装修正についてはこの追補と [HANDOFF](../HANDOFF.md)、[試験記録](../tests/preview/README.md) を優先します。

DOC-02 / 03：直下入口の日本語パス不整合を修正しました。fetch-mock 9.11.0が相対パスをエンコードし、CodeSwingのUri.joinPathへデコードせず渡すことでworkspace.fsが別名を探します。実ライブラリを使う模擬中継で旧版の読込停止を再現しました。現行はHTML本文もWebview資産URLからnative fetchで読む方式です。本文のコピー原稿や拡張を新設しません。

DOC-04：直接表示ガイドのnavigator.webdriver分岐とbody余白変更を除去しました。直接URLにfixedPreviewGuide=1を明示したときのみ起動し、iframe内では起動しません。Pages用app.jsの動的なiframe高さとページ間余白は未修正です。

DOC-10：今回追加したプレビュー試験は候補画像、CSS/JS、GET fetch、読込世代、キャッシュ更新、寸法・ページ切替・PNG比較を対象にします。既存の記事ビルド/統合スクリプトのfallback、入力待機、出力置換の問題まで解決したわけではありません。

DOC-14：前回の3assertはVS CodeのUri.parse処理を省いた仮定でした。vscode-uri 3.2.0で実際の処理順を通すと、代理URLの階層が保たれ、dirnameによるworkspace喪失は再現しません。この仮説を利用者の障害原因とする説明は撤回します。

実機：github.devからvscode.devへの遷移とGitHub Repositories認証許可画面を確認しました。許可操作は自動承認レビューが、拡張へ与えるGitHubアクセスの明示承認不足を理由に拒否しました。利用者devの導入版・資産読取・保存再読込は未確認です。試験結果を実機成功へ格上げしません。

保護：202603のtree SHAを維持し、202604の原稿・画像も変更しません。テストfixtureはメモリ内で配信し、PNGはexports/preview-testsへ出すため、既存出力や原稿を上書きしません。

## 監査の範囲と証拠

README、プレビュー文書・入口、Markdown正本規則、記事単位ビルド仕様・まとめを現コードと照合しました。202604の旧企画・増補仕様、既存の編集ハンドオフ・現況表も、新しい技術作業と混同される箇所を確認しました。旧発売記録や容量設計は適用範囲を確認して履歴へ分類しています。

17件の既存docs文書の目録は確認していますが、全創作本文・全画像・全旧版を再校閲した監査ではありません。特にreflow関連の過去成果物、KDP登録情報、以前の画像点数は今回再検証していません。未再検証の資料を新しい実績として扱いません。

調査はGitHubコネクターによる版を指定した読取です。この作業環境ではコンテナからGitHubへの直接取得がDNSエラーになったため、ローカルcloneによる全量試験は実施していません。記載したコード上の指摘を、利用者devで再現済みのエラーへ格上げしません。

## DOC-01：デスクトップVS Codeとdevの混同

会話で案内したHTMLプレビューのアイコン・`Open in Integrated Browser` が、利用者のdevにはありませんでした。そのメニューが存在する前提の案内は撤回されたままとします。

修正：README、文書案内、CodeSwing文書で、devのWeb拡張、デスクトップ、リモート計算環境を分けました。Node用Tasksやbatをdev単体の操作手順に載せません。

根拠：[VS Code for the Web](https://code.visualstudio.com/docs/remote/vscode-web)、[Integrated Browser](https://code.visualstudio.com/docs/debugtest/integrated-browser)。デスクトップ側の説明をdevの機能提供の証拠にしません。

## DOC-02：CodeSwing実装を利用可能と扱いすぎていた

`docs/06_codeswing_dev_preview.md` には模擬試験と実機未検証の但し書きがありましたが、導入説明をそのまま読むと利用できる手順に見えました。その後に利用者の不調報告があります。

修正：現況を「実装あり・利用環境で不調・原因未特定」へ更新しました。新規Swingと既存Swingを区別し、実機の未確認事項・停止段階・再現試験を残しました。旧報告のテストを今回追試したとは記載しません。

## DOC-03：二つのindex.htmlの責務が不明瞭

`index.html` はdev/CodeSwing用で、固定高さのsrcdoc iframeとページ切替を使います。`preview/index.html` はPages/HTTP用で、記事URLをiframeへ読みます。PNGの一覧HTMLではありません。

修正：入口・ソース・対象版・用途をREADMEと各プレビュー文書に明記しました。別の入口の修正が、自動で両者を修正するわけではありません。

## DOC-04：同じviewportという説明がPages側では不正確

`preview/app.js` の `applyScale` はiframe高さを `contentHeight` に変更します。幅は1456ですが、複数ページ記事で高さ2056を維持するコードではありません。`injectGuide` はページ余白も追加します。

`preview/fixed_layout_screen_preview.js` はbody余白とoutlineを変更し、`navigator.webdriver` を見てスキップします。通常閲覧と自動撮影の実行経路が異なり、Pagesのチェックボックスを外しても別ガイドのoutlineが残る可能性があります。

修正：文書の保証範囲を訂正しました。実装修正は未実施です。青枠・固定寸法・資産読込・実出力の試験を分離して引き継ぎました。

## DOC-05：Pagesの公開準備と公開完了の区別

`.github/workflows/pages-preview.yml` と `_site` 生成コードは存在します。2026-09-23の `GET /repos/TomTomYoung/isekai_zasshi` は `has_pages=false` でした。公開成功を裏付ける確認済みURLはありません。

修正：未公開・未検証として記録しました。サイトビルドはPNG生成ではなくファイル配置です。`202603` 指定拒否はこのビルドの機能であり、すべての既存ツールが202603を保護しているという意味ではありません。

公開前の残件：コピー対象記事フォルダに原稿・企画・不要画像等が含まれる範囲、参照資産の不足、余分な生成物の除外を確認すること。現コードの `/preview/` 等を含む文字列フィルターは、ディレクトリそのものの判定も含めた検証が必要です。

## DOC-06：Markdown正本規則と自動変換実装は別

`tools/build_article.mjs` の `copyIntermediate` はMarkdownを中間フォルダへコピーしますが、本文をHTMLへ変換しません。撮影するのは既存の `fixed_layout.html` です。devビューアーも既存HTMLを読むだけです。

修正：正本規則を維持しつつ、「MDを変えれば既存プレビューが自動更新される」「build:articleでMDから紙面が生成される」と誤読されないようにしました。確認したこれらの経路に変換工程はありません。リポジトリ内の全歴史的変換スクリプトの不存在を断定したものではありません。

現行の編集記録にも、Markdown改稿済み・派生HTML未同期という状態があります。HTMLを正確に撮影できても、最新原稿を表示していることにはなりません。

## DOC-07：全体ビルドと統合の対象選択が一致しない

`build_issue_articles.mjs` は固定HTMLのない記事フォルダをスキップします。`collect_issue_pages.mjs` は全 `NN_` フォルダを走査し、それぞれの `intermediate/article_manifest.json` を要求します。未生成や起動用だけのフォルダがあると統合で停止します。

加えて、統合は全入力を検証する前に `kindle_pages` を削除します。manifest不備で停止した場合、古い出力だけが失われ得ます。

修正：記事ビルド仕様から「そのまま全号完成」の案内を外し、全入力の事前確認と収録記事リストの設計を未解決事項として明記しました。コードの対象選択・削除順は未修正です。

## DOC-08：--missing-onlyは差分ビルドではない

`build_issue_articles.mjs` の `--missing-only` はmanifestが存在する記事をスキップします。MD/HTML/CSS/画像の更新時刻やハッシュを比較しません。

修正：変更済み記事には明示的な記事ビルドが必要と訂正しました。将来は依存資産込みのソース版をmanifestへ保存する案を検討します。

## DOC-09：出力ディレクトリとlegacyフォールバックの説明が古い

`export_fixed_layout_images.mjs` の出力は `exports/<issue>/fixed_layout_images` です。旧tools READMEや記事まとめに残った号なしパスを訂正しました。

`build_fixed_layout_epub.py` は `exports/<issue>/kindle_pages` だけを読み、号なしパスへフォールバックしません。旧記事仕様の説明と異なります。

一方、`check_fixed_layout_outputs.py` は号別ディレクトリ/EPUBがなければlegacyモードへ切り替わります。生成側と検査側が同じ入力選択をするという説明は不正確です。検査はPNG寸法・連番・一部の件数を確認しますが、完全なEPUB規格検証や記事の欠落検証ではありません。

修正：docs/10と11、tools READMEを現コードに合わせました。旧202603の発売時点資料は改変せず履歴として残します。

## DOC-10：fallback・サイズ定数・読込待ちを品質保証と混同しない

記事ビルドには `.fixed-page` 不在時のfallbackがあり、manifestに `fallback` を出します。しかし統合側はfallbackを拒否していません。manifestのwidth/heightは定数で、PNGの実寸検査とは別です。

画像やフォントの待機には固定時間の上限があり、未読込でも先へ進む経路があります。`img.complete` は失敗でもtrueになり得ます。画像を `.missing` 表示に置き換える記事では、現在のimg件数だけを見ると欠落が隠れる可能性もあります。

修正：失敗を成功に見せないための条件を文書化しました。既存スクリプトがすべて厳密な検証を行うとは記載しません。根拠：[HTMLImageElement.complete](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/complete)。

## DOC-11：旧202604企画と現行記事の衝突

旧 `docs/07_202604_issue_plan.md` は02を旧企画にしています。旧 `docs/08_202604_volume_expansion_spec.md` には異なる番号構成や全記事共通の増補テンプレートがあります。現行02は `02_はじめてのギャルギルド` で、既存編集ハンドオフは記事ごとの形式の違いを重視しています。

修正：旧企画2文書の原文を `docs/legacy/2026-09-23/` に元blobのまま保存し、従来パスを現況案内へ置換しました。旧番号を使う記事ビルド例は実在する制服名鑑へ変更しました。記事の改番・削除・旧企画の復活はしていません。

## DOC-12：旧計測文書を同時に現行規則へしない

旧計測仕様には重み予算やh2での改ページがあり、容量設計にはパッケージ単位の実測や無条件改ページの禁止があります。またAI修正指示には202603を対象にした計測ループの注意があります。

修正：これらは異なる設計段階の背景資料として文書案内へ分類しました。202604の現行HTMLへ、確認せず一方のアルゴリズムや共通CSSを全面適用しません。202603の当時の設計・実装をこの監査で変更していません。

## DOC-13：編集履歴と最新の技術ハンドオフの分離

202604/HANDOFF、STATUSの先頭には09-15の作業記録があり、その中でもさらに古い画像状態が併存します。改稿済みと承認済み、MD画像配置済みと固定HTML同期済みも別状態です。

修正：技術再開の起点を直下のHANDOFFへ集約しました。既存の編集履歴を削除・上書きせず、日付付き記録として参照します。今回、画像数や全記事承認状態を再集計した扱いにはしません。

## DOC-14：代理URL解決の新しい調査候補

CodeSwingの `getProxyUri` は元URI全体をエンコードします。直下indexの `resourceRoot = new URL('.', document.baseURI)` は、通常の階層URLを前提にする形です。

Node v22.16.0で、エンコードされたURIが一つのURLセグメントにある例ではdirname操作によりその情報が失われることを3assertで確認しました。これは実URL未取得の静的調査候補であり、利用者の障害原因が確定したわけではありません。再現コードと必要な実機証拠は [検証手順](14_preview_acceptance.md) にあります。

## 文書ごとの扱い

README、tools/README、preview/README、docs/06_codeswing、docs/09、docs/10、docs/11は現況に合わせて改訂しました。HANDOFF、docs/README、docs/12〜14は再開・選択・検証のための新規文書です。

docs/07・08は現況案内へ更新し、原文は日付付きlegacyに保存しました。202604/HANDOFF・STATUS・EDITORIAL_AUDIT・EDIT_LOG・画像不足一覧・画像配置記録は既存編集記録として残します。今回全文を再監査していないファイルも含むため、最新の事実は実ファイルと直近の変更から照合してください。

docs/01チェックリスト、02系の旧ビルド、03系の旧release/AI修正指示、04系の旧公開後記録/計測、05容量設計、06_current_kdp_release_specは過去工程の資料です。特にKDP登録・販売情報の正確性を再確認したという意味ではありません。

## 残件と非実施事項

最優先はdevでの実機原因切り分けと修正です。次にHTML同期の方法、明示的な号収録リスト、入力検証後の出力置換、fallback拒否、厳密な資産待機、基準フォントとsource hashの固定を検討します。

全記事の再組版、本文校閲、画像不足再集計、202603再出力、Pages設定変更、外部サービス契約は実施していません。これらを文書の見直しだけで完了へ移さないでください。
