# 記事単位ビルド：短い案内

更新日：2026-09-23。詳細と制限は [記事単位ビルド仕様](10_article_level_build_spec.md) に集約します。この文書に独立した別仕様を持たせません。

## 現在の役割

```text
既存fixed_layout.html
→ 記事単位でPlaywright撮影
→ 記事のpages/*.pngとintermediate/のmanifest・計測結果
→ 入力と収録順を確認した後に号全体へ統合
→ 号別kindle_pagesからEPUBを生成
```

これはMarkdownから固定HTMLを組み立てる処理ではありません。本文Markdownの修正、紙面HTMLへの同期、画像出力、記事承認を区別します。

## 1記事の出力例

NodeとPlaywright Chromiumを用意した環境で、リポジトリ直下から対象を明示します。

```bash
npm run build:article -- "202604/01_王都女学院春の制服名鑑"
```

対象記事の `intermediate/` と `pages/` は削除・再生成されます。既存成果物の保全と、元HTMLが最新かの確認を先に行います。通常のdev単体では実行できません。

記事内 `preview/` へ確認用PNGだけを出す処理は別です。`preview_fixed_layout_article_here.mjs` と `build_article.mjs` の出力を取り違えないでください。

## 全号へ進む前の注意

`--missing-only` はmanifestの存在を見るだけで、変更を検出しません。一括ビルドが未作成の記事をスキップしても、統合は全 `NN_` フォルダのmanifestを要求します。統合処理は入力検証前に出力フォルダを削除します。

現在の202604を、確認なしに全号の連続コマンドで完成させる案内はしません。fallback、未収録・重複番号、元原稿との未同期を解消したうえで進めます。

EPUB生成は号別 `exports/<issue>/kindle_pages` のみを使いますが、検査側にはlegacyへの切替が残ります。詳しい相違とコマンド条件は [詳細仕様](10_article_level_build_spec.md) を確認してください。

202603を対象とする既定コマンドや旧同期処理は今回実行しません。再開は [HANDOFF](../HANDOFF.md) です。
