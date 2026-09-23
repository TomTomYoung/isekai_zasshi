# 異世界雑誌

異世界の事件、店、人物、商品、広告などを実話誌風のビジュアル雑誌として制作するリポジトリです。

文書更新日：2026-09-23。実装照合の基準コミット：`7c1f911b0e321de73648df3e38ce1a9bb3abb628`。

## 次の作業はここから

再開用の起点は [HANDOFF.md](HANDOFF.md) です。文書の適用範囲は [docs/README.md](docs/README.md)、プレビューの選択肢は [方式比較](docs/12_preview_methods.md)、旧説明との不一致は [文書監査](docs/13_documentation_audit.md) にまとめています。

現在の最優先は、ブラウザ版devで固定紙面を確認する仕組みの不調切り分けです。CodeSwing用の入口は実装されていますが、ユーザーから動作不調の報告があり、失敗する段階はまだ特定されていません。実装の存在や模擬試験を、利用者のdevでの成功と扱いません。

`202603/` は今回の変更・再生成対象外です。旧文書にある全号ビルドや同期処理を、202604の作業開始時に実行しないでください。

## 本文の正本と紙面の関係

記事本文の正本は各記事フォルダの現行Markdownです。

```text
企画.md            記事設計。本文の正本ではありません。
記事名.md          本文の正本。
記事名.html        中間HTML。
fixed_layout.html  固定紙面を定義するHTML。
fixed_layout.css   存在する場合の固定紙面CSS。
```

本文の変更はMarkdownへ反映します。HTMLだけを書き換えて本文を更新済みにしません。一方、紙面の配置・サイズ・スタイルをHTML/CSSで調整することは、本文正本の置換とは別です。

現在確認したビューアーと `build_article.mjs` は、既存の `fixed_layout.html` を表示・撮影する処理です。Markdownから固定HTMLへ自動変換する処理ではありません。最新のMarkdownや素材が、既存HTMLへ同期されているかは別途確認します。[正本規則](docs/09_markdown_source_rule.md) を参照してください。

## 三つのプレビュー入口を区別する

### dev内で編集中の紙面を見る入口

リポジトリ直下の [index.html](index.html) と [codeswing.json](codeswing.json) です。

意図した操作は、CodeSwingで既存リポジトリの最上位を開き、記事の固定HTMLを保存して、ビューアーの「保存後に再読込」を押すことです。毎回PNGを生成したり、commit/pushしたりしない確認を目指しています。ただし、利用者環境では現在不調です。

`New Swing...` で作ったHTML-only試作品と、既存リポジトリの入口は別です。`Initialize Workspace as Swing` で既存ファイルを上書きする必要はありません。未保存・未commit変更を保護してから扱ってください。

詳細は [CodeSwing用入口](docs/06_codeswing_dev_preview.md)、次に調べる順序は [検証手順](docs/14_preview_acceptance.md) です。

### Pages / HTTP上で紙面を見る入口

[preview/index.html](preview/index.html) は、通常のHTTP配信で記事URLを読む別のビューアーです。記事ページのPNG一覧を表示する画面ではありません。

公開用ビルドとworkflowは存在しますが、2026-09-23のGitHub API確認では `has_pages=false` です。公開URLの開通・動作は確認できていません。現在の実装には、iframeの高さや画面ガイドが撮影条件と異なる箇所もあります。

GitHub Pagesは公開されたソースを表示するので、devで保存しただけの未commit変更は反映されません。[プレビューREADME](preview/README.md) を参照してください。

### 実際に生成されたPNGを確認する入口

記事フォルダ内の `preview/*.png` または `pages/*.png` は、Playwrightで実際に撮影した画像です。通常の編集時のHTML確認と、最終PNGの確認は併用できます。

```text
リポジトリ直下 index.html   dev用HTMLビューアー
preview/index.html         Pages / HTTP用HTMLビューアー
記事フォルダ/preview/      記事単体の確認用PNG出力先
記事フォルダ/pages/        記事ビルドのPNG出力先
```

名前が似ていても役割は異なります。固定紙面の基準は1456×2056 CSS px、PNGの期待寸法は1456×2056画像ピクセルです。青枠は確認用ガイドで、はみ出しを自動修正する機能ではありません。

## Nodeを実行できる環境での記事単体PNG

以下はデスクトップや接続した計算環境向けです。通常の `vscode.dev` / `github.dev` 単体でNodeやbatを実行する手順ではありません。

依存関係はリポジトリ直下のlockfileを基準に用意し、Playwright用Chromiumも導入します。これは環境準備の説明であり、今回の文書監査で実行済みという意味ではありません。

```bash
npm ci
npx playwright install chromium
```

既存固定HTMLのある制服名鑑を確認用PNGへ出す例です。

```bash
cd "202604/01_王都女学院春の制服名鑑"
node ../../tools/preview_fixed_layout_article_here.mjs --fail-on-broken-image
```

この処理は記事内 `preview/` を削除して作り直します。手作業のファイルをその出力フォルダへ置かないでください。画像の読込失敗チェックにも限界があり、成功ログだけで全資産・紙面品質を保証しません。

記事manifestを伴う `pages/` 出力は別コマンドです。入力、削除範囲、fallback、号統合の現状は [記事単位ビルド仕様](docs/10_article_level_build_spec.md) を確認してください。

`npm run build:fixed-layout-epub` 等の従来コマンドには202603固定の経路が残っています。202604のプレビュー確認のために実行しません。

## 編集履歴と旧資料

原稿の承認待ち事項、現行企画、画像制作の記録は [202604/HANDOFF.md](202604/HANDOFF.md)、[STATUS.md](202604/STATUS.md)、[編集監査](202604/EDITORIAL_AUDIT.md)、[編集ログ](202604/EDIT_LOG.md) を参照します。日付の古い画像点数や改稿予定を、再確認せず現在の状態として使わないでください。

202603の発売・制作記録は保存されていますが、このREADMEの更新で再公開・再検証したものではありません。過去工程の文書は [文書案内](docs/README.md) から参照します。旧202604企画2文書の原文は [日付付きlegacy](docs/legacy/2026-09-23/README.md) に保存しました。

今回の変更は文書だけです。プレビューの修理完了、全記事のHTML同期、PNG/EPUB生成、記事の校了を意味しません。
