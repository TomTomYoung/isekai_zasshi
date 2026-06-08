# 記事単位ビルド方式仕様

## 目的

固定レイアウト誌面を、号全体ではなく記事フォルダ単位でビルドできるようにする。

これにより、特定の記事で Playwright 書き出しが固まる、CSS が崩れる、画像参照が壊れる、といった問題を、号全体のビルドを止めずに切り分けられる。

## 基本方針

- 本文正本は各記事フォルダの `.md` とする。
- 記事単位ビルドは、各記事フォルダ内に中間ファイルと記事内PNGを出力する。
- 最終EPUBは、記事フォルダ内のPNGを全体ページ順に集めた `exports/<issue>/kindle_pages` から作る。
- 記事単位のページ番号は仮番号であり、最終ページ番号は統合時に振り直す。

## 記事フォルダ構成

例：

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

## 記事単位ビルド

実行例：

```bash
node tools/build_article.mjs 202603/06_裏賭博場実態記事
```

npm script 経由：

```bash
npm run build:article -- 202603/06_裏賭博場実態記事
```

処理内容：

1. 対象記事フォルダを受け取る。
2. `fixed_layout.html` をPlaywrightで開く。
3. `.fixed-page` を検出する。
4. 各 `.fixed-page` を `pages/001.png`, `pages/002.png` ... として書き出す。
5. `intermediate/article_manifest.json` を作る。
6. `intermediate/layout_report.json` を作る。

`.fixed-page` が見つからない場合は、フォールバック紙面を生成し、ビルドエラーで止まらず原因確認用のPNGを出力する。

## 記事manifest

`intermediate/article_manifest.json` の例：

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

## 号全体への統合

実行例：

```bash
node tools/collect_issue_pages.mjs 202603
```

npm script 経由：

```bash
npm run collect:issue-pages -- 202603
```

処理内容：

1. `202603` などの号ディレクトリを読む。
2. `00_`, `01_`, `02_` のような記事フォルダを名前順に並べる。
3. 各記事フォルダの `intermediate/article_manifest.json` を読む。
4. 各記事の `pages/*.png` を記事順・記事内ページ順に集める。
5. `exports/<issue>/kindle_pages/0001.png` から全体連番でコピーする。
6. `exports/<issue>/issue_manifest.json` を作る。

## EPUB生成

記事単位ビルド経由で作ったページ画像は、そのままEPUB生成に渡せる。

実行例：

```bash
python tools/build_fixed_layout_epub.py 202603
```

npm script 経由：

```bash
npm run build:epub -- 202603
```

`tools/build_fixed_layout_epub.py` は次の順で画像入力を探す。

1. `exports/<issue>/kindle_pages`
2. 後方互換用の `exports/kindle_pages`

出力先は、号別入力がある場合は次の通り。

```text
exports/<issue>/isekai_marumie_jitsuwa_<issue>_fixed_layout.epub
```

したがって、記事単位ビルドから最終EPUBまでの流れは次の形になる。

```bash
npm run build:article -- 202603/00_表紙
npm run build:article -- 202603/01_記事名
npm run build:article -- 202603/02_記事名
npm run collect:issue-pages -- 202603
npm run build:epub -- 202603
```

## 号manifest

`exports/<issue>/issue_manifest.json` の例：

```json
{
  "issue": "202604",
  "width": 1456,
  "height": 2056,
  "generatedFrom": "article-level pages",
  "pages": [
    {
      "globalPage": 1,
      "article": "00_表紙",
      "articleDir": "202604/00_表紙",
      "articlePage": 1,
      "src": "202604/00_表紙/pages/001.png",
      "dest": "exports/202604/kindle_pages/0001.png",
      "width": 1456,
      "height": 2056
    }
  ],
  "articles": [
    {
      "article": "00_表紙",
      "articleDir": "202604/00_表紙",
      "manifest": "202604/00_表紙/intermediate/article_manifest.json",
      "startPage": 1,
      "pageCount": 1,
      "endPage": 1
    }
  ]
}
```

## 既存方式との関係

既存の `tools/export_fixed_layout_images.mjs` は残す。

既存方式：

```text
202603 の全記事 fixed_layout.html
↓
exports/fixed_layout_images/*.png
```

記事単位方式：

```text
各記事 fixed_layout.html
↓
各記事 pages/*.png
↓
exports/<issue>/kindle_pages/*.png
↓
exports/<issue>/isekai_marumie_jitsuwa_<issue>_fixed_layout.epub
```

記事単位方式は、既存方式を置き換える前の安全な追加レイヤーとして扱う。

## 注意点

- 記事単位の `pages/001.png` は最終ページ番号ではない。
- 目次・総ページ数・EPUBのspine順は統合後の `issue_manifest.json` を基準にする。
- 記事フォルダ内に最終EPUBを置かない。
- 最終成果物は `exports/<issue>` 以下に集約する。
