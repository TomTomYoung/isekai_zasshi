# 記事単位ビルド方式まとめ

## 結論

記事フォルダごとに中間ファイルと記事内PNGを持たせ、最後に号全体として統合してEPUBを作る。

この方式では、各記事は独立してビルドできる。最終出力時には、各記事の `pages/*.png` を記事番号順・記事内ページ順に集め、全体ページ番号を振り直す。

## 目的

- 特定の記事だけが固まる、崩れる、画像参照に失敗する問題を切り分ける。
- 全体ビルドを毎回走らせず、1記事だけ再出力できるようにする。
- 記事ごとの中間成果物を残し、原因調査しやすくする。
- 202603だけでなく、202604以降にも同じ構造を使えるようにする。

## 正本と派生物

本文の正本は `.md`。

```text
記事名.md        ← 本文正本
fixed_layout.html ← 固定レイアウトHTML
pages/*.png      ← 記事単位の画像出力
exports/<issue>/kindle_pages/*.png ← 号全体の最終ページ画像
EPUB             ← 最終成果物
```

`.html` や `.png` は派生物であり、本文修正の正本ではない。

## 記事フォルダの責務

記事フォルダは、記事単位で完結する素材と中間成果物を持つ。

```text
202604/01_新人冒険者カモられ事件/
  企画.md
  新人冒険者カモられ事件.md
  fixed_layout.html
  fixed_layout.css
  intermediate/
    article.md
    fixed_layout.html
    fixed_layout.css
    layout_report.json
    article_manifest.json
  pages/
    001.png
    002.png
```

記事フォルダ内の `pages/001.png` は、記事内ページ番号である。号全体のページ番号ではない。

## 全体出力の責務

号全体の最終成果物は `exports/<issue>` に集約する。

```text
exports/202604/
  article_build_results.json
  issue_manifest.json
  kindle_pages/
    0001.png
    0002.png
    0003.png
  isekai_marumie_jitsuwa_202604_fixed_layout.epub
```

`exports/<issue>/kindle_pages/*.png` がEPUB生成の入力になる。

## ビルドの流れ

### 1記事だけビルド

```bash
npm run build:article -- 202603/06_裏賭博場実態記事
```

出力：

```text
202603/06_裏賭博場実態記事/intermediate/article_manifest.json
202603/06_裏賭博場実態記事/intermediate/layout_report.json
202603/06_裏賭博場実態記事/pages/001.png
```

### 号内の記事を一括ビルド

```bash
npm run build:issue-articles -- 202603
```

未生成分だけビルド：

```bash
npm run build:issue-articles -- 202603 --missing-only
```

出力：

```text
exports/202603/article_build_results.json
```

### 記事ページを号全体へ統合

```bash
npm run collect:issue-pages -- 202603
```

出力：

```text
exports/202603/kindle_pages/0001.png
exports/202603/kindle_pages/0002.png
exports/202603/issue_manifest.json
```

### EPUB生成

```bash
npm run build:epub -- 202603
```

出力：

```text
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

### 出力検査

```bash
npm run check:fixed-layout -- 202603
```

検査内容：

- `exports/<issue>/kindle_pages/*.png` が存在するか。
- PNG寸法が `1456x2056` か。
- `0001.png`, `0002.png` ... の連番になっているか。
- `issue_manifest.json` のページ数とPNG数が一致するか。
- EPUB内の画像数、XHTML数、spine数がページ数と一致するか。

## 通常運用コマンド

最初から全部作る場合：

```bash
npm run build:issue-articles -- 202603
npm run collect:issue-pages -- 202603
npm run build:epub -- 202603
npm run check:fixed-layout -- 202603
```

一部の記事だけ直した場合：

```bash
npm run build:article -- 202603/06_裏賭博場実態記事
npm run collect:issue-pages -- 202603
npm run build:epub -- 202603
npm run check:fixed-layout -- 202603
```

未生成分だけ補完する場合：

```bash
npm run build:issue-articles -- 202603 --missing-only
npm run collect:issue-pages -- 202603
npm run build:epub -- 202603
npm run check:fixed-layout -- 202603
```

## 各スクリプトの役割

| スクリプト | 役割 |
|---|---|
| `tools/build_article.mjs` | 1記事だけ固定レイアウトPNGへ書き出す |
| `tools/build_issue_articles.mjs` | 号内の記事フォルダを順に記事単位ビルドする |
| `tools/collect_issue_pages.mjs` | 各記事の `pages/*.png` を全体連番に統合する |
| `tools/build_fixed_layout_epub.py` | `exports/<issue>/kindle_pages` からEPUBを作る |
| `tools/check_fixed_layout_outputs.py` | PNG寸法、連番、manifest、EPUB構造を検査する |

## manifestの考え方

### 記事manifest

各記事フォルダに保存する。

```text
記事フォルダ/intermediate/article_manifest.json
```

主な内容：

```json
{
  "article": "01_新人冒険者カモられ事件",
  "articleDir": "202604/01_新人冒険者カモられ事件",
  "sourceHtml": "202604/01_新人冒険者カモられ事件/fixed_layout.html",
  "width": 1456,
  "height": 2056,
  "fallback": false,
  "pages": [
    {
      "articlePage": 1,
      "file": "pages/001.png",
      "width": 1456,
      "height": 2056
    }
  ]
}
```

### 号manifest

号全体の統合結果として保存する。

```text
exports/<issue>/issue_manifest.json
```

主な内容：

```json
{
  "issue": "202604",
  "pages": [
    {
      "globalPage": 1,
      "article": "00_表紙",
      "articlePage": 1,
      "src": "202604/00_表紙/pages/001.png",
      "dest": "exports/202604/kindle_pages/0001.png"
    }
  ],
  "articles": [
    {
      "article": "00_表紙",
      "startPage": 1,
      "endPage": 1,
      "pageCount": 1
    }
  ]
}
```

目次、総ページ数、記事開始ページは、この `issue_manifest.json` を基準にする。

## 既存方式との関係

既存の全体書き出し方式は残す。

```text
既存方式:
  tools/export_fixed_layout_images.mjs
  exports/fixed_layout_images
  exports/kindle_pages

記事単位方式:
  tools/build_article.mjs
  記事フォルダ/pages
  exports/<issue>/kindle_pages
```

記事単位方式は、既存方式を壊さず追加された新しい経路である。

## 注意点

- 記事内 `pages/001.png` は最終ページ番号ではない。
- 最終ページ番号は `collect_issue_pages.mjs` が振る。
- EPUB生成は `exports/<issue>/kindle_pages` を正とする。
- 記事フォルダ内に最終EPUBを置かない。
- 本文修正は必ず `.md` を直す。
- `.html` や `.png` だけを直して本文修正済み扱いにしない。
