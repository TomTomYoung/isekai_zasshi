# 文書案内：現行手順と履歴の区分

更新日：2026-09-23。対象は `TomTomYoung/isekai_zasshi`。

## 作業開始点

技術作業は [直下のHANDOFF](../HANDOFF.md) から開始します。現在の最優先はdevでの固定紙面プレビューの不調切り分けです。文書が存在すること、実装が存在すること、利用者環境で動くことを区別します。

今回の保護対象は `202603/` とその既存制作・出力経路です。旧資料のコマンドを実行して再同期しません。

## 現行の技術文書

[06 CodeSwing用入口](06_codeswing_dev_preview.md)：実装の仕組み、入口、現在の不調、確認できていない範囲。

[09 Markdown正本規則](09_markdown_source_rule.md)：本文とレイアウトの責務、HTML同期が別工程であること。

[10 記事単位ビルド仕様](10_article_level_build_spec.md)：現コードの入力・出力、実行環境、削除・fallback・統合の注意。

[11 記事ビルドの短い案内](11_article_level_build_summary.md)：詳細仕様への入口。別の独立仕様を増やしません。

[12 プレビュー方式](12_preview_methods.md)：既存方式と未実装案、commit前確認、実行環境、画像化の要否。

[13 文書・実装監査](13_documentation_audit.md)：旧説明との不一致、今回訂正したこと、未修正のコード課題。

[14 切り分け・合格条件](14_preview_acceptance.md)：試験の順番、証拠の段階、実機で必要な確認。

操作場所別の入口は [プレビューREADME](../preview/README.md) と [tools README](../tools/README.md) です。

## 202604の編集記録

[編集HANDOFF](../202604/HANDOFF.md)、[STATUS](../202604/STATUS.md)、[EDITORIAL_AUDIT](../202604/EDITORIAL_AUDIT.md)、[EDIT_LOG](../202604/EDIT_LOG.md) は、原稿・企画・承認待ち事項の記録です。

[画像不足一覧](../202604/画像不足一覧.md) と [画像配置記録](../202604/画像配置記録.md) は素材作業の起点です。日付付きの過去点数を最新値として再利用しません。プレビュー修理で本文・画像採用・記事番号を勝手に変更しません。

現行本文・現行ディレクトリと新しいユーザー指示を優先します。現行02は「はじめてのギャルギルド」であり、旧企画を生成するseed処理で戻しません。既存編集履歴の改稿済みはユーザー承認済みではありません。

## 旧企画の入口

[07 企画メモ](07_202604_issue_plan.md) と [08 増補仕様](08_202604_volume_expansion_spec.md) は、現行記事と衝突する番号・企画・共通テンプレートを含んでいたため、現況を案内する入口へ更新しました。

原文は [legacy/2026-09-23](legacy/2026-09-23/README.md) に元blobのまま保存しています。旧原文は制作経緯の資料であり、現行号への指示ではありません。

## 202603・過去工程の資料：今回変更しない

[01 reflowチェックリスト](01_isekai_zasshi_v1_checklist.md)、[02旧EPUBビルド](02_epub_build_steps.md)、[02 reflowビルド](02_reflow_build_steps.md)、[03旧EPUBリリース](03_epub_v1_release_notes.md)、[03 reflowリリース](03_reflow_v1_release_notes.md) は過去のreflow/EPUB工程の資料です。今回その成果物を再試験していません。

[02 fixed-layoutビルド](02_fixed_layout_build_steps.md)、[03 AI修正指示](03_ai_layout_fix_instruction.md)、[04 公開後記録](04_202603_post_release_notes.md)、[04 計測仕様](04_fixed_layout_measurement_spec.md)、[05 容量仕様](05_fixed_layout_design_capacity_spec.md)、[06 KDP登録時仕様](06_current_kdp_release_spec.md) は、202603の当時の制作記録または旧設計段階の資料です。

これらにある号なしパス、旧計測アルゴリズム、全号コマンド、完成宣言を202604の現在地へ横滑りさせません。KDP登録情報や販売状態は今回再検証していません。歴史資料の原文は保持します。

## 文書の運用規則

新しい状態を記録するときは対象commit・環境・実施した試験を添えます。「未実装」「実装あり」「模擬で成功」「実記事HTTPで成功」「dev実機で成功」「最終PNG比較済み」を区別します。

仕様に書いた目標と、コードが現在行っている処理も分けます。本文の正本規則を根拠に、自動変換ツールが実装済みだとは説明しません。履歴を残す場合は日付と適用範囲を明記し、同じ作業の入口を複数の文書で独立管理しません。
