# CSS Preview

このフォルダは、`01_王都女学院春の制服名鑑` 専用の fixed_layout CSS 比較用です。

## ここに置くもの

```text
csspreview/
  base.css                 共通CSS
  css_a_standard.css        A案: 現行寄り
  css_b_magazine.css        B案: 雑誌感強め
  css_c_dense.css           C案: 高密度
  preview_a_standard.html   A案を当てた中身入りサンプルHTML
  preview_b_magazine.html   B案を当てた中身入りサンプルHTML
  preview_c_dense.html      C案を当てた中身入りサンプルHTML
```

## 重要

比較HTMLは、`../fixed_layout.html` を読み込む動的ローダーではありません。

`preview_a_standard.html`、`preview_b_magazine.html`、`preview_c_dense.html` は、それぞれ中に実際のサンプル本文と `.fixed-page` 構造を持つ静的HTMLです。

つまり、別の記事で同じ形式を追加するときは、次のようにファイルを増やします。

```text
その記事フォルダ/
  csspreview/
    base.css
    css_a_standard.css
    css_b_magazine.css
    css_c_dense.css
    preview_a_standard.html
    preview_b_magazine.html
    preview_c_dense.html
```

## 見比べ方

ローカルサーバーやVSCode Live Serverなど、普段使っている方法で以下を開きます。

```text
csspreview/preview_a_standard.html
csspreview/preview_b_magazine.html
csspreview/preview_c_dense.html
```

`open_compare.bat` は、どのHTMLを開けばよいか表示するだけです。サーバーは起動しません。

## 採用手順

1. `preview_*.html` を見比べる。
2. 採用するCSS案を決める。
3. `base.css` と採用CSSの内容を見ながら、`../fixed_layout.html` の `<style>` を更新する。
4. 記事フォルダ直下の `preview.bat` を実行する。
5. `../preview/001.png` 以降を確認する。

## 注意

- 本番に使うのは `../fixed_layout.html` です。
- このフォルダ内のHTMLは比較用サンプルです。
- EPUB化へ回るのは、採用後の `fixed_layout.html` です。
- 採用後は必ず記事フォルダ直下の `preview.bat` または VSCode の `Preview current article` でPNG確認します。
