# 異世界雑誌

## 概要

このリポジトリは、異世界雑誌の原稿・リフロー版HTML・固定レイアウト版HTML/CSS・画像・制作手順を管理するためのものです。

現在の主対象は、`202603` 号を以下の2系統で一区切りにすることです。

```text
reflow版
= EPUB等のリフロー本文向け。読者環境に応じて本文が流れる版。

fixed_layout版
= 固定紙面向け。1456×2056pxの紙面をPNG画像として書き出す版。
```

---

## 現在の優先作業

```text
異世界雑誌 202603号 reflow v1.0
異世界雑誌 202603号 fixed_layout PNG export
```

v1.0 の目的は、完全版を作ることではありません。

既存記事を固定し、目次・本文・画像・キャプション・奥付を備えた、最初から最後まで読める版として一度閉じることです。

---

## reflow v1.0 作業導線

作業は以下の順に確認します。

1. [`docs/01_isekai_zasshi_v1_checklist.md`](docs/01_isekai_zasshi_v1_checklist.md)
   - 収録記事、reflow構造、画像、目次、表紙、奥付、読了テストのチェックリスト。

2. [`docs/02_reflow_build_steps.md`](docs/02_reflow_build_steps.md)
   - reflow版ビルド手順。
   - `tools/create_reflow_files.py` と `tools/normalize_reflow_html.py` の実行、HTML正規化、目次・CSS・画像確認を含む。

3. [`docs/03_reflow_v1_release_notes.md`](docs/03_reflow_v1_release_notes.md)
   - reflow v1.0リリースノート。
   - v1.0に含めるもの、v1.0では要求しない品質、v1.1以降に回すもの、タグ名案、リリース文案。

互換用の旧文書：

```text
docs/02_epub_build_steps.md
docs/03_epub_v1_release_notes.md
```

---

## 重要ファイル

### reflow版

```text
202603/reflow.css
202603/目次_reflow.html
202603/*/*_reflow.html
tools/create_reflow_files.py
tools/normalize_reflow_html.py
```

互換用旧名：

```text
202603/epub.css
202603/目次_epub.html
202603/*/*_epub.html
tools/normalize_epub_html.py
```

### fixed_layout版

```text
202603/*/fixed_layout.html
202603/*/fixed_layout.css
tools/export_fixed_layout_images.mjs
tools/export_fixed_layout_images.sh
exports/fixed_layout_images/
```

---

## reflow HTML生成・正規化

旧 `*_epub.html` から `*_reflow.html` を生成するには、リポジトリ直下で以下を実行します。

```bash
python tools/create_reflow_files.py
python tools/normalize_reflow_html.py
```

その後、意図しない変更がないか確認します。

```bash
git diff -- 202603
```

---

## fixed_layout PNG書き出し

固定レイアウト版をPNG化するには、リポジトリ直下で以下を実行します。

```bash
./tools/export_fixed_layout_images.sh
```

出力先：

```text
exports/fixed_layout_images/
```

---

## reflow v1.0 の完了条件

以下を満たしたら、`202603` 号を reflow v1.0 として固定します。

- reflow版が開く
- 表紙がある
- 目次がある
- 目次から各記事へ移動できる
- 本文が最初から最後まで読める
- 画像が表示される
- キャプションが読める
- 奥付がある
- 致命的なリンク切れ・画像切れ・本文崩壊がない

タグ名案：

```text
isekai-zasshi-202603-reflow-v1.0
```

---

## v1.0 ではやらないこと

- 新記事追加
- 世界設定の拡張
- CSSの全面再設計
- 新規画像の大量追加
- KDP完全最適化
- 全端末での完全表示保証

これらは v1.1 以降、または v2.0 以降に回します。
