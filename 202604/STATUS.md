# 202604号 現況表

このファイルは `202604/HANDOFF.md` とセットで使う。

ここでいう状態は **構造・編集作業上の状態** であり、掲載確定・内容承認を意味しない。

## 2026-09-05 編集再開時点

全29フォルダを監査済み。監査時の本文正本は24記事、現行企画は8本。起動用ファイルだけのフォルダが3件、HTMLのみが1件ある。引き渡し時の表で「現行原稿あり」と読めた箇所は実査結果で補正した。

- 全号監査・改稿優先順位・番号衝突の比較：[`EDITORIAL_AUDIT.md`](EDITORIAL_AUDIT.md)
- 改稿内容・整合確認・次回開始点：[`EDIT_LOG.md`](EDIT_LOG.md)
- 03〜08：`REWRITTEN_PENDING_USER`。MDを記事別に改稿。ユーザー未確認、派生HTML未同期。
- それ以外：本文・既存HTMLの監査のみ。全号は未校了。
- 01の薔薇十字設定、11と23の人物、21の時系列、23の依頼難度、番号衝突に未解決事項あり。

## 状態記号

- `MISSING_BODY`：現行本文Markdownなし。掲載確定には正本が必要
- `COVER`：表紙
- `DRAFT_AI_UNREVIEWED`：AIドラフト。ユーザー編集済みとみなさない
- `CURRENT_CONCEPT`：現行企画として意図的に差し替えられている。旧版へ戻さない
- `REVIEW_REQUIRED`：現行原稿はあるが、内容・密度・誌面性を再評価する
- `NUMBER_CONFLICT`：同じ番号または近接する重複候補がある。勝手に削除・改番しない

## 現行ディレクトリ一覧

| No. | 現行ディレクトリ | 状態 | 現在の編集上の注意 |
|---:|---|---|---|
| 00 | `00_表紙` | COVER / AUDITED | 10にない失踪事件の煽りあり。本文確定後に調整 |
| 01 | `01_王都女学院春の制服名鑑` | AUDITED / REVIEW_REQUIRED | 三校比較を維持。薔薇十字の学校設定と現行本文に差。軽量版表記・固定版別文 |
| 02 | `02_はじめてのギャルギルド` | CURRENT_CONCEPT / AUDITED | 現行企画を維持。冒頭・アムロミレイ・プリウラを保護。HTML差分あり |
| 03 | `03_王都ギルド登録所大混乱` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 04 | `04_聖職者花見乱痴気騒ぎ` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 05 | `05_引っ越し魔導便トラブル告発` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 06 | `06_春の闇バイト求人特集` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 07 | `07_王都下宿ぼったくり事情` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 08 | `08_脱法スキル講習会の実態` | REWRITTEN_PENDING_USER | MD改稿・自己校閲済み。ユーザー未確認、旧HTML未同期。EDIT_LOG参照 |
| 09 | `09_春の女騎士配属名鑑` | AUDITED / DRAFT_AI_UNREVIEWED | 事件記事型に寄せず、人物名鑑として差別化 |
| 10 | `10_花見ダンジョン危険案内` | AUDITED / DRAFT_AI_UNREVIEWED | 観光ガイド＋危険案内として誌面形式を差別化 |
| 11 | `11_新人パーティー選手名鑑` | AUDITED / DRAFT_AI_UNREVIEWED | パーティーごとの固有性・比較軸・ゴシップを確認 |
| 12 | `12_新生活アーティファクトカタログ` | AUDITED / DRAFT_AI_UNREVIEWED | 商品カード・価格・コピー等、カタログ性を重視 |
| 13 | `13_王都古道具屋春の掘り出し市` | AUDITED / DRAFT_AI_UNREVIEWED | 広告・掘り出し物・曰くのある商品群として差別化 |
| 14 | `14_春のあやしさ満天堂` | AUDITED / DRAFT_AI_UNREVIEWED | 通販誌面として商品コピーと胡散臭さを重視 |
| 15 | `15_今日の魔術春眠編` | AUDITED / DRAFT_AI_UNREVIEWED | 連載記事として短いネタの回転・実用風の笑いを重視 |
| 16 | `16_魔物の育て方新入生編` | AUDITED / DRAFT_AI_UNREVIEWED | 飼育記事・注意喚起・商品/生態ネタとして差別化 |
| 17 | `17_ロブロンス春号` | AUDITED / DRAFT_AI_UNREVIEWED | 雑多ページ枠。ランキング・貼り紙・噂など混成形式を活かす |
| 18 | `18_王都新歓コンパ危険地帯レポート` | AUDITED / DRAFT_AI_UNREVIEWED | 現場レポートとして場所・時間・団体ごとの差を作る |
| 19 | `19_春祭りガイド` | NUMBER_CONFLICT / AUDITED | 同番号の記事あり。内容比較前に削除・改番しない |
| 19 | `19_春祭り実行委員会の闇` | NUMBER_CONFLICT / AUDITED / MISSING_BODY | 本文・企画・HTMLなし。preview起動用2ファイルのみ |
| 20 | `20_王都東門荷馬車横転事件` | AUDITED / DRAFT_AI_UNREVIEWED | 後半事件簿。事件固有の因果・目撃者・積み荷を強化候補 |
| 21 | `21_魔術学院入学式失踪事件` | AUDITED / DRAFT_AI_UNREVIEWED | 後半事件簿。単なる噂一覧で終わらせず事件の芯を確認 |
| 22 | `22_王都南区花見宿事件` | NUMBER_CONFLICT / AUDITED / MISSING_BODY | 本文・企画・HTMLなし。preview起動用2ファイルのみ |
| 22 | `22_花見宿ガイド` | NUMBER_CONFLICT / AUDITED | 同番号の記事あり。ガイド記事としての役割を比較 |
| 23 | `23_新人冒険者パーティー流星猫事件` | AUDITED / DRAFT_AI_UNREVIEWED | パーティー「流星猫」を固有キャラ・騒動として成立させる |
| 24 | `24_春祭り警備隊レポート` | NUMBER_CONFLICT / AUDITED / MISSING_BODY | 警備実務の短いHTMLのみ。独立掲載なら正本MDから制作 |
| 24 | `24_春祭り警備隊襲撃事件` | NUMBER_CONFLICT / AUDITED / MISSING_BODY | 本文・企画・HTMLなし。25と二稿がある状態ではない |
| 25 | `25_春祭り警備隊襲撃事件` | NUMBER_CONFLICT / AUDITED | 本文と企画あり。HTMLなし。負傷者・不明者と証言の整理が必要 |

---

## 既知の構造上の注意

### 1. 旧企画書の番号は現況と一致しない

`docs/07_202604_issue_plan.md` と `docs/08_202604_volume_expansion_spec.md` は企画背景として有用だが、現在のディレクトリ構成より古い。

特に02は現行 `はじめてのギャルギルド` を優先する。

### 2. MarkdownとHTMLの同期を前提にしない

既存の `.html` は、現行 `.md` より古い場合がある。

本文監査では `.md` を正とし、HTMLの文字量や内容を見て「本文が薄い」と誤判定しない。逆に、`.md` が長くても文章品質が十分とはみなさない。

### 3. seedスクリプトは現行202604へ再実行しない

`tools/seed_202604_articles.mjs` は初期雛形生成用で、古い記事一覧と汎用定型文を含む。

Astraの編集開始時にこれを実行して現行202604を再シードしない。

---

## Astraがこの表を更新するとき

作業中に状態を更新する場合は、曖昧な `DONE` を避け、最低限次のように分ける。

- `AUDITED`：監査済み、本文未改稿
- `REWRITTEN_PENDING_USER`：改稿済み、ユーザー未確認
- `USER_REVIEWED`：ユーザーが内容確認済み
- `LAYOUT_SYNCED`：派生HTML/固定レイアウト同期済み
- `BUILD_VERIFIED`：号全体ビルド・検査済み

**本文を書いただけで `USER_REVIEWED` や `BUILD_VERIFIED` にしない。**
