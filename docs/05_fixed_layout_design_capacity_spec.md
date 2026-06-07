# 固定レイアウト誌面デザイン容量仕様

この文書は、`1456×2056px` の最終出力画像1枚を1ページとする前提で、各CSSデザイン要素がどれくらいの高さを占有する想定か、画像サイズと文章量をどの程度に収めるべきか、どのスクリプトが切り分けるかを明文化する。

---

## 1. 最終ページ寸法と実効領域

最終出力画像は以下で固定する。

```text
PAGE_W = 1456px
PAGE_H = 2056px
```

記事ページのCSS基準は以下。

```css
.fixed-page {
  width: 1456px;
  height: 2056px;
  padding: 76px 58px 62px;
  border-left: 12px solid #111;
  border-right: 12px solid #111;
  overflow: hidden;
}

.article-sheet {
  height: 100%;
  padding-top: 18px;
  font-size: 27px;
  line-height: 1.42;
  overflow: hidden;
}
```

概算の実効高さ：

```text
固定ページ高              2056px
上padding                  -76px
下padding                  -62px
article-sheet padding-top  -18px
安全余白                  -28px
--------------------------------
実使用可能高             約1872px
```

実装上は、実際の `.article-sheet` をブラウザで測り、そこから安全余白を引く。

```js
capacity = articleSheet.getBoundingClientRect().height - MEASURE_SAFETY_PX
MEASURE_SAFETY_PX = 28
```

したがって、1ページに配置する全パッケージの合計外形高は、原則として `capacity` 以下でなければならない。

---

## 2. 基本方針

### 禁止する考え方

以下は禁止する。

```text
見出しだけで1ページ
画像だけで1ページ
本文だけが後続ページへ孤立
figure/table を見た瞬間に無条件で改ページ
h2 を見た瞬間に無条件で改ページ
```

### 採用する考え方

記事本文は、単体要素ではなく **誌面パッケージ** として扱う。

基本単位：

```text
見出し + 画像 + 関連本文
見出し + 本文
画像 + キャプション + 関連本文
表 + 説明本文
本文連続ブロック
```

各パッケージを実CSSで一度描画し、外形高を測り、1ページの残り高さに収まるかで配置する。

---

## 3. 計測方法

担当：

```text
202603/01_聖女泥酔スクープ記事/fixed_layout.html 内スクリプト
```

`sync_fixed_layout_sources.mjs` により、このテンプレートが `01`〜`23` の記事へ同期される。

実測手順：

```text
1. 元記事HTMLから h1,h2,h3,h4,p,figure,table,ul,ol,blockquote を抽出
2. h2 から次の h2 直前までを基本パッケージ化
3. パッケージ単位で見出し・画像・本文を保持
4. 画面外の measurement-page に一度配置
5. getBoundingClientRect().height + marginTop + marginBottom を取得
6. capacity を超えなければ同一ページへ配置
7. capacity を超える大パッケージだけ内部分割
```

外形高の定義：

```js
outerHeight = getBoundingClientRect().height + marginTop + marginBottom
```

画像は `load` / `error` を待ってから測る。待機上限は `1500ms`。

---

## 4. CSSデザインごとの想定占有量

以下は現行CSSに対する概算である。実際の切り分けはブラウザ実測値を優先する。

### 4.1 ページヘッダー装飾

対象：

```css
.fixed-page:before
.fixed-page:after
.gossip-slug
```

想定占有：

```text
固定ページ上部装飾       約60〜90px
.gossip-slug              約40〜60px
```

注意：

- `.fixed-page:before` / `:after` は絶対配置なので、本文フローの高さには直接入らない。
- `.gossip-slug` は本文フローに入るため、1ページ目の使用高に加算される。

1ページ目の実効本文容量は、2ページ目以降より `.gossip-slug` 分だけ少ない。

---

### 4.2 大見出しパッケージ

対象：

```css
h1
.content-package-headline
```

想定占有：

```text
h1 単体        約75〜120px
headline単位   約90〜150px
```

向いている構成：

```text
h1 + 導入本文 2〜4段落
h1 + 小さめ画像1枚 + 導入本文1〜2段落
```

避ける構成：

```text
h1だけのページ
h1 + 巨大画像 + 長文本文
```

目安：

```text
h1 + 画像ありの場合、画像高は 520〜620px 程度が望ましい。
h1 + 本文のみの場合、本文は 900〜1200字程度まで同居可能。
```

---

### 4.3 セクション見出しパッケージ

対象：

```css
h2
.content-package-section
.content-package-section-continued
```

想定占有：

```text
h2 単体                約60〜85px
h2 + 本文2段落          約220〜360px
h2 + 本文4段落          約430〜700px
```

向いている構成：

```text
h2 + 本文2〜5段落
h2 + figure + 本文1〜3段落
h2 + table + 説明1〜2段落
```

避ける構成：

```text
h2だけでページ末尾へ残す
h2と本文を別ページに分離する
h2と直後の画像だけを分離する
```

切り分け方針：

```text
h2 は次の h2 までのまとまりの先頭とする。
h2 自体で無条件改ページしない。
ただし h2 を含むパッケージ全体が capacity を超える場合だけ内部分割する。
```

---

### 4.4 画像＋本文パッケージ

対象：

```css
figure
.hero-photo
figure img
figcaption
.content-package-section
```

現行CSS：

```css
img, figure img, .photo-block img {
  max-height: 760px;
}
```

想定占有：

```text
画像のみ最大級        約780〜840px
画像 + caption        約820〜900px
画像 + caption + 本文1段落 約950〜1120px
画像 + caption + 本文3段落 約1250〜1600px
```

1ページに具合が良い構成：

```text
h2 約70px
画像 520〜680px
caption 約30〜50px
本文 2〜4段落 / 500〜900字程度
```

この場合の概算：

```text
見出し          70px
画像           600px
caption         40px
本文3段落       450〜700px
余白            80〜140px
----------------------
合計          1240〜1550px
```

`capacity 約1872px` に対して、残り `300〜600px` 程度の余裕がある。

避ける構成：

```text
画像 max-height 760px + 本文1000字超 + h2
画像2枚 + 長文本文
画像だけの独立ページ
本文だけが次ページへ送られる構成
```

推奨画像サイズ：

```text
横幅: ページ本文幅いっぱい、CSS上は width: 100%
高さ: 520〜680px が標準
最大: 760px
画像が本文と同居する前提なら 620px 前後を推奨
```

画像が高すぎると、本文が同一ページに残らず、画像だけのページになりやすい。

---

### 4.5 表＋説明パッケージ

対象：

```css
table
th
td
.content-package-section
```

現行CSS：

```css
table {
  width: 100%;
  table-layout: fixed;
  font-size: 20px;
}

th, td {
  border: 3px solid #111;
  padding: 6px 8px;
}
```

想定占有：

```text
小表 3〜5行         約180〜360px
中表 6〜10行        約360〜750px
大表 11行以上       約750px以上
```

1ページに具合が良い構成：

```text
h2 + 説明1段落 + 中表 + 補足1段落
```

目安：

```text
表は 8行以内が扱いやすい。
10行を超える表は、表だけでページの半分以上を消費する。
15行以上は分割候補。
```

避ける構成：

```text
巨大表 + 長文本文
表だけのページ
表と見出しが別ページ
表の説明文だけが前後ページに分離
```

---

### 4.6 本文連続パッケージ

対象：

```css
p
ul
ol
blockquote
.content-package-section-continued
```

現行CSS：

```css
.article-sheet {
  font-size: 27px;
  line-height: 1.42;
}

p {
  margin: 0 0 .62em;
}
```

本文1行の概算：

```text
27px * 1.42 = 約38px
```

段落下余白：

```text
27px * 0.62 = 約17px
```

本文量目安：

```text
500字        約300〜450px
1000字       約650〜900px
1500字       約1000〜1350px
2000字       約1350〜1800px
```

1ページに具合が良い本文量：

```text
見出しなし本文ページ: 1200〜1800字程度
見出しあり本文ページ: 900〜1500字程度
画像あり本文ページ: 500〜900字程度
表あり本文ページ: 300〜700字程度
```

避ける構成：

```text
100〜200字だけの本文ページ
本文だけが前後の見出しや画像から切り離されるページ
```

---

### 4.7 ボックス系デザイン

対象：

```css
blockquote
.note-box
.warning-box
.summary-box
.push-point
.danger-box
```

想定占有：

```text
短いボックス        約120〜220px
中程度ボックス      約250〜450px
長いボックス        約500px以上
```

注意：

- 枠線、padding、box-shadow があるため、通常本文より高さを食う。
- 画像や表と同一ページに入れる場合、本文量を減らす。

向いている構成：

```text
h2 + 本文1〜2段落 + warning-box
画像 + caption + 短い note-box
```

避ける構成：

```text
巨大ボックス単独ページ
ボックスだけが見出しから離れる配置
```

---

## 5. ページあたりの推奨構成

### A. 標準記事ページ

```text
h2
本文 3〜5段落
小見出し h3 0〜1個
```

想定占有：

```text
900〜1500px
```

余裕：

```text
300〜900px
```

用途：本文中心のページ。

---

### B. 画像入りスクープページ

```text
h2
figure 1枚
caption
本文 2〜4段落
```

推奨画像高：

```text
520〜680px
```

想定占有：

```text
1200〜1650px
```

余裕：

```text
200〜650px
```

用途：雑誌らしいメイン紙面。

---

### C. 大画像ページ

```text
h2
figure 1枚
caption
本文 1〜2段落
```

画像高：

```text
680〜760px
```

想定占有：

```text
1450〜1800px
```

余裕：

```text
70〜420px
```

注意：本文を多く入れない。画像主体ページとして扱う。

---

### D. 表入りページ

```text
h2
説明本文 1段落
table 5〜8行
補足本文 1段落
```

想定占有：

```text
1000〜1550px
```

余裕：

```text
300〜800px
```

注意：10行超の表は分割候補。

---

### E. 本文密度ページ

```text
h2 または h3
本文 900〜1500字
```

想定占有：

```text
1200〜1800px
```

余裕：

```text
70〜600px
```

用途：画像なしの読み物ページ。

---

## 6. 切り分け担当スクリプト

### 6.1 記事内の誌面パッケージ化

担当：

```text
202603/01_聖女泥酔スクープ記事/fixed_layout.html 内スクリプト
```

同期：

```text
tools/sync_fixed_layout_sources.mjs
```

内容：

```text
- 元記事HTMLから原子要素を抽出
- h2 から次の h2 直前までを基本パッケージ化
- 見出し・画像・本文を同一パッケージとして保持
- 大きすぎるパッケージだけ内部分割
- パッケージを実測してページへ配置
```

### 6.2 テンプレート同期

担当：

```text
tools/sync_fixed_layout_sources.mjs
```

内容：

```text
- 01記事の fixed_layout.html/css をテンプレートにする
- 01〜23の記事へ同期する
- 00_表紙は除外
```

### 6.3 ソース版数検査

担当：

```text
tools/check_fixed_layout_sources.mjs
```

内容：

```text
- fixed_layout.html が実測パッケージ版であるか確認
- MEASURE_SAFETY_PX / measureUnits / paginateMeasuredUnits 等を確認
- scrollHeight / clientHeight / column-count の復活を検出
```

### 6.4 幾何検証

担当：

```text
tools/validate_fixed_layout_geometry.mjs
```

内容：

```text
- .fixed-page が 1456×2056 か検査
- 各要素がページ外へ overflow していないか検査
- fallback-page を検出
- near-empty-page を warning として検出
```

### 6.5 PNG出力

担当：

```text
tools/export_fixed_layout_images.mjs
```

内容：

```text
- fixed_layout.html を Playwright で開く
- .fixed-page ごとに PNG 化
- 出力先 exports/fixed_layout_images を事前に空にする
```

### 6.6 Kindle連番化

担当：

```text
tools/prepare_kindle_pages.mjs
```

内容：

```text
- NN_記事名_001.png 形式のみ採用
- kindle_pages/0001.png から連番化
```

### 6.7 最終成果物検査

担当：

```text
tools/check_fixed_layout_outputs.py
```

内容：

```text
- 全PNGが 1456×2056 か検査
- fixed_layout_images と kindle_pages の枚数一致を検査
- EPUB manifest / spine / image item 数を検査
```

---

## 7. 今後の確認項目

単に `overflow` がないだけでは不十分。

以下を確認する必要がある。

```text
- h2 だけのページがないか
- figure だけのページがないか
- 本文だけが前後の画像・見出しから分離していないか
- 画像入りページで本文が最低1〜2段落同居しているか
- 表ページで説明文が前後に分離していないか
- near-empty-page が本当に許容できるページか
```

この確認は、`window.__fixedLayoutMetrics` に記録された `stats` を使って機械検査へ拡張できる。

最低限、将来的には以下を warning / error 化する。

```text
hasHeading=false かつ hasMedia=false かつ paragraphCount <= 1
hasHeading=true かつ paragraphCount=0 かつ hasMedia=false
hasMedia=true かつ paragraphCount=0
hasTable=true かつ paragraphCount=0
```

---

## 8. 設計上の結論

1ページは単なる高さの箱ではない。

`1456×2056px` の固定ページに対して、以下を同時に満たす必要がある。

```text
- 幾何的に収まる
- 見出し・画像・本文が意味単位でまとまる
- 画像は 520〜680px 程度を標準とする
- 画像主体ページでも本文1〜2段落を同居させる
- 本文中心ページは 900〜1500字程度を基本とする
- 表は8行以内を標準とし、10行超は分割候補とする
```

したがって、切り分けは `h2` / `figure` / `p` の個別要素単位ではなく、**誌面パッケージ単位**で行う。
