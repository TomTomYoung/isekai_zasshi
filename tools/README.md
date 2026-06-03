# tools

変換・整形・書き出し用スクリプト置き場です。

## 固定レイアウトHTMLをPNG化

- `export_fixed_layout_images.mjs`: Playwrightで `202603/*/fixed_layout.html` を開き、`.fixed-page` をPNG保存します。
- `export_fixed_layout_images.sh`: npm install、Chromium install、PNG書き出しをまとめて実行します。

出力先：`exports/fixed_layout_images/`

実行：

```bash
./tools/export_fixed_layout_images.sh
```

または：

```bash
npm install
npx playwright install chromium
npm run export:fixed-layout
```

`fixed_layout.html` は元記事HTMLを `fetch()` するため、このスクリプトは内部でローカルHTTPサーバーを立てます。

## EPUB HTML整形

- `normalize_epub_html.py`: `202603` 配下の `*_epub.html` と `目次_epub.html` をEPUB向けに整えます。

```bash
python tools/normalize_epub_html.py
```

## EPUB生成

- `convert.py`: Markdown群から簡易EPUBを作る旧来ツールです。完成HTMLや固定レイアウト画像化用ではありません。

```bash
python tools/convert.py
```
