# 異世界丸見え実話 202603号 fixed_layout ビルド手順 v0.2

## 目的

この文書は、202603号の fixed_layout 版を **1456×2056px のページPNG** として書き出し、Kindle用素材または固定レイアウトEPUBへまとめるための手順である。

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
tools/export_fixed_layout_images.sh
tools/prepare_kindle_pages.mjs
tools/build_fixed_layout_epub.py
exports/fixed_layout_images/
exports/kindle_pages/
exports/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

---

## 作業順

```text
1. fixed_layout.html / fixed_layout.css の存在を確認する
2. 記事HTML内で .fixed-page が複数生成される前提を確認する
3. PNGを書き出す
4. 出力PNGの数とサイズを確認する
5. 主要記事の見た目を確認する
6. 致命的な崩れだけ直す
7. Kindle用に連番ページ化する
8. 必要なら固定レイアウトEPUBを直接生成する
9. fixed_layout版として一区切りにする
```

---

## 1. fixed_layoutファイルの存在確認

対象は、202603号の23本の記事である。

```bash
find 202603 -path '*/fixed_layout.html' -print
find 202603 -path '*/fixed_layout.css' -print
```

期待：

```text
fixed_layout.html が23本
fixed_layout.css が23本
```

---

## 2. 固定ページ構造

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

## 3. PNGを書き出す

リポジトリ直下で実行する。

```bash
./tools/export_fixed_layout_images.sh
```

Windows環境で `.sh` が使えない場合：

```bash
node tools/export_fixed_layout_images.mjs
```

Playwright が未導入の場合：

```bash
npm install
npx playwright install chromium
```

出力先：

```text
exports/fixed_layout_images/
```

出力ファイル例：

```text
01_聖女泥酔スクープ記事_001.png
01_聖女泥酔スクープ記事_002.png
02_聖騎士不倫_001.png
...
```

---

## 4. 出力PNGの数とサイズを確認する

PNGの枚数は、記事をページ分割するため **23枚固定ではない**。

```bash
find exports/fixed_layout_images -name '*.png' -print
```

PowerShell：

```powershell
(Get-ChildItem exports/fixed_layout_images -Filter *.png).Count
```

期待サイズ：

```text
1456×2056 px
```

確認観点：

- [ ] 横幅が1456pxである
- [ ] 高さが2056pxである
- [ ] 余白が極端に崩れていない
- [ ] `.fixed-page` 全体が画像化されている
- [ ] ファイル名が `記事名_001.png` 形式になっている

---

## 5. 主要記事の見た目確認

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

## 6. 致命的な崩れだけ直す

v0.2で必ず直すもの：

- [ ] PNGが出力できない
- [ ] 記事が真っ白になる
- [ ] 画像が出ない
- [ ] タイトルが読めない
- [ ] 本文がほぼ読めない
- [ ] 紙面外にはみ出して主要情報が消える
- [ ] ページ分割後に大きな本文欠落がある

v0.2では後回しにするもの：

- [ ] 全記事の完全な紙面最適化
- [ ] 細かい禁則処理
- [ ] 全ページのデザイン統一
- [ ] 紙雑誌並みの完成度
- [ ] fixed_layout版とreflow版の完全一致

---

## 7. Kindle用に連番ページ化する

Kindle Create に投入する前に、日本語ファイル名のPNGを半角英数字の連番にコピーする。

```bash
node tools/prepare_kindle_pages.mjs
```

入力：

```text
exports/fixed_layout_images/*.png
```

出力：

```text
exports/kindle_pages/0001.png
exports/kindle_pages/0002.png
...
```

並び順：

```text
記事番号 → 記事内ページ番号
```

---

## 8. 固定レイアウトEPUBを直接生成する

Kindle Createを使わず、連番PNGから固定レイアウトEPUBを生成する場合：

```bash
python tools/build_fixed_layout_epub.py
```

入力：

```text
exports/kindle_pages/*.png
```

出力：

```text
exports/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

このEPUBは、各PNGを1つのXHTMLページに包んで `manifest` と `spine` に並べる。

---

## 9. fixed_layout版として一区切りにする

以下を満たしたら、fixed_layout版として一区切りにする。

- [ ] 23本の記事に `fixed_layout.html` がある
- [ ] 23本の記事に `fixed_layout.css` がある
- [ ] PNGが出力される
- [ ] すべてのPNGが1456×2056pxである
- [ ] 主要記事が紙面として読める
- [ ] 画像が表示される
- [ ] 致命的な本文崩壊がない
- [ ] `exports/kindle_pages` に連番PNGがある
- [ ] 必要なら固定レイアウトEPUBが生成できる

---

## 完了宣言

```text
異世界丸見え実話 202603号 fixed_layout版は、記事単位HTMLを維持しつつ、内部で1456×2056pxページへ分割し、Kindle用連番PNGまたは固定レイアウトEPUBとして準備できる状態に到達した。
```
