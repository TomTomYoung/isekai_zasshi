# 固定レイアウト計測・閾値仕様

この文書は、`isekai_zasshi` の固定レイアウト版ビルドにおいて、何を計測し、どの閾値で warning / error を出すかを明文化する。

対象工程は以下。

```text
1. sync_fixed_layout_sources.mjs
2. check_fixed_layout_sources.mjs
3. validate_fixed_layout_geometry.mjs
4. export_fixed_layout_images.mjs
5. prepare_kindle_pages.mjs
6. build_fixed_layout_epub.py
7. check_fixed_layout_outputs.py
```

---

## 1. 固定ページ基準値

全工程で、固定レイアウトページの基準は以下とする。

```text
PAGE_W = 1456px
PAGE_H = 2056px
```

検証スクリプト上の定数：

```js
const PAGE_W = 1456;
const PAGE_H = 2056;
const EPS = 1;
const BLEED = 24;
const ARTICLE_TIMEOUT_MS = 18000;
```

意味：

| 項目 | 値 | 用途 |
|---|---:|---|
| `PAGE_W` | `1456` | `.fixed-page` および出力PNGの期待幅 |
| `PAGE_H` | `2056` | `.fixed-page` および出力PNGの期待高さ |
| `EPS` | `1` | `.fixed-page` 寸法判定の許容誤差 |
| `BLEED` | `24` | 要素のページ外はみ出し許容幅 |
| `ARTICLE_TIMEOUT_MS` | `18000` | 記事1件あたりの幾何検証タイムアウト |

---

## 2. ソース同期仕様

### 対象スクリプト

```text
tools/sync_fixed_layout_sources.mjs
```

### 目的

`01_聖女泥酔スクープ記事/fixed_layout.html` と `fixed_layout.css` をテンプレートとして、`01`〜`23` の記事フォルダへ同期する。

`00_表紙` は同期対象外。

### 同期対象

```text
202603/XX_記事名/fixed_layout.html
202603/XX_記事名/fixed_layout.css
```

### テンプレートHTML必須トークン

同期前に、テンプレートHTMLに以下が含まれていることを確認する。

```text
ATOMIC_SELECTOR
PAGE_BUDGET
function collectAtomicBlocks(
function blockWeight(
```

どれかが欠ける場合、テンプレートが古いとみなし同期を停止する。

### 禁止トークン

```text
scrollHeight
clientHeight
```

これらがHTMLに含まれる場合、DOM追加ごとのレイアウト計測分割が復活しているためエラーとする。

### CSS禁止トークン

```text
column-count
```

これがCSSに含まれる場合、固定高さを超えた本文が横方向の第3列・第4列へ流れるためエラーとする。

---

## 3. ソース版数検査仕様

### 対象スクリプト

```text
tools/check_fixed_layout_sources.mjs
```

### 対象

`202603` 以下の `NN_` で始まる記事フォルダ。

ただし、`00_表紙` は記事本文テンプレートではないため、検査対象外。

### error 条件

各記事について以下を検査する。

| 条件 | error 内容 |
|---|---|
| `fixed_layout.html` がない | `missing fixed_layout.html` |
| `fixed_layout.css` がない | `missing fixed_layout.css` |
| HTMLに `ATOMIC_SELECTOR` がない | 旧HTML |
| HTMLに `PAGE_BUDGET` がない | 旧HTML |
| HTMLに `function collectAtomicBlocks(` がない | 旧HTML |
| HTMLに `function blockWeight(` がない | 旧HTML |
| HTMLに `scrollHeight` または `clientHeight` がある | レイアウト計測型分割の復活 |
| CSSに `column-count` がある | 段組横流れの復活 |

### warning 条件

| 条件 | warning 内容 |
|---|---|
| CSSに `column-gap` がある | 旧段組CSSの残骸の可能性 |
| CSSに `column-rule` がある | 旧段組CSSの残骸の可能性 |

---

## 4. HTML内ページ分割仕様

### 対象

各記事の `fixed_layout.html` 内スクリプト。

### 原則

本文HTMLをブラウザ上で高さ計測しながら分割しない。

禁止：

```text
DOMへ1要素追加
↓
scrollHeight / clientHeight / getBoundingClientRect を読む
↓
入らなければ戻す
```

この方式は、巨大表・画像・段組でChromiumが固まるため使わない。

### 原子ブロック抽出

本文から以下の要素だけを原子ブロックとして抽出する。

```js
const ATOMIC_SELECTOR = 'h1,h2,h3,h4,p,figure,table,ul,ol,blockquote';
```

親の巨大 `div`、`section`、独自クラスラッパーはページに入れない。

### ページ予算

```js
const PAGE_BUDGET = 16;
```

各ブロックに重みを付け、1ページあたりの合計重みが `PAGE_BUDGET` を超えそうなら次ページを作る。

### ブロック重み

| ブロック | 重み |
|---|---:|
| `h1` | `5` |
| `h2` | `4` |
| `h3`, `h4` | `3` |
| `figure` | `10` |
| `table` | `max(8, ceil(tr数 / 2))` |
| `ul`, `ol` | `max(3, ceil(li数 / 2))` |
| `blockquote` | `max(3, ceil(文字数 / 80))` |
| その他本文 | `max(1, ceil(文字数 / 85))` |

### 強制改ページ条件

| 条件 | 挙動 |
|---|---|
| ブロックが `h2` | 新ページ開始 |
| ブロックが `figure` または `table` かつ使用済み重み `>= 4` | 新ページ開始 |
| `使用済み重み + 現ブロック重み > PAGE_BUDGET` | 新ページ開始 |

---

## 5. HTML幾何検証仕様

### 対象スクリプト

```text
tools/validate_fixed_layout_geometry.mjs
```

### 実行環境

Playwright Chromiumで各 `fixed_layout.html` を開き、DOM上の矩形を計測する。

記事ごとに別Chromiumを起動する。

```text
viewport = 1456 x 2056
deviceScaleFactor = 1
```

読み込み設定：

| 項目 | 値 |
|---|---|
| `page.goto` timeout | `8000ms` |
| `waitForTimeout` | `500ms` |
| `document.fonts.ready` 待ち | 最大 `300ms` |
| 記事全体 timeout | `18000ms` |
| `font` / `media` | 読み込み遮断 |
| 画像 | 読み込み対象 |

### 検査対象要素

```js
const CHECK_SELECTOR = 'h1,h2,h3,p,figure,img,table,blockquote,.article-sheet,.lead,.note-box,.warning-box,.summary-box,.push-point,.column-box,.danger-box';
```

各要素について `getBoundingClientRect()` を取得する。

### `.fixed-page` 存在検査

```text
.fixed-page が0件 → error: missing-fixed-page
```

### `.fixed-page` サイズ検査

各 `.fixed-page` の矩形を計測する。

```text
abs(width  - 1456) > 1 → error: wrong-page-size
abs(height - 2056) > 1 → error: wrong-page-size
```

### ページ外はみ出し検査

各検査対象要素の矩形を `.fixed-page` の矩形と比較する。

横方向：

```text
element.left  < page.left  - 24 → error: overflow-x
element.right > page.right + 24 → error: overflow-x
```

縦方向：

```text
element.top    < page.top    - 24 → error: overflow-y
element.bottom > page.bottom + 24 → error: overflow-y
```

つまり、24px以内の装飾的なにじみは許容し、24pxを超えるページ外流出をエラーにする。

### `.article-sheet` 検査

通常記事では必須。

```text
.article-sheet がない → error: missing-article-sheet
```

ただし `00_表紙` は全面表紙ページなので、`.article-sheet` 必須検査をしない。

### fallbackページ検査

`.fixed-page` のテキストに以下を含む場合、生成エラーページが混入しているとみなす。

```text
固定レイアウト生成エラー
固定レイアウト読込エラー
```

判定：

```text
含む → error: fallback-page
```

### 空に近いページ検査

通常記事で、ページ内テキストが50文字未満の場合に warning とする。

```text
textContent.trim().length < 50 → warn: near-empty-page
```

ただし `00_表紙` は対象外。

### 巨大要素検査

通常記事で、以下の要素が使用可能高さの95%を超えた場合 warning とする。

```text
table
figure
img
```

判定：

```text
element.height > usableHeight * 0.95 → warn: oversized-element
```

`usableHeight` は `.article-sheet` があればその高さ、なければ `.fixed-page` の高さ。

`00_表紙` は対象外。

### 分割要素検査

以下の要素で `getClientRects().length > 1` の場合、段・断片に分割されている可能性があるため warning とする。

```text
table
figure
.note-box
.warning-box
```

判定：

```text
getClientRects().length > 1 → warn: split-element
```

### 失敗時の終了条件

error が1件以上あれば `process.exit(1)`。

warning だけなら終了コード0。

---

## 6. PNG書き出し仕様

### 対象スクリプト

```text
tools/export_fixed_layout_images.mjs
```

### 出力先

```text
exports/fixed_layout_images
```

### 出力前処理

書き出し前に出力ディレクトリを完全削除し、作り直す。

目的：

- 古い巨大PNGの混入防止
- `_001` なし旧ファイルの混入防止
- Kindle連番化時の誤採用防止

### 出力対象

各 `fixed_layout.html` 内の `.fixed-page`。

```text
1 .fixed-page = 1 PNG
```

### 出力サイズ

Playwright viewport：

```text
1456 x 2056
deviceScaleFactor = 1
```

`.fixed-page` が検証どおりなら、PNGも `1456x2056` になる。

### ファイル名

常に以下形式。

```text
NN_記事名_001.png
NN_記事名_002.png
...
```

1ページしかない記事でも `_001` を付ける。

禁止：

```text
NN_記事名.png
```

### 記事単位タイムアウト

```text
TARGET_TIMEOUT_MS = 25000ms
```

### ページ処理タイムアウト

| 処理 | timeout |
|---|---:|
| `page.goto` | `10000ms` |
| `page.goto` 外側 timeout | `12000ms` |
| `.fixed-page` count | `3000ms` |
| fixed page collect | `5000ms` |
| assets wait | `5000ms` |
| screenshot | `12000ms` |
| screenshot 外側 timeout | `15000ms` |

### fallback

`.fixed-page` が生成されない場合、`1456x2056` のfallback紙面を生成してPNG化する。

ただし、通常は事前の `validate_fixed_layout_geometry.mjs` で `fallback-page` がerrorになるため、最終成果物に混入させない。

---

## 7. Kindle連番化仕様

### 対象スクリプト

```text
tools/prepare_kindle_pages.mjs
```

### 入力

```text
exports/fixed_layout_images
```

### 出力

```text
exports/kindle_pages
```

### 入力ファイル採用条件

以下の正規表現に一致するPNGだけを採用する。

```js
/^\d{2}_.+_\d{3}\.png$/i
```

採用例：

```text
01_聖女泥酔スクープ記事_001.png
```

不採用例：

```text
01_聖女泥酔スクープ記事.png
```

不採用ファイルは `ignored stale/non-page PNG` として警告ログに出す。

### 並び順

ファイル名から以下を取り出してソートする。

```text
article = 先頭2桁
page    = 末尾3桁
```

比較順：

```text
article 昇順
page 昇順
同値ならファイル名 localeCompare('ja')
```

### 出力ファイル名

```text
0001.png
0002.png
0003.png
...
```

`exports/kindle_pages` は出力前に空にする。

---

## 8. EPUB生成仕様

### 対象スクリプト

```text
tools/build_fixed_layout_epub.py
```

### 入力

```text
exports/kindle_pages/*.png
```

### 出力

```text
exports/isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

### ページサイズ

```text
1456 x 2056
```

`kindle_pages` のPNGを1枚1ページとして、固定レイアウトEPUBを生成する。

---

## 9. 最終成果物検査仕様

### 対象スクリプト

```text
tools/check_fixed_layout_outputs.py
```

### PNG寸法検査

以下2ディレクトリ内の全PNGについて、PNGヘッダ `IHDR` から幅・高さを読む。

```text
exports/fixed_layout_images
exports/kindle_pages
```

期待値：

```text
width  = 1456
height = 2056
```

判定：

```text
(width, height) != (1456, 2056) → error
```

### fixed_layout_images ファイル名検査

```python
r'^\d{2}_.+_\d{3}\.png$'
```

一致しない場合：

```text
fixed_layout_images: unexpected name
```

### kindle_pages 連番検査

`exports/kindle_pages` のPNGが、1から始まる4桁連番になっているか検査する。

```text
0001.png
0002.png
0003.png
...
```

欠番・飛び・別名があれば error。

### ページ数一致検査

```text
fixed_layout_images のPNG数 == kindle_pages のPNG数
```

一致しなければ error。

### EPUB構造検査

EPUBについて以下を確認する。

| 項目 | 条件 |
|---|---|
| EPUB存在 | `exports/isekai_marumie_jitsuwa_202603_fixed_layout.epub` がある |
| ZIP先頭 | 最初のエントリが `mimetype` |
| OPF | `OEBPS/content.opf` がある |
| manifest | 存在する |
| spine | 存在する |
| PNG image item数 | Kindleページ数と一致 |
| `pages/page_` XHTML item数 | Kindleページ数と一致 |
| spine item数 | Kindleページ数と一致 |

### 終了条件

error が1件以上あれば `sys.exit(1)`。

error がなければ以下を出す。

```text
fixed layout output check: OK
fixed_layout_images: N PNG files
kindle_pages: N PNG files
epub: exports\isekai_marumie_jitsuwa_202603_fixed_layout.epub
```

---

## 10. 現在通っている最終状態

直近の成功ログでは以下。

```text
layout validation: 0 errors, 21 warnings
fixed_layout_images: 184 PNG files
kindle_pages: 184 PNG files
epub: exports\isekai_marumie_jitsuwa_202603_fixed_layout.epub
fixed layout build complete.
```

この状態は、以下を満たしている。

```text
- HTML幾何検証 error 0
- PNG出力 184枚
- Kindle連番PNG 184枚
- 全PNG 1456x2056
- EPUB manifest / spine / page数 整合
```

warning の `near-empty-page` は、画像・表・見出し主体のページでも出る軽警告であり、ビルド停止条件ではない。
