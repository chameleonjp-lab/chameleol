# カメレオる 初回ガイドと練習 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本編の初回と明度の初解放時に、静止→移動の順で色合わせを案内し、同じ4段階を練習からいつでも試せるようにする。

**Architecture:** 初回プレーと明度の初解放を別々に管理する。静止案内は本編の時計を進めずに入力色を一時表示し、移動案内は通常の進行に重ねる。既存の色判定・座標変換を共用し、ガイドのために別の採点を作らない。

**Tech Stack:** ブラウザ標準ES modules、既存Three.js、IndexedDB、node:test、既存Playwright手順。実行時ライブラリを追加しない。

**Spec:** 本書の「1. 今回の確定要件」。基本仕様は[要件仕様書](../specs/2026-11-07-kamereoru-design.md)、演出との接続先は[80要件の計画](2026-11-11-chameleol-effects80-plan.md)。調査基準はPR #10の`33354097b619449e2b81b7599e94a874574cbeb8`。

## Global Constraints

- ①②は初回プレーのみ。③④は明度が初めて解放されたプレーのみ。別の新規プレーでは表示しない。
- ①〜④は一致度の数値と95%以上になる操作位置のガイドを表示し、練習からいつでも個別に確認できる。
- 本編50棟・1棟5000ms・評価区間[1500,4500)ms、得点、順位、出題、結果送信形式、既存の内部識別子を維持する。静止案内の実時間はゲーム時刻に含めない。
- 15言語、iPhone 17 Pro Safari、402×700／402×874／874×402、動きを減らす設定、簡易表示に対応する。
- PR #10は文書のみ。後続の実装はこの確定要件に従い、公開・実験場連携・本番データベース適用・マージは行わない。

## Review Focus

- 初回で20棟に届かず、後のプレーで初解放する場合：①②を再表示せず、③④だけ表示する（G1）。
- 同じ保存済みプレーの再開と新しい再プレー：途中のガイドは再開でき、完了済みの静止操作は繰り返さない（G1・G2）。
- 入力の瞬間・遅いフレームで20棟目の入口をまたぐ場合：評価開始前で確実に止まり、停止中の採点を増やさない（G2）。
- 明度が不正解でもパレットの目標位置には触れている場合：組合せ全体の一致度で判定し、95%達成と誤表示しない（G3）。
- 本編で明度未解放・短い画面・練習から帰る場合：4段階を試せ、初回記録・本編解放・既存の練習成績を書き換えない（G4）。

## 1. 今回の確定要件

開始前の説明カードだけで済ませず、ゲーム画面で実際に色を操作しながら案内する。今回の①〜④は、演出80件とは別の追加要件である。元No.・採用80件・除外20件・RICE値は変更しない。

| 段階 | 本編で表示する条件と場所 | 操作と表示 |
|---|---|---|
| ① | 初回プレーの1棟目 | その場に止まり、色を合わせる。一致度と95%以上の位置を表示。明度バーはロック |
| ② | 同じ初回プレーの2棟目 | 通常の移動時間内で色を合わせる。一致度と95%以上の位置を表示。明度バーはロック |
| ③ | 明度が初めて解放されたプレーの、解放後1棟目（現行20棟目） | その場に止まり、色と明度を合わせる。一致度とパレット・明度バーの95%以上になる組合せ位置を表示 |
| ④ | 同じ初解放プレーの、解放後2棟目（現行21棟目） | 一致度を見ながら、通常の移動時間内で色と明度を合わせる。95%以上になる両方の位置を表示 |

4段階の数値は現在の操作色と、その段階の対象棟の目標色から計算する。猶予中は既存の`state.matchUnits`がnullになるため、ガイド専用表示には既存`matchUnits(color,target,rules)`を使う。通常の採点値を書き換えない。①③の静止時間を無制限にし、②④を95%に達するまで止めたり延長したりしない。

ガイドがない通常本編では、従来どおり一致度の数値を隠す。95%は今回の案内の目安であり、通常の擬態成功の境目85%を変更しない。

### 実装時の補完方針

次は未指定部分を埋める実装方針で、ユーザーの指定と区別する。①③は現在の一致度が95%以上になったら「進む」を押せる。いつでも「この案内を省略」で通常進行へ戻れる。自動で正解色へ変更しない。②④はその棟を離れると終了し、未達でも次の棟へ進む。案内を省略しても、同じプレーの次段階は予定どおり表示する。

## 2. 初回・再プレー・保存済みプレーの扱い

「初回」は同じブラウザ保存領域内で判定する。①②と③④を、一つの`guideSeen`でまとめて消さない。①②の対象プレーは実際に本編を開始した時、③④の対象プレーは初めて`unlockBrightness`が発生した時に確定する。開始通信が失敗してゲームが始まらなかった場合は①②を消費しない。③の表示位置は20棟目入口で、解放イベントが発生する19棟目評価終了とは区別する。

初回で終了し②に届かなかった場合、次の新規プレーで②を補って表示しない。③の後に終了し④に届かなかった場合も同様。③④は、①②の対象プレーが終わった後でも初解放なら表示する。新規プレーの開始で対象フラグを戻さない。

保存済みの同じ`playId`を再開する操作は、新しい再プレーと区別する。静止案内の途中なら同じ段階へ戻し、完了済みなら繰り返さない。移動案内の途中なら残っている移動区間だけ表示する。別タブへ引き継いだ後の古い書込は、既存の所有世代の確認で拒否する。

既存ユーザーへは`flags.guideSeen`が真なら①②を消費済みとして引き継ぐ。`flags.brightnessPractice`または更新前の保存済みプレーの`brightnessUnlocked`が真なら③④も消費済みとして扱う。この移行は新しいガイド記録がない場合だけに行い、新しい記録があればそれを優先する。更新前から存在する保存済みプレーを、新しい①②の対象にはしない。`openingSeen`、`alertGuideSeen`、音・言語・自己ベスト・未送信結果は変更しない。

記録は既存kvへ`guide.progress.v1`を一つ追加する。形式は`{version:1,basic:{consumed,ownerPlayId,shownMask,staticDone},brightness:{consumed,ownerPlayId,shownMask,staticDone}}`。各グループの`shownMask`は2ビット、`staticDone`はそのグループの静止段階が終了／省略されたこと。所有プレーIDは既存の最大128文字、全体のJSONはUTF-8で1024バイト以内とする。色の操作履歴や毎フレームの保存は増やさない。

更新はグループ確保・段階の表示・静止終了の時だけとし、既存のrunとkvの取引で所有権を確かめて行う。別プレーによる上書きや古い書込で消費済みを未消費へ戻さない。保存不能時は同一画面・同一タブのメモリで継続し、既存の保存失敗案内を使う。ブラウザ保存を消した場合や別端末での非表示までは保証しない。

新形式のガイド記録の初期化だけは、本編の時計開始前に一度保存する。①②の対象外でも省略しない。これにより、更新前のプレーと「新形式で始めたが明度の確保がまだ保存されていないプレー」を区別する。復元時、新形式の記録があり明度は未消費なのに本編状態の`brightnessUnlocked`が真なら、過去のイベント再通知を待たず、そのプレーで明度グループの確保を補う。静止未完了の停止点は保持する。

## 3. 静止・移動・位置ガイド

①はゲーム時刻0ms、③は20棟目入口の95000msで止める。③の停止点は`(brightnessUnlockBuilding-1)*buildingMs`から求め、95000を各所へ直書きしない。19棟目評価終了94500msで明度は従来どおり解放する。No.55の解錠演出が終わるのを待って解放を遅らせない。

静止中は移動・警戒・得点・棟別評価・連続成功・本編音の進行を止める。パレットと明度バーの入力は`draftColor`へ反映し、同じ画面の体色・一致度を更新する。停止した`session.state`を直接書き換えない。「進む」または省略では同じ時刻で時計を開始／再開し、最後に選んだ色を既存の色入力として一度だけ渡す。③を終える／省略する時と確保不能時は、再開前に`setGuideStopAt(null)`で停止点を解除し、同じ入口で再停止しない。①を終えた時は将来の③の停止点を残す。停止中の一時色は保存せず、再開時は最後に記録された色から操作を続ける。

②は2棟目のゲーム時刻5000〜10000ms未満、④は21棟目の100000〜105000ms未満に通常進行へ重ねる。入力・採点・警戒は既存どおり。停止・画面非表示中は進まず、復帰時にまとめて時間を進めない。

95%以上の「場所」は、目標色そのもののパレット位置を輪で示す方法を採る。③④には目標明度の位置も示す。この組合せは100%一致を目指す位置であり、輪の周囲すべてが95%以上とは表示しない。位置は既存`pointFromHs`・`barFromV`で求め、再配置後の実際の入力値を既存の色判定へ戻して95%以上を確認する。無彩色・低彩度・円周端・明度バー両端にも対応する。

一致度は丸め前の値で`95*rules.match.unitsPerPercent`以上を判定する。94.999…%を達成扱いにしない。表示の丸めが95.00%になっても未達なら「あと少し」と示し、「進む」は有効にしない。新しい位置案内は入力を遮らず、指の位置と目標の輪を区別する。③④で明度が違えば、パレット位置だけ一致しても達成表示しない。

短い画面では案内を操作部の外に一行で配置し、壁と体の比較面を覆わない。ガイド中は背景小芝居と節目の長文より案内を優先する。No.11の地区名・No.55の解錠文を一つの案内枠へまとめ、別の大きなバナーを重ねない。

## 4. 練習でいつでも確認する

練習メニューに「初回ガイドを試す」を追加し、①色を合わせる／②移動中に色を合わせる／③色と明度を合わせる／④移動中に色と明度を合わせる、の4段階を直接選べるようにする。最初の訪問から③④も選べる。本編の明度解放や初回表示の状態に依存させない。

本編と同じ入力部品・数値・目標位置の表示を使う。①③は静止、②④は本編と同じ1棟5000msの移動を再現し、終了後は「もう一度／段階を選ぶ／練習に戻る」を選べる。時間切れでゲームオーバーにはしない。警察・得点・本編の開始通知は出さない。表示中の数値と目標位置は隠さない。

この4段階は既存の3問練習とは別に置く。3問練習の問題数・成功保持・履歴2回分・明度練習の既存解放条件は維持する。ガイド練習は本編の①〜④を消費せず、本編の明度や練習を解放せず、3問練習の履歴にも入れない。

## 5. 実装する工程

順序はG1→G2→G3→G4。演出計画のT0の画面寿命・停止処理を再利用する。G1〜G4を終えてからT11の解錠表示を結合し、T12の最終確認へ含める。実装と自動検証の進捗を以下へ反映する。Safari実機の検証は保留。

### G1：二つの初回記録を分ける

**Files:** Create `src/guidance/progress.js`; Modify `src/storage/store.js`, `src/storage/memory-store.js`, `src/app.js`; Test `tests/guidance/progress.test.mjs`, `tests/storage/guidance.test.mjs`。

**Interfaces:** `normalizeGuideProgress(raw,legacyFlags,legacyRun):GuideProgress`、`Store.claimGuideGroup(tabId,generation,{playId,group:'basic'|'brightness'}):Promise<{owned:boolean,progress:GuideProgress}>`、`Store.updateGuideProgress(tabId,generation,{playId,group,shownMask,staticDone}):Promise<GuideProgress>`。claimは未消費時だけ確保し、同じ所有プレーなら再開を許可する。

- [x] `first_run_only_basic`、`later_first_unlock_only_brightness`、`quit_before_second_does_not_reoffer`、`practice_does_not_consume`を先に作り、二つのグループの独立と対象プレーの固定を検証する。
- [x] `legacy_flags_skip_completed_guides`、`same_run_resume_keeps_progress`、`restore_unlocked_state_claims_missing_group`、`stale_generation_cannot_claim_or_write`、`memory_only_preserves_same_tab_progress`を追加する。明度解放後のsnapshotだけが保存され、claimが遅着中に別タブへ引き継がれる例を含める。1024バイト上限・無効値・保存失敗も確認する。
- [x] `node --test tests/guidance/progress.test.mjs tests/storage/guidance.test.mjs`で未実装による失敗を確認する。
- [x] 形式・移行・既存run所有権を使う取引とメモリ版を実装する。本編開始成立後・時計開始前に、basicの対象外でも正規化したガイド記録を保存する。その後basicを確保し、unlockBrightnessでbrightnessを確保する。保存済みプレーの復元では、本編状態が解放済みで新形式のbrightnessが未消費なら、同じclaim関数で確保を補う。更新前のプレーとして移行済みの場合は補わない。
- [x] 同試験を合格させ、差分確認後に`feat: track independent first-play guide groups`でコミットする。

### G2：評価開始前に止め、静止中の色を操作する

**Files:** Create `src/guidance/session.js`; Modify `src/game/session.js`, `src/app.js`; Test `tests/guidance/session.test.mjs`, `tests/game/guidance-clock.test.mjs`。

**Interfaces:** `GameSession.setGuideStopAt(t:number|null):void`を通常判定の外に追加する。`createGuidance({session,progress}):GuidanceController`は`view()`・`setDraft(color)`・`continue(perfNow)`・`skip(perfNow)`・`dispose()`を返す。`view()`は`{step:null|1|2|3|4,stationary,building,color,target,matchUnits,canContinue}`。

- [x] `stationary_first_keeps_game_time_zero`、`checkpoint_crossed_by_frame_or_input_stops_before_eval`、`long_stall_does_not_cross_checkpoint`、`resume_completed_static_does_not_repeat`を作る。静止中の得点・警戒・履歴末尾時刻が不変で、明度停止時刻が95000msであることを検証する。
- [x] `node --test tests/guidance/session.test.mjs tests/game/guidance-clock.test.mjs`で未実装による失敗を確認する。
- [x] ゲーム時刻を進めるframe・input・quitの全入口を停止点以内へ制限する。停止点へ達したら既存tickを適用してから既存pauseを同時刻で記録し、その入口で残りの色入力を処理しない。quitは終了要求を捨てず、制限後の同時刻で終了する。pause済みへの重複pauseは記録しない。判定エンジンへ新しいイベントや静止モードを追加しない。
- [x] ガイド記録を開始／再開前に読み、明度未消費の場合と、明度の所有プレーIDが今回と一致して静止未完了の場合には、時計開始前から③の停止点を設定する。unlockBrightness後のclaim書込を待ってから停止点を設定する実装は禁止する。同じ保存済みプレーでclaim済みなら再claimせず、保持した所有記録を使う。claimの遅着中でも入口で止め、確保できなければ案内を出さず通常進行へ戻す。画面世代・プレーIDの違う応答は無効にする。
- [x] 既存の開始前showGuideCardを今回のゲーム画面上の案内に置き換える。①は時計開始前、③は停止点到達後の非評価時にdraftを操作する。終了操作は同じ`perfNow`でstartClock→通常inputの順に一度だけ行い、既存pause/resume/color履歴で再構築できるようにする。draftと正式色の使い分けをstage・controls・一致度で統一する。進行中の②④はshownMaskが立っていても同じ所有プレーなら残り区間の表示を再開する。
- [x] `moving_guides_never_extend_building`、`pause_hidden_dispose_do_not_advance`、`guide_history_rebuild_matches_session`を追加し、同試験を合格させる。`feat: stop guided matching before evaluation`でコミットする。

### G3：4段階の数値・位置・案内を表示する

**Files:** Create `src/guidance/view.js`; Modify `src/ui/controls.js`, `src/ui/game.css`, `src/app.js`, `src/i18n/messages/*.js`; Test `tests/guidance/view.test.mjs`, `tests/e2e/guidance.e2e.mjs`。

**Interfaces:** `mountGuidance({host,controls,onContinue,onSkip}):{render(view),dispose()}`。controlsへ`setGuideTarget(target:null|HSV)`を追加し、輪と明度の目印を表示する。通常のポインター受付・色の値域は変更しない。

- [x] `guide_target_roundtrip_at_least_95`、`brightness_wrong_is_not_ready`、`rounded_95_is_not_ready_below_threshold`を先に作る。実際の座標丸めを含め、無彩色・低彩度・円周端・バー端を検証する。
- [x] `node --test tests/guidance/view.test.mjs`で失敗を確認後、既存の色判定と座標変換を使って表示を実装する。ガイドがない時は位置と数値を外し、disposeで入力・購読を解除する。独立した描画ループを追加しない。
- [x] 15言語の段階名・操作説明・あと少し・95%以上・進む・省略を追加する。2棟目の数値も必須とする。地区名・解錠表示との競合を一つの案内枠で処理する。
- [x] 同試験と`node --test --test-concurrency=1 tests/e2e/guidance.e2e.mjs`を合格させる。402×700／402×874／874×402で案内・数値・入力部品が同時に使え、動きを減らした時と簡易表示でも位置が分かることを確認する。
- [x] `feat: show matching values and target positions in guides`でコミットする。

### G4：練習で4段階を直接選ぶ

**Files:** Create `src/guidance/practice.js`; Modify `src/app.js`, `src/i18n/messages/*.js`; Test `tests/guidance/practice.test.mjs`, `tests/e2e/guidance.e2e.mjs`。

**Interfaces:** `createGuidePractice({step:1|2|3|4,seed,rules}):{view(),setColor(color),tick(dt),restart(),dispose()}`。本編用API・開始通知・Store.endRunは呼ばない。G3と同じviewの表示項目を返す。

- [x] `all_steps_available_before_unlock`、`practice_does_not_consume_or_unlock_main`、`moving_trial_ends_at_5000ms`、`existing_three_question_history_unchanged`を先に作る。
- [x] `node --test tests/guidance/practice.test.mjs`で失敗を確認後、4段階の選択と静止／移動を実装する。非表示・停止中はtickへ経過時間を足さず、再開時の長いdtを使わない。
- [x] 同試験と対象画面試験を合格させる。新規保存→①②→途中終了→再プレーで①②なし→初解放で③④→次プレーでは全案内なし、を通して確認する。同じ保存済みプレーの静止途中・完了後・移動途中からの再開も確認する。
- [ ] `node --test tests/practice/session.test.mjs tests/storage/resume.test.mjs tests/game/session.test.mjs tests/rules/engine.test.mjs tests/i18n/messages.test.mjs`と`npm run build`で影響先を確認する。10回連続で再プレーして案内が戻らず、描画・購読が増えないことをT12へ記録する。iPhone実機確認は実施日時と端末を記録し、代替ブラウザ確認と区別する。
- [x] `feat: replay all guided stages from practice`でコミットする。


## 6. 完了の判断

G1〜G4のゲームへの組込み、保存競合の試験、位置の実測、Chromiumでの画面試験、ビルドを実施した。iPhone実機確認は未実施。ガイドによる上達効果やランキングへの実際の影響は、現時点では分からない。既存の配点を変更せず、ガイドの有無を理由に記録を初期化しない。


実装記録：G1〜G4のコードと自動試験を追加した。Safari実機の確認日時・端末は未記入（未実施）。詳細は[演出・ガイドの検証記録](../../acceptance/effects80-evidence.md)。
