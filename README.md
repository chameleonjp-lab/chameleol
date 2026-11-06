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

この変更は文書のみです。ゲームの実装、Supabaseへの適用、本番公開は行っていません。配点・演出時間・難易度等の調整値は試作で検証し、正式なランキング公開前に確定します。
