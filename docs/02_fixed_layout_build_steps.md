# 異世界雑誌 202603号 fixed_layout ビルド手順 v0.1

## 目的

この文書は、異世界雑誌 202603号の fixed_layout 版をPNGとして書き出し、一区切りの成果物にするための作業手順である。

現在の最優先作業は fixed_layout 版である。

reflow版は fixed_layout 版の次に扱う。

---

## fixed_layout 版の位置づけ

```text
fixed_layout版
= 固定紙面向け。1456×2056px の紙面をPNG画像として書き出す版。
```

1記事につき、原則として以下を持つ。

```text
202603/XX_記事フォルダ/fixed_layout.html
202603/XX_記事フォルダ/fixed_layout.css
```

`fixed_layout.html` は通常記事HTMLを読み込み、`.fixed-page` 内に流し込む。

`fixed_layout.css` は固定紙面の見た目を決める。

---

## 重要ファイル

```text
202603/*/fixed_layout.html
202603/*/fixed_layout.css
tools/export_fixed_layout_images.mjs
tools/export_fixed_layout_images.sh
tools/prepare_kindle_pages.mjs
exports/fixed_layout_images/
exports/kindle_pages/
```

---

## 作業順

```text
1. fixed_layout.html / fixed_layout.css の存在を確認する
2. 書き出しスクリプトを確認する
3. PNGを書き出す
4. 出力PNGの数を確認する
5. PNGサイズを確認する
6. 主要記事の見た目を確認する
7. 致命的な崩れだけ直す
8. Kindle Create用に連番ページ化する
9. fixed_layout版として一区切りにする
```

---

## 1. fixed_layoutファイルの存在確認

対象は、202603号の23本の記事である。

確認対象：

```text
202603/01_聖女泥酔スクープ記事/fixed_layout.html
202603/01_聖女泥酔スクープ記事/fixed_layout.css
...
202603/23_鉄人会幹部襲撃事件/fixed_layout.html
202603/23_鉄人会幹部襲撃事件/fixed_layout.css
```

確認コマンド例：

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

## 2. 書き出しスクリプトを確認する

使用するスクリプト：

```text
tools/export_fixed_layout_images.sh
tools/export_fixed_layout_images.mjs
```

`export_fixed_layout_images.mjs` は、`202603` 配下の `XX_` で始まる記事フォルダを走査し、`fixed_layout.html` が存在する記事だけをPNG出力対象にする。

出力先：

```text
exports/fixed_layout_images/
```

---

## 3. PNGを書き出す

リポジトリ直下で実行する。

```bash
./tools/export_fixed_layout_images.sh
```

Windows環境で `.sh` が使えない場合は、Node側を直接実行する。

```bash
node tools/export_fixed_layout_images.mjs
```

Playwright が未導入の場合は、先に依存関係を入れる。

```bash
npm install
```

必要なら：

```bash
npx playwright install chromium
```

---

## 4. 出力PNGの数を確認する

```bash
find exports/fixed_layout_images -name '*.png' -print
```

PowerShellの場合：

```powershell
(Get-ChildItem exports/fixed_layout_images -Filter *.png).Count
```

期待：

```text
23枚
```

不足がある場合は、該当記事フォルダに `fixed_layout.html` がない、または書き出し途中で止まっている可能性が高い。

---

## 5. PNGサイズを確認する

期待サイズ：

```text
1456×2056 px
```

確認観点：

- [ ] 横幅が1456pxである
- [ ] 高さが2056pxである
- [ ] 余白が極端に崩れていない
- [ ] `.fixed-page` 全体が画像化されている

---

## 6. 主要記事の見た目確認

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
- [ ] 2段組または3段組が破綻していない
- [ ] 下端で重要本文が切れていない

---

## 7. 致命的な崩れだけ直す

v0.1で必ず直すもの：

- [ ] PNGが出力できない
- [ ] 記事が真っ白になる
- [ ] 画像が出ない
- [ ] タイトルが読めない
- [ ] 本文がほぼ読めない
- [ ] 紙面外にはみ出して主要情報が消える

v0.1では後回しにするもの：

- [ ] 全記事の完全な紙面最適化
- [ ] 細かい禁則処理
- [ ] 全ページのデザイン統一
- [ ] 紙雑誌並みの完成度
- [ ] fixed_layout版とreflow版の完全一致

---

## 8. Kindle Create用に連番ページ化する

Kindle Create に投入する前に、日本語ファイル名のPNGを半角英数字の連番にコピーする。

使用スクリプト：

```text
tools/prepare_kindle_pages.mjs
```

実行：

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
exports/kindle_pages/0023.png
```

期待：

```text
Prepared 23 Kindle pages in exports/kindle_pages
```

PowerShellで確認する場合：

```powershell
(Get-ChildItem exports/kindle_pages -Filter *.png).Count
```

期待：

```text
23
```

Kindle Create では `exports/kindle_pages` 内の `0001.png` から `0023.png` を全選択して Comics プロジェクトに読み込む。

---

## 9. fixed_layout版として一区切りにする

以下を満たしたら、fixed_layout版として一区切りにする。

- [ ] 23本の記事に `fixed_layout.html` がある
- [ ] 23本の記事に `fixed_layout.css` がある
- [ ] PNGが23枚出力される
- [ ] PNGが1456×2056pxである
- [ ] 主要記事が紙面として読める
- [ ] 画像が表示される
- [ ] 致命的な本文崩壊がない
- [ ] `exports/kindle_pages` に `0001.png` 〜 `0023.png` がある

---

## 完了宣言

```text
異世界雑誌 202603号 fixed_layout版は、23本の記事を固定紙面PNGとして書き出し、Kindle Createに投入できる連番PNGとして準備できる状態に到達した。
```
