# chameleol

## カメレオる

宝石を盗んだカメレオンが、街の建物に体色を合わせながら警察から逃げる、スマートフォン向けブラウザゲームです。

リポジトリ：[chameleonjp-lab/chameleol](https://github.com/chameleonjp-lab/chameleol)。リポジトリ名と npm パッケージ名は `chameleol` です。保存データの形式名、API・データベースの識別子、環境変数の `kamereoru` / `KAMEREORU_` は、既存データや接続設定との互換性のため維持します。

本編は全50棟、1棟5秒を試作基準とします。円形パレットで色を合わせ、20棟目から明るさ調整を使います。ランキングは通過棟数を優先し、同じ棟数なら平均一致度で比較します。

## 設計資料

- [要件仕様書](docs/superpowers/specs/2026-11-07-kamereoru-design.md)：会話の最新決定、ゲーム・画面・練習・ランキング・15言語・保存・検証の要件。
- [受入試験一覧](docs/acceptance/kamereoru-acceptance.md)：実装後に確認する条件と要件番号の対応。
- [仕様統合のレビュー記録](docs/reviews/2026-11-07-kamereoru-requirements-review.md)：旧案との整理、補完した境界処理、文書確認の範囲と限界。

## 輪郭・舌のダイヤ・称号と結果画像の計画（2026-11-14改訂）

線の8段階と移動10秒ごとの舌・ダイヤに加え、通過棟数の称号と、最高一致の主人公1体・スコア・称号・ボーナス獲得件数を一枚にした結果画像を計画します。主ボタン「Xでシェア」から画像を端末共有へ渡す設計です。Xへの添付はiPhone実機で確認します。

本人指定で45の軌跡・51の物語・88の再生・97の発見帳を除外し、後続は16案、元の案は合計96採用・4除外です。こちらは文書の改訂で、ゲーム実装や実際の画像共有を完了したものではありません。

- [要件仕様書](docs/superpowers/specs/2026-11-14-chameleol-design-followups-spec.md)と[実装計画書](docs/superpowers/plans/2026-11-14-chameleol-design-followups-plan.md)
- [Claude向け依頼文・担当組織・エフォート](docs/prompts/2026-11-14-claude-design-followups.md)
- [敵対的検証・修正記録](docs/reviews/2026-11-14-chameleol-design-followups-review.md)と[要件の対応表](docs/requirements/chameleol-design-followups.json)

既存7称号の名称・キーを残し、2棟刻みの追加20称号を正式な実装対象へ採用しました。称号は全27区分に統合し、0・1・50棟を特別扱い、それ以外を2棟単位で判定する計画です。結果画面と共有画像には、今回の通過棟数に対応する同じ1称号を表示します。

### 実装前の現状（2026-11-14、main `e8c69b4` 時点）

- PR [#14](https://github.com/chameleonjp-lab/chameleol/pull/14)（似顔絵・双眼鏡の交互表示、初クリア切符）、[#16](https://github.com/chameleonjp-lab/chameleol/pull/16)（5種ボーナス）、[#18](https://github.com/chameleonjp-lab/chameleol/pull/18)（ホームの24色・巻きベロ）はmainへ取り込み済みです。この計画では作り直しません。
- 採用は元80件＋後続16件（E020/E034/E039/E044/E056/E067/E068/E069/E072/E075/E076/E084/E086/E087/E090/E094）＝96件、除外はE045・E051・E088・E097の4件です。後続16件はまだ実装していません。コードの一覧（`src/presentation/catalog.js`）と試験は、当初の採用80件・対象外20件のままです。
- 新しい結果要件RES-01〜08（今回の通過棟数による称号、最高一致の主人公1体・総スコア・称号・ボーナス獲得件数の結果カード、PNGの事前作成、「Xでシェア」からの画像共有）は未実装です。全27称号は正式採用ですが、称号の判定・15言語の文言はまだコードにありません。「既存7名称」は資料で先に定めた名称・キーのことで、現在の画面には称号の表示がありません。
- 線の8段階・移動10秒ごとの舌とダイヤも未実装です。
- 公開版の状態は未確認です（2026-11-14に取得を1回試しましたが、作業環境の通信制限で接続できませんでした）。古い資料の「未公開」は、その資料を書いた時点の記述です。
- 実装は計画書のT1〜T9の順に、工程ごとの変更先ファイルと対象試験に従って進めます。担当は役割名（実装担当A：輪郭→舌、実装担当B：結果解析→称号・カード・共有、実装担当C：表示用保存→背景・警察・精密札、試験・証拠担当）で記録します。

## ホームの連続色変化・巻きベロ（2026-11-14）

ホームのカメレオンが24色・12秒周期でなめらかに色変化し、時々巻きベロを伸縮させます。初回2〜3秒後、以後は動作終了から6〜10秒間隔です。非表示・描画停止中は時間を止め、「動きを減らす」が有効な時は体色だけを変化させます。実装と自動確認の結果は[検証記録](docs/acceptance/home-idle-evidence.md)にまとめています。当該記録時点ではiPhone実機確認・本番公開を行っていません。現在の配布版は別途照合します。

- [仕様書](docs/superpowers/specs/2026-11-14-chameleol-home-idle-spec.md)
- [実装計画書](docs/superpowers/plans/2026-11-14-chameleol-home-idle-plan.md)
- [計画の検証と修正記録](docs/reviews/2026-11-14-chameleol-home-idle-review.md)

## ボーナス得点と獲得演出の計画（2026-11-13）

精密擬態・安定擬態・10棟ごとの到達・素早い色合わせ・全棟成功の5種類は、PR [#16](https://github.com/chameleonjp-lab/chameleol/pull/16)でmainへ取り込み済みです。[実装検証の記録](docs/acceptance/bonus-score-evidence.md)に自動確認と残る実機・公開条件をまとめています。以下は実装の根拠になった文書です。

- [ボーナス仕様書](docs/superpowers/specs/2026-11-13-chameleol-bonus-score-spec.md)
- [実装計画書](docs/superpowers/plans/2026-11-13-chameleol-bonus-score-plan.md)
- [敵対的検証と修正記録](docs/reviews/2026-11-13-chameleol-bonus-score-review.md)

## 追加演出80要件の計画（2026-11-11）

当初採用した80要件の計画です。PR #12と残る2件を補完したPR #14はmainへ取り込み済みです。[80件の証拠](docs/acceptance/effects80-evidence.md)と[補完2件の記録](docs/acceptance/effects37-85-completion.md)で、自動確認・実機未確認を区別します。当初除外20案のうち、今回の16採用・4除外は上の改訂計画で扱います。

- [確定仕様書](docs/superpowers/specs/2026-11-11-chameleol-effects80-spec.md)：採用80件・対象外20件、保存・表示・負荷の条件。
- [実装計画書](docs/superpowers/plans/2026-11-11-chameleol-effects80-plan.md)：工程の順序、変更する場所、接続口、確認手順。
- [80要件とRICEの対応表](docs/requirements/chameleol-effects80.json)と[敵対的検証・修正記録](docs/reviews/2026-11-11-chameleol-effects80-adversarial-review.md)：元の番号、優先度、工程とレビューへの対応。

2026-11-11の追加要件として、[初回ガイドと練習の実装計画](docs/superpowers/plans/2026-11-11-chameleol-guided-play-plan.md)を加えました。初回の1・2棟目と、明度初解放時の20・21棟目に、一致度と95%以上になる操作位置を示します。4段階は練習からいつでも個別に確認できます。ガイドはPR #12でmainへ取り込み済みで、演出80件の件数やRICE値には含めません。

## 実装の進め方

[実装計画書](docs/superpowers/plans/2026-11-07-kamereoru-implementation-plan.md)では、iPhoneで色合わせを試せる段階から正式ランキングの公開判定までを9工程に分けています。[計画の検証記録](docs/reviews/2026-11-07-kamereoru-implementation-plan-review.md)で、保存や再送の競合、同順位など、初稿で見つけた問題と修正を確認できます。

工程 P1〜P8 と、その後の音・演出・ガイド・ボーナス・ホーム動作の実装がこのリポジトリに入っています。個別の検証記録ではiPhone実機などの未確認事項を残しています。本番の現状は古いP9の記述だけで断定せず、公開候補と実際の配布版を照合して管理します。配点・演出時間・難易度などの正式値は実機の証拠に基づいて判断します。

## 手元で動かす

Node.js 20 以上が必要です。

```sh
git clone https://github.com/chameleonjp-lab/chameleol.git
cd chameleol
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
- [公開と切り戻しの手順（案）](docs/release/release-and-rollback.md)：データベース・サーバー・画面を切り替える順番と、戻し方。現在の公開状態は未確認です（同資料の冒頭を参照）。
- [素材の出典](assets/credits.md)：主人公は、提供されたカメレオン No.28 エディター（[docs/design/chameleon-no28-editor.html](docs/design/chameleon-no28-editor.html)）の書き出し値から作っています。



