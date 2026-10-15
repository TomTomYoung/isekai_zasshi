# 組版テスター 作業状況

## 2026-10-16 紙面／検査欄スプリッター

中央プレビュー下端と組版検査欄の境界をドラッグできるようにした。

`#preview-splitter` をhorizontal separatorとして追加し、下へドラッグすると検査欄を縮めて紙面領域を拡大、上へドラッグすると検査欄を拡大する。

検査欄高さはlocalStorageへ保存し、再読込後も維持。ダブルクリックまたはHomeで初期値へ戻す。ArrowUp/ArrowDownで24px単位の調整も可能。

最小検査欄42px、最小canvas140pxを維持する。

---


## 2026-10-15 スクロール構造の修正

実画面で、左ペインにサイドバー全体のスクロールと本番ブロック一覧の内部スクロールが併存し、項目が潰れて見える問題を確認。また中央プレビューはiframe内部スクロールと外側canvasスクロールが二重化し、縮小されたiframeのスクロールバーが掴みにくかった。

修正版では、左のblock-listから `max-height` / `overflow:auto` を削除し、左ペインのスクロール1本へ統一。ブロック行の高さと余白も固定した。

中央は組版完了後にiframeを文書全高へ伸ばして内部overflowをhidden化し、`#canvas` のスクロール1本だけを使う。canvas手動スクロール時は現在ページ番号を追従させ、前後ボタン・ブロック選択では外側canvasを対象ページへ移動する。

---


## 2026-10-15 ChatGPT指示範囲

紙面上の空白を含む任意矩形をドラッグ指定し、その位置をChatGPTへ渡す機能を追加。

指示データには記事、正本MD、ページ、1456×2056基準のx/y/W/H、重なるブロック、直前直後のブロック、任意指示文、機械可読 `LAYOUT_TARGET_JSON` を含める。

対応ブラウザでは位置情報テキストと赤枠つきPNGをClipboardへ同時に載せる。失敗時はテキストコピーへフォールバックする。別ボタンで赤枠つき指示PNGも保存可能。

通常PNG/ZIPでは `.layout-instruction-region` をcloneから除去するため、指示枠は製品出力へ混入しない。

---


## 2026-10-15 paginate互換処理の安定化

実画面で「paginate.js互換処理を適用できません。runtime更新に合わせてテスターを更新してください」が発生した。原因は、本番 `paginate.js` のソース断片を完全一致で検索し、実行時に文字列置換していたこと。改行・空白・実行環境側の差で脆く、起動時に組版そのものを停止させていた。

この方式を撤廃し、`layout-tester/paginate_compat.js` を実ファイルとして追加した。本番paginateの本文・表分割、見出し孤立防止、figure再掲、auditロジックを基礎にし、画像なし節だけ正式に追加対応する。

`app.mjs` はこの実ファイルを直接読み、`article_compat.mjs` からruntime文字列置換関数を削除した。unit testも、文字列置換が存在しないことと互換ページネータ実ファイルの画像なし対応を検査するよう変更した。

---


## 2026-10-15 202604全記事読込対応

202604の各記事へ `layout-source.json` を追加した後、04以外には `fonts/font.json` / `fonts/article.woff` が存在せず、テスターがフォント読込で停止することが判明した。

修正版では記事専用フォントを任意化した。専用フォントがない場合は04のArticleSubsetを共通fallbackとして使用し、記事固有codepoint検査をスキップする。

さらに実本文を確認すると、04専用parser契約との差として、旧figure属性、`./` なし画像src、h2サブタイトル省略、画像なし節、1節複数画像、太字等のinline記法、引用空行、`<br>` / `<small>` が存在した。正本を書き換えずメモリ上で正規化する互換層 `layout-tester/article_compat.mjs` を追加した。

`layout-source.json` がある202604本文24件は、互換parser段階ですべて通ることを確認した。unit testでも全layout-sourceを走査して全件parseする条件を追加した。

---


## 2026-10-15 エクスプローラ記事フォルダー入力の復旧

専用API撤廃版で、リポジトリ相対パス入力と「手元のMDで一時差替え」は残っていたが、旧版にあった記事フォルダーの `webkitdirectory` 入力が削除されていたことを実画面で確認した。

修正版ではフォルダー選択を復旧し、`layout-source.json`、正本MD、記事フォント、採用画像をローカルFileから読む。CSS・paginate.jsは本番リポジトリの同じ実装を共用する。

実記事04フォルダーをdirectory inputへ投入するブラウザ試験を追加した。専用endpointには依存しない。

---


## 2026-10-15 専用API撤廃版

実機画面で `Cannot GET /__layout-tester/source` が確認された。原因は、PR #13版が `tools/layout_tester_server.mjs` の動的endpointを起動済みであることを利用条件にしていたため。

修正版では、画面から `/__layout-tester/*` 呼出しを削除した。正本・CSS・runtime・フォントを静的GETし、組版とPNG生成をブラウザ内で行う。

追加・変更した主なファイル：

```text
tools/article_parse.mjs
layout-tester/production_settings.mjs
layout-tester/production_export.mjs
layout-tester/app.mjs
tools/layout_tester_server.mjs
```

`article_source.mjs` を共有module化する案も途中で試したが、同ファイル自体が既存 `fixed_layout.html` の依存ハッシュ契約に含まれるため、本番HTMLを一斉にstale扱いにする問題があると判明した。この変更は撤回し、masterと同じ `article_source.mjs` に戻した。

ブラウザparserは本番関数本体のコピーとし、テストで関数 `toString()` の完全一致を要求する。これにより本番契約を壊さず、ブラウザで同じ文法を使う。

変更後の主要mjs/testファイルはV8構文確認済み。現在の作業環境ではGitHubリポジトリをcloneしてChromium実行できないため、静的HTTPブラウザ試験の実行結果はまだ未計上。旧PR #13以前の成功件数を現行版の成功件数へ流用しない。

---


記録日：2026-10-15。仕様は [HTML_LAYOUT_TESTER.md](HTML_LAYOUT_TESTER.md)。

## 2026-10-15 本番組版経路への作り直し

初版の独自Markdownパーサー／独自レンダラーを、現行入口の組版経路から外しました。

現在の `layout-tester/index.html` は、`layout-source.json` を持つ実記事を対象に、正本Markdownを `tools/article_source.mjs` の `parseArticle()` へ渡し、本番 `template.css`、記事同梱 `ArticleSubset`、本番 `paginate.js` で候補 `.fixed-page` を生成します。

初期対象は `202604/04_聖職者花見乱痴気騒ぎ` です。画面上のMD編集はメモリ上の候補にだけ適用し、既存Markdown・`fixed_layout.html`・PNGを上書きしません。

本番 `paginate.js` が生成する `data-source` / `data-figure` を使ってW/H、位置、margin、padding、紙面端距離、画像可視領域を測定します。一時設定は候補HTMLへCSSとして注入し、その状態で同じ `paginate.js` を最初から実行します。

PNG/ZIPは独自DOMをSVG化する旧経路ではなく、同じ候補HTMLをサーバー側で再生成し、sandboxを有効にしたChromiumで `.fixed-page` を直接スクリーンショットします。

サーバーにはメモリ処理専用の `/__layout-tester/source`、`compose`、`export` を追加しました。通常ファイル配信は引き続き読取専用です。cross-site、異なるOrigin、リポジトリ外パス、正本でないMD指定を拒否します。

単体試験は、実際の04記事について正本MD読込と本番候補HTML生成を検査するよう追加しました。ブラウザ試験もdemo.md中心の検査から、04記事のsource contract、fixed-page、本番audit、実測、一時CSS再組版、1456×2056 PNGへ差し替えました。

GitHub上の変更後 `app.mjs`、サーバー、単体試験、ブラウザ試験についてV8構文確認を行い、構文エラーがないことを確認しています。この作業環境ではリポジトリをローカルcloneできず、loopback Chromiumの実行結果はまだ取得していません。PRまたは利用者環境で `npm run test:layout-tester` を実行し、実HTTPブラウザ試験を確認する必要があります。

旧 `renderer.mjs` / `export.mjs` は履歴・比較用に残っていますが、現行入口からは参照しません。旧模擬ブラウザ試験の成功件数を現行本番テスターの成功数へ合算しません。

---

## 2026-10-15 実装反映の更新

本変更で `layout-tester/`、`tools/layout_tester_server.mjs`、`tests/layout-tester/` とnpmスクリプトを追加しました。起動はリポジトリ直下で `npm run layout:tester`、入口は `http://127.0.0.1:4173/layout-tester/` です。操作は [layout-tester/README.md](../layout-tester/README.md) を参照してください。以下の「仕様と記録のみ」は初回PR #11時点の履歴で、現在の配置状態ではありません。

前回の書込拒否には詳細な理由が返っていないため、原因を特定したとはしていません。コードを点検し、テストのサンドボックス無効化指定とメモリ注入経路を削除しました。ブラウザ試験はサンドボックスを有効にしたHTTP経路だけとし、拒否された場合は停止します。アプリのファイル取得は同一origin・認証情報なし・リダイレクトなしに限定し、サーバーはcross-site要求と異なるOriginを拒否します。この修正版は通常のGitHub書込が成功しました。

今回のロジック・実HTTP・テスト起動条件55件と7つのmjsの構文確認は成功しました。ブラウザはサンドボックス有効で起動しましたが、HTTP遷移が `ERR_BLOCKED_BY_ADMINISTRATOR` となり今回の画面試験は未完了です。初回のブラウザ22件の結果と混ぜません。検証範囲と初回記録は [tests/layout-tester/README.md](../tests/layout-tester/README.md)、機械可読結果は [results.json](../tests/layout-tester/results.json) にあります。

202603・202604、原稿、画像、既存固定HTML・PNG、記事承認状態、既存ビルド実装は変更しません。package.jsonは既存内容を保持して起動・試験の2項目を追加し、依存ライブラリとpackage-lock.jsonは変更していません。Windows実機・既存テスト群の再実行、既存記事ビルドへの統合は未完了です。

## 初回記録（PR #11時点・以下は履歴）

## リポジトリへの反映状況

この時点でリポジトリへ反映したのは仕様書と本記録です。実装ファイルのGitHub書込は接続ツールの安全性確認でブロックされました。別経路で回避していません。したがって、この記録を実装コードの配置完了として扱わないでください。

検証済みの実装は会話の添付ZIPで引き渡します。対象は layout-tester/、tools/layout_tester_server.mjs、tests/layout-tester/ とnpmスクリプトの追加です。既存記事の原稿・画像・固定HTML・PNGは変更していません。202603と202604の内容も未変更です。

## 実装した初版の内容

Markdownとローカル画像・記事フォルダーの読込、相対パス解決、JSON設定の読込・保存、1〜3段の横組み、自動改ページ、文章・画像枠・画像可視範囲の寸法計測、margin/paddingと紙面端の距離の表示、ブロック別調整、PNG単ページ出力、全ページPNGのZIP出力です。画像の比率は保持します。長段落はインライン装飾と結合文字を維持して分割し、文字列の保存性を検査します。

## 検証結果と境界

純粋ロジック・HTTPサーバー試験52件、ブラウザ試験22件、計74件が成功しました。環境はNode v22.16.0、Linux、Chromium 144.0.7559.96、DPR 1です。フォントはOSのNoto Sans CJK JPを使用し、配布しません。

PNGの実ダウンロード、1456×2056／2912×4112の寸法、2枚入りZIPとCRC、JSONの保存・再読込、欠落画像・不正設定時の出力停止を確認しました。ガイドや画面ズームを変えても同じ1倍PNGを生成しました。同一環境の紙面DOMスクリーンショットとの比較は2,993,536画素中42画素の差があり、完全一致ではありません。

この環境ではブラウザからlocalhostへの直接遷移がERR_BLOCKED_BY_ADMINISTRATORで制限されました。管理制約は変更せず、ブラウザ試験は本番JS本体とCSSをメモリ上のページへ読み込むハーネスで実施し、demo.md/defaults.jsonだけを模擬fetchで返しました。組版・ファイル選択・PNG/ZIPの生成と実ダウンロードは実ブラウザで実行しています。Node HTTPサーバーは実ポートで別途検証しています。HTTPでのES module読込からUIまでの一貫試験と、利用者のWindows Chrome/Edge・CodeSwing・vscode.devは未確認です。

従来の組版テスト群は再実行していません。既存全記事の校了、全号ビルド、EPUB同期完了を示すものではありません。自由配置ドラッグ、縦書き、巨大な表の自動分割、既存の記事ビルドとの統合は初版に含めません。

## 再開時

添付ZIPのコードを確認し、GitHubへの書込制限が解消された後に配置してください。添付のtests/layout-tester/README.mdに再試験手順があります。masterの差分を再確認し、既存package.jsonは丸ごと上書きせず、layout:testerとtest:layout-testerのnpmスクリプトだけを追加します。コードがまだ存在しない状態でnpmスクリプトだけを追加しないでください。
