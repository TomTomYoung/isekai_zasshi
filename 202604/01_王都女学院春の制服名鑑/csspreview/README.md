# CSS Preview

このフォルダは、この記事専用の fixed_layout CSS 比較用です。

## 使い方

### まとめて開く

`open_compare.bat` をダブルクリックします。

ブラウザで以下が開きます。

- `preview_a_standard.html`
- `preview_b_magazine.html`
- `preview_c_dense.html`

## 何をしているか

比較用HTMLが `../fixed_layout.html` を読み込み、本文構造を流用します。
その上で、比較用CSSだけを差し替えます。

```text
../fixed_layout.html
  ↓ 本文・画像・ページ構造を読む
base.css
  ↓ 共通CSS
css_a_standard.css / css_b_magazine.css / css_c_dense.css
  ↓ 差分CSS
preview_*.html で見比べる
```

## 採用手順

1. `preview_*.html` を見比べる。
2. 採用するCSS案を決める。
3. `base.css` と採用CSSの内容を見ながら、`../fixed_layout.html` の `<style>` を更新する。
4. 記事フォルダ直下の `preview.bat` を実行する。
5. `../preview/001.png` 以降を確認する。

## 注意

- 本番に使うのは `../fixed_layout.html` です。
- このフォルダ内のHTMLは比較用です。
- EPUB化へ回るのは、採用後の `fixed_layout.html` です。
- 採用後は必ず記事フォルダ直下の `preview.bat` または VSCode の `Preview current article` でPNG確認します。
