# AI向け fixed_layout 修正指示

## 目的

`exports/layout_report.json` を読み、`1456×2056px` 固定ページを基準に、記事HTML/CSSのレイアウト破綻を修正する。

この作業では、見た目の好みではなく、まず **幾何的に破綻している箇所** を直す。

---

## 前提

固定ページサイズは必ず以下とする。

```text
PAGE_W = 1456
PAGE_H = 2056
```

対象は各記事フォルダの以下ファイル。

```text
202603/XX_記事名/fixed_layout.html
202603/XX_記事名/fixed_layout.css
```

検証スクリプト：

```bash
node tools/validate_fixed_layout_geometry.mjs
```

検証結果：

```text
exports/layout_report.json
```

---

## 最優先で守ること

1. `scrollHeight` / `clientHeight` / `getBoundingClientRect()` を使って、ページ本文を1要素ずつ追加しながら自動分割しない。
2. ブラウザ上でDOM追加と高さ計測を繰り返すページ分割は禁止。
3. 重い `table` や `figure` を含む記事で Chromium が固まるため、計測ループでの自動分割を復活させない。
4. Python/Pillow/SVGで代替画像を作らない。
5. 出力画像サイズは必ず `1456×2056px` にそろえる。
6. エラーを隠すためのfallbackだけで済ませない。原因となるHTML/CSSを直す。

---

## 修正の基本方針

### 1. `wrong-page-size`

`.fixed-page` の幅または高さが `1456×2056` でない。

修正：

```css
.fixed-page {
  width: 1456px;
  height: 2056px;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}
```

`min-height` ではなく `height` を使う。

---

### 2. `missing-fixed-page`

`.fixed-page` が生成されていない。

原因候補：

- `fixed_layout.html` 内JSが途中で落ちている
- 元記事HTMLのファイル名が `folderName.replace(/^\d+_/, '') + '.html'` と一致していない
- fetch失敗時にページを作る前に停止している

修正：

- `makePage(0)` をfetchより前に呼ぶ
- fetch失敗時も `.fixed-page` 内にエラー内容を出す
- ただし、それを最終成果物として放置しない

---

### 3. `fallback-page`

生成エラー紙面が出ている。

修正：

- 元記事HTMLの名前を確認する
- `fixed_layout.html` の `source` 算出が正しいか確認する
- 元記事内の壊れたHTML、巨大table、画像パスを確認する
- fallbackを消すのではなく、fallbackが発生しない原因修正を行う

---

### 4. `overflow-y`

要素がページ下にはみ出している。

修正候補：

- 該当要素の前で明示的にページを分ける
- `h2` 単位で `.fixed-page` を分ける
- 巨大な `table` を複数の小さいtableに分割する
- `figure img` に `max-height` を指定する
- `font-size` / `line-height` / `padding` を少し下げる

禁止：

- `overflow: visible` でごまかす
- PNG書き出し側で無理に切る
- 重要本文を隠す

---

### 5. `overflow-x`

要素が左右にはみ出している。

修正候補：

```css
img,
table {
  max-width: 100%;
  box-sizing: border-box;
}
```

`table` の場合：

```css
table {
  width: 100%;
  table-layout: fixed;
}

th,
td {
  word-break: break-word;
}
```

---

### 6. `oversized-element`

`table` / `figure` / `img` がページ本文領域に対して大きすぎる。

修正候補：

- 画像を縮小する
- 表を分割する
- 表の文字サイズを下げる
- キャプションを短くする
- 該当要素を単独ページにする

---

### 7. `split-element`

`figure` や `table` が段組で分割されている。

修正：

```css
figure,
table,
.note-box,
.warning-box {
  break-inside: avoid;
}
```

それでも割れる場合は、該当要素をページ先頭へ移すか単独ページにする。

---

### 8. `near-empty-page`

ページ内テキストが極端に少ない。

修正候補：

- 改ページ条件が細かすぎる
- `h2` だけでページが作られている
- fallbackだけが残っている
- 表や画像しかないページなら問題ない場合もあるが、目視確認する

---

## AIへの作業指示テンプレート

以下をAIに渡す。

```text
以下のリポジトリで fixed_layout の幾何検証結果をもとに修正してください。

前提：
- 最終出力ページは 1456×2056px 固定
- 対象は 202603/*/fixed_layout.html と fixed_layout.css
- exports/layout_report.json の error を優先して直す
- scrollHeight/clientHeight/getBoundingClientRect を使ったDOM追加ごとの自動ページ分割は復活させない
- まず wrong-page-size, missing-fixed-page, fallback-page, overflow-y, overflow-x を直す
- table/figure/img が巨大な場合は、CSS縮小またはHTML側で明示的にページ分割する
- 修正後に node tools/validate_fixed_layout_geometry.mjs を再実行し、error が0になることを確認する
- PNG書き出しは検証が通ってから行う

やること：
1. exports/layout_report.json を読む
2. error のある記事名、ページ番号、selector、type を列挙する
3. 各 error の直接原因を述べる
4. fixed_layout.html / fixed_layout.css を最小修正する
5. 検証を再実行する
6. error が残る場合は再修正する
```

---

## 成功条件

```bash
node tools/validate_fixed_layout_geometry.mjs
```

で、最低限：

```text
layout validation: 0 errors
```

になること。

警告は残ってもよいが、`fallback-page`, `missing-fixed-page`, `wrong-page-size`, `overflow-y`, `overflow-x` は原則0にする。
