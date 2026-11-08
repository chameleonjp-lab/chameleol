# kamereoru

## カメレオる

宝石を盗んだカメレオンが、街の建物に体色を合わせながら警察から逃げる、スマートフォン向けブラウザゲームです。

本編は全50棟、1棟5秒を試作基準とします。円形パレットで色を合わせ、20棟目から明るさ調整を使います。ランキングは通過棟数を優先し、同じ棟数なら平均一致度で比較します。

## 設計資料

- [要件仕様書](docs/superpowers/specs/2026-11-07-kamereoru-design.md)：会話の最新決定、ゲーム・画面・練習・ランキング・15言語・保存・検証の要件。
- [受入試験一覧](docs/acceptance/kamereoru-acceptance.md)：実装後に確認する条件と要件番号の対応。
- [仕様統合のレビュー記録](docs/reviews/2026-11-07-kamereoru-requirements-review.md)：旧案との整理、補完した境界処理、文書確認の範囲と限界。

## 実装の進め方

[実装計画書](docs/superpowers/plans/2026-11-07-kamereoru-implementation-plan.md)では、iPhoneで色合わせを試せる段階から正式ランキングの公開判定までを9工程に分けています。[計画の検証記録](docs/reviews/2026-11-07-kamereoru-implementation-plan-review.md)で、保存や再送の競合、同順位など、初稿で見つけた問題と修正を確認できます。

工程 P1〜P8 の実装はこのリポジトリに入っています。P9 のうち、iPhone 実機での確認、Supabase 本番への適用、ゲームの公開はまだ行っていません。配点・演出時間・難易度などの数値は試作値で、実機で確かめてから決めます。

## 手元で動かす

Node.js 20 以上が必要です。

```sh
npm ci
npm run serve            # http://127.0.0.1:5173/ で開く（作らずにそのまま動かす）
npm test                 # 判定・保存・通信・翻訳などの試験
npm run build            # 公開用の一式を dist/ に作る
```

データベースの試験（`npm run test:sql`）には PostgreSQL 16 が、画面の通し試験（`npm run test:e2e`）には Playwright と Chromium が必要です。GitHub Actions の設定（`.github/workflows/ci.yml`）で同じ手順を実行します。この設定は試験だけを行い、公開や配備はしません。

## 主な資料

- [受入試験の記録](docs/acceptance/results.md)：82件の試験を、どこまで確かめたか（自動確認・部分確認・未実施・保留）と、その証拠。
- [調整表](docs/tuning/adjustment-table.md)：採点・時間・出題・保存・通信の試作値と、正式値を決めるための測定。
- [iPhone での確認手順](docs/device-test-procedure.md)：実機で試すことと記録表。
- [公開と切り戻しの手順（案）](docs/release/release-and-rollback.md)：データベース・サーバー・画面を切り替える順番と、戻し方。
- [素材の出典](assets/credits.md)：主人公は、提供されたカメレオン No.28 エディター（[docs/design/chameleon-no28-editor.html](docs/design/chameleon-no28-editor.html)）の書き出し値から作っています。
