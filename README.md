# 異世界雑誌

## 最重要ルール：記事本体は `.md`

**記事の本体・正本は必ず `.md` ファイルです。**

HTMLは本文の正本ではありません。HTMLは `.md` から生成・変換される派生物です。

各記事ディレクトリでは、本文を書く・直す・増補する場合、必ず以下の本文Markdownを作成・編集します。

```text
202604/NN_記事名/記事名.md
```

`企画.md` は記事設計メモです。本文本体ではありません。

```text
企画.md        = 記事設計・構成メモ
記事名.md      = 記事本文の正本
記事名.html    = 中間HTML
fixed_layout.html = 固定レイアウト用HTML
```

**本文更新をHTMLだけで済ませてはいけません。**

---

## まずこれ：記事単体の固定レイアウト確認

記事を直したら、いきなりEPUBを作らず、先にその記事だけ画像化して確認します。

### VSCodeでやる場合

1. 確認したい記事フォルダ内の `fixed_layout.html` を開く。
2. `Ctrl + Shift + P` を押す。
3. `Tasks: Run Task` を選ぶ。
4. `Preview current article` を選ぶ。

これで、今開いているファイルのフォルダで `preview.mjs` が実行されます。

出力先：

```text
202604/NN_記事名/preview/
  001.png
  002.png
  003.png
  ...
```

### ダブルクリックでやる場合

記事フォルダ内のこれをダブルクリックします。

```text
preview.bat
```

同じく、記事フォルダ内の `preview/` に確認用PNGが出ます。

### 初回だけ必要

リポジトリ直下で一度だけ実行します。

```bash
npm install
npx playwright install chromium
```

### 何をやっているか

```text
記事フォルダの fixed_layout.html
  ↓
ローカルHTTPサーバーで開く
  ↓
PlaywrightのChromiumで表示する
  ↓
.fixed-page を探す
  ↓
各 .fixed-page を 1456×2056px のPNGとして保存する
  ↓
記事フォルダ内の preview/ に 001.png, 002.png ... として出す
```

画像リンク切れもログに出ます。

```text
images: 3
broken images: 1
- images/example.png
```

`broken images` が 0 なら、とりあえず画像リンクは通っています。

### 関係するファイル

```text
.vscode/tasks.json
  VSCodeの Preview current article タスク

tools/preview_fixed_layout_article_here.mjs
  実際に fixed_layout.html を開いてPNG化する共通処理

202604/NN_記事名/preview.mjs
  共通処理を呼ぶだけの記事内ランチャー

202604/NN_記事名/preview.bat
  ダブルクリック用ランチャー

202604/NN_記事名/preview/
  確認用PNGの出力先
```

---

## 概要

このリポジトリは、異世界雑誌の原稿・固定レイアウト版HTML/CSS・リフロー版HTML・画像・制作手順を管理するためのものです。

`202603` 号 fixed_layout 版は、KDP公開済みです。

```text
fixed_layout版
= 固定紙面向け。1456×2056pxの紙面をPNG画像として書き出す版。
= 202603号ではKDP公開済みの主成果物。

reflow版
= EPUB等のリフロー本文向け。読者環境に応じて本文が流れる版。
= fixed_layout版とは別系統の派生候補。
```

---

## 現在の優先作業

```text
1. 異世界雑誌 202603号 公開後整理
2. 異世界雑誌 202604号 企画・誌面テンプレート設計
3. 異世界雑誌 202603号 reflow v1.0
```

202603号 fixed_layout 版は、KDP公開まで到達したため制作フェーズを閉じます。

次の主眼は、公開済み号の制作記録を残し、202604号以降へ再利用できる制作ルール・テンプレートへ落とし込むことです。

---

## fixed_layout 作業導線

作業手順：

1. [`docs/02_fixed_layout_build_steps.md`](docs/02_fixed_layout_build_steps.md)
   - `fixed_layout.html` / `fixed_layout.css` の存在確認、PNG書き出し、Kindle用連番PNG、固定レイアウトEPUB生成の手順。

2. [`docs/04_202603_post_release_notes.md`](docs/04_202603_post_release_notes.md)
   - 202603号 fixed_layout 版のKDP公開後メモ。制作方式、最終出力、反省点、次号への改善ルール。

固定レイアウト版をEPUBまでまとめて生成するには、リポジトリ直下で以下を実行します。

```bash
npm run build:fixed-layout-epub
```

号数別の正規出力先：

```text
exports/202603/fixed_layout_images/
exports/202603/kindle_pages/
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

固定レイアウト版の主要ファイル：

```text
202603/*/fixed_layout.html
202603/*/fixed_layout.css
tools/export_fixed_layout_images.mjs
tools/prepare_kindle_pages.mjs
tools/build_fixed_layout_epub.py
exports/202603/fixed_layout_images/
exports/202603/kindle_pages/
```

---

## reflow v1.0 作業導線

reflow版は fixed_layout版とは別系統の派生候補です。

作業は以下の順に確認します。

1. [`docs/01_isekai_zasshi_v1_checklist.md`](docs/01_isekai_zasshi_v1_checklist.md)
   - 収録記事、reflow構造、画像、目次、表紙、奥付、読了テストのチェックリスト。

2. [`docs/02_reflow_build_steps.md`](docs/02_reflow_build_steps.md)
   - reflow版ビルド手順。
   - `tools/create_reflow_files.py` と `tools/normalize_reflow_html.py` の実行、HTML正規化、目次・CSS・画像確認を含む。

3. [`docs/03_reflow_v1_release_notes.md`](docs/03_reflow_v1_release_notes.md)
   - reflow v1.0リリースノート。
   - v1.0に含めるもの、v1.0では要求しない品質、v1.1以降に回すもの、タグ名案、リリース文案。

互換用の旧文書：

```text
docs/02_epub_build_steps.md
docs/03_epub_v1_release_notes.md
```

---

## 重要ファイル

### fixed_layout版

```text
202603/*/fixed_layout.html
202603/*/fixed_layout.css
tools/export_fixed_layout_images.mjs
tools/prepare_kindle_pages.mjs
tools/build_fixed_layout_epub.py
exports/202603/fixed_layout_images/
exports/202603/kindle_pages/
```

### reflow版

```text
202603/reflow.css
202603/目次_reflow.html
202603/*/*_reflow.html
tools/create_reflow_files.py
tools/normalize_reflow_html.py
```
