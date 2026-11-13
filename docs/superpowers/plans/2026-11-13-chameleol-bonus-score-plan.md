# カメレオる：ボーナス得点・獲得演出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5種類のボーナスを正しく確定・保存・再検証し、獲得理由と加点をプレイ中と結果で確認できるようにする。

**Architecture:** 既存の共通判定エンジンに時間区間の積算と版別の追加点を実装し、表示は確定イベントを読む。旧ランキングv1／旧単独v2の条件を維持するため、新ランキングv3／新単独v4を分ける。状態保存・再送・サーバー再計算を先に整え、その後にカード・音・結果を接続する。

**Tech Stack:** Node.js 20以上、JavaScript ES modules、既存Three.js 0.170.0、Web Audio、IndexedDB、Supabase Edge Function（Deno）／PostgreSQL、node:test、既存Playwright検証。

**Spec:** [5種類のボーナス得点と獲得演出の仕様](../specs/2026-11-13-chameleol-bonus-score-spec.md)。本書と一緒に読む。

## Global Constraints

- 計画作成PR #15は文書のみ。後続の実装PRで下記を検証し、チェック欄と[実装証跡](../../acceptance/bonus-score-evidence.md)を更新する。本番DB適用・公開は別判断とする。
- 基準 main は `a772fc4c01063913d742d8f408d7b59a7ea398ea`。着手時に新規変更・同時進行の音改善・版番号の衝突を確認する。
- 通過20、正確さ最大80、連続追加0/5/10/20、クリア200を維持。新5種の最大合計1200、理論上の総得点7280。
- 全50棟、1棟5000ms、評価1500〜4500ms、順位は通過棟数→平均一致度。旧スコア・名前・自己ベスト・識別値を初期化しない。
- 対象はiPhone 17 Pro Safari縦横、402×700／402×874／874×402、15言語、消音・音量0・動きを減らす設定。
- 新規依存を増やさず、既存の表示用時計とmixerを使う。mainへ直接pushしない。後続実装もPR経由とし、本番適用と実験場掲載は別の公開判断に分ける。

## Review Focus

| 起こりやすい失敗 | 担当工程と固定する試験 |
|---|---|
| 95/98%、2500ms、500/501ms、同時刻0msの入力で判定が変わる | B1：境界表、分割tick、圧縮前後の一致 |
| 旧保存へ新項目を足して復元不能、旧ランキングへv2の警戒緩和が混入 | B0/B2/B3：旧固定照合例、v1↔v3とv2↔v4の順位不変 |
| 開始応答消失中にサーバー更新、同じ要求に異なる版・番号を返す | B3：受付前後更新、同時開始、旧新クライアント×サーバー |
| 補助得点の訂正で総得点だけ直り、棟別得点が古いまま残る | B3/B6：score・bonus・perBuildingの一括置換と合計照合 |
| 50棟目のpass表示が終了処理で消え、スキップでB5を失う | B4/B6：最終棟全種同時・即スキップ・保存遅延・再表示 |
| ガイド・警告・4種同時・長い翻訳が狭い画面で重なり、音が積み上がる | B4/B5/B7：3画面寸法、15言語、消音、停止、20連戦 |

---

## 現在のコードと変更点

| 現在の場所 | 確認した挙動／変更の理由 |
|---|---|
| `src/rules/v1/config.js` / `engine.js` | v1/v2と通常点。B2/B4の連続時間を判定エンジンへ追加する |
| `src/rules/v1/history.js` | 同時刻の色入力を圧縮する。0msの色で連続時間を切らない設計が必要 |
| `src/game/session.js` | snapshot復元でsummaryをJSON比較する。旧版の形を変えると復元を拒否する |
| `src/net/start.js` / サーバー`handlers.ts` | 応答検査と開始の版がv1固定。両側を同時に版対応させる必要がある |
| サーバー`replay.ts` | 対応版はv1だけ。補助得点の差は順位を保留せず再計算値で受理する |
| `src/app.js` | 通過の通常加点、各種音、結果内訳を直接扱う。終了時にgame用scopeを破棄する |
| `src/presentation/result-view.js` | 別の得点内訳と600msの数え上げがある。表示用データを共通にする |
| `src/audio/mixer.js` | 優先度・同時音数・消音をすでに管理。追加の再生系を作らない |
| `scripts/sync-shared.mjs` / `build.mjs` | 共通ファイル一覧とrelease.jsonが版固定。新ファイル・対応版を反映する |

### 共有インターフェース

新ファイルは以下の責務だけを持つ。関数名は後続工程から同じものを使う。

| ファイル | 提供するもの |
|---|---|
| `src/rules/v1/bonus.js`（新規） | `createBonusAccumulator()`、`accumulateBonus(acc,{matchUnits,fromEvalMs,dtMs},rules)`、`settleBuildingBonus({building,matchSum,evalMs,acc},rules)`、`settleClearBonus(buildings,rules)`。時刻・一致度は整数。返すAwardは仕様DATA-02の形 |
| `src/presentation/bonus-data.js`（新規） | `buildBonusBatch({playId,passEvent,summary})`、`buildBonusResult(summary)`。採点せず、確定内訳を画面向けにコピーする。旧版は`available:false` |
| `src/presentation/bonus-view.js`（新規） | `mountBonusPresentation({host,scope,t,reducedMotion})` → `{show(batch),tick({activeMs,phase,guideActive,warningActive}),finishNow(),dispose()}`。採点・保存関数を呼ばない |
| `src/presentation/bonus-audio.js`（新規） | `choosePassCue({batch,comboMilestone,milestone,criticalCue})` → 0個または1個の再生要求。音選択はplayId＋棟番号で1回 |

`BonusBatch = {id,playId,building,earnedAtT,basePoints,bonusPoints,totalPoints,awards}`、`id = playId + ':' + rulesVersion + ':' + building`。通常棟のawardsはB1〜B4。B5は終了用にsummaryから読み、通常棟のbonusPointsへ混ぜない。`BonusResult = {available,points,rows}`、rowsは①〜⑤の5行で、各行にkind/count/points、精密だけtier別内訳を持つ。

## B0：版構成と旧版の照合例を固定する

**Files:** Modify `src/rules/v1/config.js`, `src/rules/v1/index.js`, `src/app.js`, `tests/rules/alert-easing.test.mjs`, `tests/game/session.test.mjs`; Create `tests/rules/bonus-version.test.mjs`, `tests/compat/fixtures/pre-bonus-v1.json`, `tests/compat/fixtures/pre-bonus-v2.json`。既存6件のv1照合例は `tests/replay/fixtures/*.json` のまま維持する。

**Interfaces:** Produces `RULES_V3`（v1＋bonus）、`RULES_V4`（v2＋bonus）、既知4版を返す `rulesForVersion(version)`。既存`createGame()`の省略時v1は維持し、単独新規の省略版はv4とする。

- [x] B0.1 コードを変える前に、明示したv1/v2それぞれの操作履歴・評価途中snapshot・終了summaryを `tests/compat/fixtures/pre-bonus-v1.json` / `pre-bonus-v2.json` へ固定する。明度解放・警戒緩和・停止再開を含める。現行6件はv1だけなので、v2の固定照合例がすでにあると扱わない。そのうえで `v1_v2_rules_unchanged`、`v3_inherits_ranked_conditions`、`v4_inherits_standalone_conditions`を作る。bonus項目とrulesVersion以外の各元版の値が深く一致すること、v1/v2はbonus無効であることを検査する。
- [x] B0.2 `node --test tests/rules/bonus-version.test.mjs` を実行し、新版未定義によるFAILを記録する。
- [x] B0.3 4版の定数と対応表を追加する。新しいbonus設定は95/98、90/2500ms、10棟刻み、95/500ms/1000ms、50棟/85を仕様どおり固定する。既存設定の値を書き換えない。app内で新規単独の既定版を指すv2固定参照もv4へ更新し、プレイ中・結果では開始応答／保存から決まったセッションのrulesを正とする。`bonus.js`の共有一覧への追加は、実ファイルを作るB1で行う。
- [x] B0.4 旧版固定値と新規既定版の試験を分ける。`alert-easing.test.mjs` の新規セッションの期待版だけをv4へ更新し、手作りaccで警戒を調べる試験はv2を明示する。v4の積算状態は正式な初期化を経て検査する。`session.test.mjs` の省略版に依存する `summarize(s.state)` は `summarize(s.state,s.rules)` へ直す。旧v1/v2の採点値・snapshot・fixture期待値は変更しない。
- [x] B0.5 `npm run sync` 後、`node --test tests/rules/bonus-version.test.mjs tests/rules/alert-easing.test.mjs tests/game/session.test.mjs tests/replay/replay.test.mjs` を実行する。専用compat fixtureは新試験で読み、既存6件を読む照合器へ混入させない。B7で各実行環境の照合器へ追加する。
- [x] B0.6 版構成と照合例だけをコミットする。

## B1：5種類の加点を共通判定へ実装する

**Files:** Create `src/rules/v1/bonus.js`, `tests/rules/bonus.test.mjs`; Modify `src/rules/v1/engine.js`, `manifest.js`, `index.js`; Test `tests/rules/engine.test.mjs`, `tests/rules/history.test.mjs`。

**Interfaces:** Consumes B0のrules、既存のmatchSum/evalMs。Produces 仕様DATA-02のsummary.bonus、score.bonus、passの追加項目。旧版summaryのキーと順序を維持する。

- [x] B1.1 下表を `tests/rules/helpers.mjs` の一致度差替えで試験化する。平均判定と瞬間時間判定を別々に検査する。

| 試験名 | 入力と期待値 |
|---|---|
| `precision_boundaries` | 94.999999→0、95→5、97.999999→5、98→10。+5と+10を同時に付けない |
| `steady_continuous_only` | 90%以上2499ms→0、2500ms→5。1500ms＋低一致度1ms＋1000ms→0 |
| `quick_start_and_hold` | 開始499/500ms・1000ms維持→5、501ms開始→0、999ms維持→0 |
| `quick_prepared_in_grace` | 評価開始時から95%以上1000ms→5。猶予での維持だけ→0 |
| `zero_duration_color_is_neutral` | 同時刻に95→0→95へ変更しても、圧縮前後でB2/B4と得点が一致 |
| `only_passed_buildings_award` | 評価終了後・出口1ms前でquit→未通過棟の全追加点なし。出口時刻のquit→その棟の確定点あり |
| `milestone_is_exit` | 10棟目入口・出口1ms前→0、出口→20。50棟目の到達点も1回 |
| `all_success_requires_every_building` | 全棟85以上＋clear→100。1棟84.999999、quit、detectedなら0 |
| `perfect_totals` | 100%を50棟維持→bonus1200、total7280、awards156件、precision10=50回、B5=1回 |
| `simultaneous_final_building` | 50棟目は通常120、B1〜B4=40、clear200、B5=100で増分460。重複tickでも増えない |
| `frame_partition_invariant` | 同一色履歴を1/16/33/100msのtick刻み／大きいtickで処理して同じ結果 |

- [x] B1.2 `node --test tests/rules/bonus.test.mjs` を実行し、期待した未実装箇所でFAILを確認する。
- [x] B1.3 `advanceTo` の正のdt区間でのみbonusを積算する。accをclone/closedへ深くコピーし、通過で一度だけ確定する。入力ハンドラや表示時計からは加算しない。
- [x] B1.4 `summarize`に新版の内訳を追加し、`pass.points`とperBuilding第3要素、score.totalの合計を一致させる。B5はclear処理で一度だけ確定する。
- [x] B1.5 `node --test tests/rules/*.test.mjs` と共有同期を実行しPASSにする。v1/v2の固定結果に差が出たら新仕様に合わせて旧期待値を修正せず、互換性の実装を直す。
- [x] B1.6 判定と試験をコミットする。

## B2：途中保存・再送・旧結果を保つ

**Files:** Modify `src/game/session.js`, `src/net/outbox.js`, 必要な場合のみ `src/storage/store.js` / `memory-store.js`; Create `tests/storage/bonus-resume.test.mjs`, `tests/net/bonus-outbox.test.mjs`; Test `tests/storage/resume.test.mjs`, `tests/game/session.test.mjs`。

**Interfaces:** Consumes B1のsummaryと評価途中状態。Produces 既存snapshot/outbox形式内で版を固定した保存。旧body/bodySha/resultIdを作り直さない。

- [x] B2.1 `resume_steady_at_2499ms`、`resume_quick_at_999ms`、`pause_does_not_add_time`、`old_snapshot_shape_unchanged`、`outbox_body_immutable_after_upgrade`を作る。再開前後の同一履歴で得点・回数・awardsが一致することを検査する。
- [x] B2.2 対象試験を実行してFAILを確認する。
- [x] B2.3 復元を保存されたrulesVersionへ固定し、履歴から追加時間状態も再構成する。未知の保存は隔離して保持する。旧結果の表示用変換だけに `available:false` を使い、保存済みsummaryへゼロ内訳を書き足さない。
- [x] B2.4 終了保存・世代番号・タブ所有権の既存取引を維持し、二重終了・保存失敗・別タブ引継ぎ・応答再送で追加点が重複しないことを検査する。最大156件でも既存送信分割・サイズ上限内であることを実測する。
- [x] B2.5 `node --test tests/storage/*.test.mjs tests/game/*.test.mjs tests/net/bonus-outbox.test.mjs tests/net/outbox.test.mjs` をPASSにし、保存対応をコミットする。

## B3：サーバーの再計算と旧新の開始受付をそろえる

**Files:** Modify `src/net/start.js`, `supabase/functions/_shared/kamereoru/handlers.ts`, `replay.ts`, `scripts/sync-shared.mjs`, `scripts/build.mjs`, `tests/release/build.test.mjs`; 新規migrationは実装時に `supabase migration new bonus_score_versions` で生成した実ファイルを使用。Create `tests/server/bonus.test.mjs`, `tests/net/bonus-start.test.mjs`, `supabase/tests/kamereoru_bonus.sql`; Modify `scripts/run-sql-tests.mjs`, `scripts/testdb.mjs`（追加の試験制御が必要な場合。現状でもmigrationとSQL試験は一覧から読む）。

**Interfaces:** Consumes B0/B1。新開始要求は対応版一覧、応答は選択済み版。新private関数の署名・競合時の処理は仕様3章。再計算はv1/v3、本人用statusは任意のverifiedScoreを返す。public rankingは従来の項目のみ。

- [x] B3.1 旧クライアント×旧サーバー=1、旧×新=1、新×旧=1、新×新=3の試験を作る。未知版・v4要求・重複一覧は拒否し、古い未完了start記録はv1で再送する。
- [x] B3.2 `accepted_response_lost_during_upgrade`、`concurrent_same_request_same_seed_version`、`wrong_secret_cannot_read_verified_bonus`を作る。応答消失後に受付設定を切り替えても、同じ要求の番号・seed・版が不変であることを検査する。
- [x] B3.3 開始要求を保存した時点の対応一覧で応答を検証する。サーバーは要求一覧をそのまま信用せずv1/v3だけに制限し、DB設定と照合する。既存行と競合勝者の版を優先し、古い8引数の関数を削除しない。
- [x] B3.4 v3の再計算を追加する。bonusの過大・負数・未知kind・重複idを申告してもサーバー算出値だけを採用し、順位一致なら既存の補助差異方針を保つ。仕様DATA-04のverifiedScoreには棟別得点と最大連続成功数も含め、verdictへ保存する。秘密照合付きstatusのofficial/no_rankだけへ追加する。検証途中・審査中・拒否・旧記録では省略する。新private関数の権限を既存と同じ非公開範囲にする。
- [x] B3.5 `npm run sync` と `node scripts/sync-shared.mjs --check`。クライアントと共有コピーのbonus.js、版・manifest指紋が一致することを検査する。
- [x] B3.6 release.jsonの `rulesVersion` は配布物の優先版（standalone=v4、それ以外=v3）とし、`supportedRulesVersions:[v1,v2,v3,v4]`、`preferredRankedRulesVersion:v3`、`defaultStandaloneRulesVersion:v4`を併記する。各プレイで実際に使った版は開始応答／snapshotを正とする。旧版の読込資源を残す。
- [x] B3.7 `node --test tests/net/bonus-start.test.mjs tests/net/start.test.mjs tests/release/build.test.mjs` と `npm run test:sql` を実施する。サーバー試験はDBなしの直接実行ではskipされるため、合格判定は後者から実際に実行した結果で行う。移行を2回適用しても重複・旧記録変更がなく、v1とv3は同一履歴で棟数・平均・警戒・終了時刻が一致することを確認する。
- [x] B3.8 旧新対応と追加migrationをコミットする。本番DBへの適用はB7の公開判断まで行わない。

## B4：ボーナスカードと終了への引継ぎ

**Files:** Create `src/presentation/bonus-data.js`, `bonus-view.js`, `tests/presentation/bonus-data.test.mjs`, `bonus-view.test.mjs`, `tests/ui/bonus-app.test.mjs`; Modify `src/app.js`, `src/ui/presentation.css`, 必要な場合のみ `src/presentation/hud-view.js`。

**Interfaces:** Consumes 確定pass/summary。Produces BonusBatch/BonusResult、1個の表示インスタンス。既存のscopeとゲーム内時刻で駆動する。

- [x] B4.1 `four_awards_one_card_40_points`、`precision_tier_is_exclusive`、`deadline_is_event_time_not_receipt_time`、`destroyed_scope_cannot_show_card`を作る。10棟例で通常118・bonus40・合計158を表示する。
- [x] B4.2 `final_pass_survives_finish_scope_disposal`、`ending_skip_keeps_460_points`、`ending_save_failed_keeps_memory_bonus`をDOM試験にする。50棟目のゲーム表示が破棄されても、採点済みsummaryから終了表示へ引き継がれることを検査する。保存失敗時は既存警告を維持し、再読込後も保存されているとは扱わない。
- [x] B4.3 仕様5章の記号・文言・動き・1400msを実装する。1枚・最大4種類・2列×2行・8粒まで。次の評価時刻に残さず、遅着分の通知をキューへ積まない。カードから得点欄への移動は表示専用の値とする。
- [x] B4.4 初回ガイド・警告では静止の短い表示を優先する。非表示・停止で時計を止め、復帰で遅れた音や移動をまとめて再生しない。採点面や操作部品と交差する装飾を作らない。
- [x] B4.5 `node --test tests/presentation/bonus-*.test.mjs tests/presentation/scope.test.mjs tests/ui/bonus-app.test.mjs` をPASSにし、カードと接続をコミットする。

## B5：種類別の音を、既存の通知音と整理する

**Files:** Create `src/presentation/bonus-audio.js`, `tests/audio/bonus.test.mjs`; Modify `src/audio/mixer.js`, `src/app.js`, `docs/sound-events.md`; Test `tests/audio/mixer.test.mjs`, `tests/ui/app-audio.test.mjs`。

**Interfaces:** Consumes BonusBatchと既存の重要通知。Produces `bonusPrecision`（tier5/10）, `bonusSteady`, `bonusMilestone`, `bonusQuick`, `bonusAllSuccess`, `bonusMulti` のいずれか1つの要求。B5は終了のclear音へ統合する。

- [x] B5.1 `one_pass_one_reward_cue`、`critical_cue_suppresses_bonus_without_replay`、`mute_zero_unavailable_still_shows_text`、`all_success_ending_one_fanfare`を先に試験化する。app接続では「10棟通過→11棟のtierUp」「最終pass→clear」「passの後で警告が決まる」の順序を再現する。
- [x] B5.2 既存mixerに短い合成音を追加する。pass内では獲得音を即再生せず、同じ確定イベント列とその更新処理の警告・ガイド・解放音を集め終わってから `choosePassCue` で0〜1個を選ぶ。最終passは終了処理側の1回のclear音へ渡す。既存mixerの発音数制限だけでは重複防止にならないため、通常pass/combo/milestoneと新bonusの呼出しもこの選択処理へまとめる。既存の音量・発音数制限・音楽を一時的に下げる処理を使い、追加の音声環境を作らない。
- [ ] B5.3 `node --test tests/audio/*.test.mjs tests/ui/app-audio.test.mjs` を実行し、初回操作・iOS中断復帰・消音中の設定維持を確認する。音素材の追加購入はしない。 **実装PR時点：自動試験は成功。iPhone実機の初回操作・iOS中断復帰・聞こえ方は未実施。**
- [x] B5.4 音と選択処理をコミットする。

## B6：結果の内訳・翻訳・訂正表示を統合する

**Files:** Modify `src/presentation/result-data.js`, `result-view.js`, `src/app.js`, `src/net/outbox.js`, `src/i18n/messages/{ja,en,es,pt-BR,zh-Hans,fr,de,ko,ru,it,zh-Hant,id,tr,vi,th}.js`; Create `tests/presentation/bonus-result.test.mjs`, `tests/net/bonus-status.test.mjs`; Test `tests/i18n/messages.test.mjs`, `tests/ui/record-status.test.mjs`。

**Interfaces:** Consumes BonusResultと任意のverifiedScore。Produces 結果画面の1つの得点表示モデル。ranking/localBestの比較値にはbonusを渡さない。

- [x] B6.1 `five_rows_precision_tier_counts`、`legacy_is_not_zero_bonus_run`、`reopen_language_change_no_reward_sound`、`verified_aux_correction_replaces_not_adds`を試験化する。1棟100%の正解120点を端末が115点と申告した例で、総得点120・bonus20・棟別第3要素120へまとめて訂正する。再表示、同じstatusのまま訂正値到着、no_rankの0棟、拒否／審査中／版不一致／不正な内訳を含める。
- [x] B6.2 app内の既存内訳とresult-view内の内訳は同じモデルを使い、画面上は1つの総得点・内訳へ整理する。B5は勲章を結果にも残す。従来の初クリア日付・自己ベスト・ランキング・共有文を維持する。
- [x] B6.3 本人用statusの正常なverifiedScoreを検証後に `records.verifiedScore` へ保存する。結果表示は元のsummaryに `score, bonus, perBuilding, maxCombo` を一括で重ね、棟別合計＋クリア＋B5と総得点の一致を検査する。元summary・送信body・bodyShaは書き換えない。statusが変わらなくても表示モデルを更新し、再表示時にも保存済み訂正値を使う。再加点・獲得音・補助点だけの警告・順位保留を起こさない。旧サーバーでフィールドが無い場合は既存の確定表示を維持する。
- [x] B6.4 `bonus.card.title`、`bonus.precision`、`bonus.precisionHigh`、`bonus.steady`、`bonus.milestone`、`bonus.quick`、`bonus.allSuccess`、`bonus.total`、`bonus.countPoints`、`bonus.precisionBreakdown`、`bonus.notEarned`、`bonus.legacy`、`bonus.help.*` を15言語へ追加する。短縮表示は別キーで用意し、条件説明も翻訳する。
- [x] B6.5 `node --test tests/presentation/*result*.test.mjs tests/net/bonus-status.test.mjs tests/i18n/messages.test.mjs tests/ui/record-status.test.mjs` をPASSにして結果・翻訳をコミットする。

## B7：再計算・実画面・公開前の検査

**Files:** Create `tests/e2e/bonus.e2e.mjs`, `tests/replay/fixtures/bonus-v3-clear.json`, `bonus-v3-thresholds.json`, `bonus-v4-pause.json`, `docs/acceptance/bonus-score-evidence.md`; Read B0の `tests/compat/fixtures/pre-bonus-v1.json` / `pre-bonus-v2.json`; Modify `tests/replay/replay.test.mjs`, `scripts/cross-engine-check.mjs`, `scripts/deno-replay-check.ts`, `scripts/make-replay-fixtures.mjs`, `docs/tuning/adjustment-table.md`, `docs/release/release-and-rollback.md`。

**Interfaces:** Consumes B0〜B6。各fixtureのrulesVersionで再計算し、v1固定の生成・照合を新版へ拡張する。旧fixtureを再生成して差を隠さない。

- [x] B7.1 Node／QuickJS／Denoでv1/v2/v3/v4の対応する照合例を再計算し、summary・bonus・rankAverageが一致することを確認する。既存6件v1・B0で固定したv2・新規v3/v4を明示的に読み、6件／全件v1の固定assertは版別一覧の検査へ変える。新しい期待値を作るときも旧fixtureを上書きしない。Denoのサーバー登録試験はv1/v3だけとし、v2/v4は単独判定の照合にする。新fixtureには実際の色履歴を使い、一致度差替えの単体試験と混同しない。
- [x] B7.2 402×700／402×874／874×402で、①〜⑤単独、①②③④同時、最終棟全種＋クリア、ガイド・警告重複、0棟、未獲得、旧結果、消音、動きを減らす設定を確認する。15言語の文字欠け・点数省略・操作との重なりを検査する。
- [x] B7.3 `node --test --test-concurrency=1 tests/e2e/bonus.e2e.mjs tests/e2e/guidance.e2e.mjs tests/e2e/result-actions.e2e.mjs tests/e2e/saved-run.e2e.mjs tests/e2e/online.e2e.mjs` を実行する。旧新対応・再送・最終棟の保存遅延を含める。
- [ ] B7.4 **自動ブラウザ部分は検証済み、実機未実施。** 20連戦・回転・停止復帰で表示1個・購読・描画予約・音声数が増え続けないこと、最大4ボーナスでも既存の音上限内であることを記録する。自動ブラウザとiPhone実機の結果を区別し、実機で表示・操作・音の重なりを確認する。
- [x] B7.5 各工程は関連試験だけを回す。統合時に `npm test`、`npm run test:sql`、`npm run check:engines`、`npm run build` を1回実施し、新しい変更・失敗がない限り重複実行しない。実行環境やDenoが無く未実施なら、その範囲を証跡へ明記する。
- [x] B7.6 公開手順を固定する：後方互換のDB追加→v1/v3を再計算できるサーバー→v1〜v4を読めるクライアント→新開始の切替確認。受付設定の既存値は消さずv3を追加し、停止設定を勝手に解除しない。公開・DB適用の実施は別途の承認範囲で行う。
- [x] B7.7 切戻しは新規v3受付を止め、新規単独の選択をv2へ戻す。v3/v4の読込・再計算コードと未送信記録は残す。受理済み新記録を読めない旧バイナリへ戻さない。すでに開始済みのv3結果は受け付ける。
- [x] B7.8 証跡・調整表・公開手順をコミットし、実装PRをレビューへ回す。未測定を合格にせず、今回の文書PRと実装完了を混同しない。

## 実装担当への引継ぎ

依存順はB0→B1→B2→B3→B4→B5→B6→B7。採点の正しさを先に固定し、演出担当は確定したインターフェースだけを読む。レビューで見つかった重大な問題は後工程へ送らず直す。

計画作成時の文書検査と敵対的レビューは[レビュー記録](../../reviews/2026-11-13-chameleol-bonus-score-review.md)、後続実装の検証と未実施範囲は[実装証跡](../../acceptance/bonus-score-evidence.md)へ記録する。実機確認・本番公開を自動試験の成功に含めない。
