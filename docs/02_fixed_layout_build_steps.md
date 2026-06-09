# 異世界丸見え実話 202603号 fixed_layout ビルド手順 v0.3

## 目的

この文書は、202603号の fixed_layout 版を **1456×2056px のページPNG** として書き出し、号数別の新系統ディレクトリへ集約し、固定レイアウトEPUBへまとめるための手順である。

---

## 正とする出力系統

202603号では、出力先を **号数別ディレクトリ** に統一する。

```text
exports/202603/fixed_layout_images/
exports/202603/kindle_pages/
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

旧系統の以下は、202603号の正規ビルドでは使わない。

```text
exports/fixed_layout_images/
exports/kindle_pages/
exports/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

---

## fixed_layout 版の位置づけ

```text
fixed_layout版
= 固定紙面向け。1ページを 1456×2056px のPNGとして書き出す版。
```

記事HTMLは **記事単位で1本** のまま維持する。

ただし、HTML内部ではJSにより必要枚数の `.fixed-page` を生成する。

```text
1記事HTML
  ├─ .fixed-page 001
  ├─ .fixed-page 002
  └─ .fixed-page 003 ...
```

---

## 重要ファイル

```text
202603/*/fixed_layout.html
202603/*/fixed_layout.css
tools/export_fixed_layout_images.mjs
tools/prepare_kindle_pages.mjs
tools/build_fixed_layout_epub.py
202603/10_選手名鑑記事/build_this_article.mjs
202603/10_選手名鑑記事/reflect_this_article.mjs
package.json
```

---

## 全体ビルド：最初からEPUBまで作る

リポジトリ直下で実行する。

```bash
npm run build:fixed-layout-epub
```

このコマンドは以下を順に実行する。

```text
1. 全記事 fixed_layout.html をPNG化
   -> exports/202603/fixed_layout_images/

2. 記事名付きPNGを連番PNGへ変換
   -> exports/202603/kindle_pages/

3. 連番PNGから固定レイアウトEPUBを生成
   -> exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

---

## 全体ビルドを分けて実行する場合

### 1. fixed_layout画像を書き出す

```bash
npm run export:fixed-layout
```

または：

```bash
node tools/export_fixed_layout_images.mjs 202603
```

出力先：

```text
exports/202603/fixed_layout_images/
```

出力ファイル例：

```text
01_聖女泥酔スクープ記事_001.png
01_聖女泥酔スクープ記事_002.png
02_聖騎士不倫_001.png
...
```

### 2. Kindle用の連番PNGへ変換する

```bash
npm run prepare:kindle-pages
```

または：

```bash
node tools/prepare_kindle_pages.mjs 202603
```

入力：

```text
exports/202603/fixed_layout_images/*.png
```

出力：

```text
exports/202603/kindle_pages/0001.png
exports/202603/kindle_pages/0002.png
...
```

並び順：

```text
記事番号 -> 記事内ページ番号
```

### 3. EPUBを生成する

```bash
npm run build:epub
```

または：

```bash
python tools/build_fixed_layout_epub.py 202603
```

入力：

```text
exports/202603/kindle_pages/*.png
```

出力：

```text
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

`tools/build_fixed_layout_epub.py` は、202603号では `exports/202603/kindle_pages/` を入力元とする。旧 `exports/kindle_pages/` にはフォールバックしない。

---

## 個別記事だけ直してEPUBへ反映する場合

例：選手名鑑記事だけを直した場合。

### 1. 個別ビルド

```bash
node "202603/10_選手名鑑記事/build_this_article.mjs"
```

出力先：

```text
202603/10_選手名鑑記事/build/
```

この段階では、全体出力には反映しない。個別ビルドは個別ビルドとして保持する。

### 2. 個別ビルド結果を新系統へ反映

```bash
node "202603/10_選手名鑑記事/reflect_this_article.mjs"
```

このスクリプトは以下を行う。

```text
1. 202603/10_選手名鑑記事/build/ のPNGを読む
2. exports/202603/fixed_layout_images/ 内の古い 10_選手名鑑記事_*.png を削除
3. 新しい 10_選手名鑑記事_*.png を exports/202603/fixed_layout_images/ にコピー
4. exports/202603/fixed_layout_images/ 全体を記事番号順に並べる
5. exports/202603/kindle_pages/ を再生成する
```

### 3. EPUBだけ作り直す

```bash
npm run build:epub
```

または：

```bash
python tools/build_fixed_layout_epub.py 202603
```

出力先：

```text
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

---

## Playwright が未導入の場合

```bash
npm install
npx playwright install chromium
```

---

## fixed_layoutファイルの存在確認

対象は、202603号の記事フォルダである。

```bash
find 202603 -path '*/fixed_layout.html' -print
find 202603 -path '*/fixed_layout.css' -print
```

Windows PowerShell：

```powershell
Get-ChildItem 202603 -Recurse -Filter fixed_layout.html
Get-ChildItem 202603 -Recurse -Filter fixed_layout.css
```

---

## 固定ページ構造

各記事の `fixed_layout.html` は、通常記事HTMLを読み込み、内容量に応じて `.fixed-page` を生成する。

期待される構造：

```html
<main class="article-pages" id="article-pages"></main>
```

実行後のDOM：

```html
<main class="article-pages">
  <section class="fixed-page">
    <section class="article-sheet">...</section>
  </section>
  <section class="fixed-page">
    <section class="article-sheet">...</section>
  </section>
</main>
```

CSS側では、必ず以下を満たす。

```css
.fixed-page {
  width: 1456px;
  height: 2056px;
  overflow: hidden;
}
```

---

## 出力確認

### fixed_layout_images の確認

```bash
find exports/202603/fixed_layout_images -name '*.png' -print
```

PowerShell：

```powershell
(Get-ChildItem exports/202603/fixed_layout_images -Filter *.png).Count
```

### kindle_pages の確認

```bash
find exports/202603/kindle_pages -name '*.png' -print
```

PowerShell：

```powershell
(Get-ChildItem exports/202603/kindle_pages -Filter *.png).Count
```

### EPUB の確認

```text
exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

期待ページサイズ：

```text
1456×2056 px
```

確認観点：

- [ ] `exports/202603/fixed_layout_images/` に記事名付きPNGがある
- [ ] `exports/202603/kindle_pages/` に `0001.png` 形式の連番PNGがある
- [ ] EPUBが `exports/202603/` 配下に生成される
- [ ] すべてのPNGが 1456×2056px である
- [ ] 主要記事が紙面として読める
- [ ] 画像が表示される
- [ ] 致命的な本文崩壊がない

---

## 主要記事の見た目確認

優先確認対象：

```text
01_聖女泥酔スクープ記事
02_聖騎士不倫
08_女戦士
09_名物ダンジョン記事
10_選手名鑑記事
11_違法アーティファクトカタログ記事
12_武器屋春雨
14_今日の魔術
17_裏社会危険地帯レポート
23_鉄人会幹部襲撃事件
```

確認すること：

- [ ] タイトルが紙面内に収まっている
- [ ] 本文が読める
- [ ] 画像が表示されている
- [ ] キャプションが読める
- [ ] 見出しが潰れていない
- [ ] 段組が破綻していない
- [ ] 下端で重要本文が切れていない
- [ ] ページ送り後に記事内容が継続している

---

## 完了条件

以下を満たしたら、202603号 fixed_layout 版として一区切りにする。

- [ ] 各記事に `fixed_layout.html` がある
- [ ] 各記事に `fixed_layout.css` がある
- [ ] `npm run build:fixed-layout-epub` が完走する
- [ ] `exports/202603/fixed_layout_images/` に記事名付きPNGがある
- [ ] `exports/202603/kindle_pages/` に連番PNGがある
- [ ] `exports/202603/isekai_marumie_jitsuwa_202603_fixed_layout.epub` が生成される
- [ ] すべてのPNGが1456×2056pxである
- [ ] 主要記事が紙面として読める

---

## 完了宣言

```text
異世界丸見え実話 202603号 fixed_layout版は、記事単位HTMLを維持しつつ、内部で1456×2056pxページへ分割し、exports/202603/ 配下の号数別新系統で、Kindle用連番PNGおよび固定レイアウトEPUBとして準備できる状態に到達した。
```
