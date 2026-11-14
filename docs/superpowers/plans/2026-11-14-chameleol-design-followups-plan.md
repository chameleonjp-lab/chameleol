# カメレオる：輪郭・舌のダイヤ・称号と結果画像 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 輪郭と舌の追加に、通過棟数の称号・最高一致の主人公1体・スコア・ボーナス件数の結果カードと画像共有を加える。

**Architecture:** 表示専用の段階表・舌・結果解析・カード描画を分ける。E045/E051/E088/E097は除外し、結果解析は静止資料だけを返す。結果画面と共有PNGは同じカード描画を使い、既存の署名成績と採点エンジンを変更しない。

**Tech Stack:** JavaScript ES modules、Node.js 20以上、Three.js 0.170.0、既存IndexedDB、Canvas 2D、node:test、既存Playwright。

**Spec:** [改訂2の要件](../specs/2026-11-14-chameleol-design-followups-spec.md)、[Claude向け依頼](../../prompts/2026-11-14-claude-design-followups.md)。同名の補助スキルがない環境でも、指定の設計→実装→独立レビューを行う。

2026-11-14改訂2。実装基準mainは `9c1c06fdde1121334f9c0093182f873318e4f57c`、文書の改訂元はPR #19 head `5753cdb621181761d3d28e08d4e47232f47abce0`。これは実装予定で、下のゲーム試験は本書作成中に実行済みという意味ではない。

## Global Constraints

- 全50棟、採点・順位・出題の乱数・保存形式・署名summary・送信本文を見た目の変更で変えない。
- 規則v1〜v4の互換を維持する。Node.js 20以上、Three.js 0.170.0を維持する。
- 自動画面条件は402×700、402×874、874×402。自動ブラウザとiPhone 17 Pro Safari実機を区別する。
- 既存15言語を維持し、称号7件、カード、共有準備・失敗・記録なしも同じ15言語で扱う。
- 採用は元80＋今回16＝96件。E045/E051/E088/E097は除外し、再生・軌跡・物語・発見帳を実装しない。
- 街7枠、装飾24、小芝居1組3枚、粒子8、成功リング1、追加描画呼出12・形16・画像4、圧縮1.5MiB・展開後16MiBを新旧合計で守る。
- 小芝居は最大6回・開始間隔15秒以上。中間配達の1回を開始時から確保する。
- mainへ直接pushせず、本人に代わるマージ、本番DB変更・無断公開・実験場掲載を行わない。

## Review Focus

| 条件 | 担当・確認 |
| --- | --- |
| 線の10/11・39/40境界、ガイド位置と対象棟 | T1：対象棟を正にし、現在の40棟値を維持 |
| 舌の途中停止・割込み・目と顎の累積ずれ | T2：姿勢の所有と復元、1000周期 |
| 称号の9/10・49/50境界、0棟、不正棟数 | T7：今回の確定通過数だけで判定 |
| ベスト棟の丸め同率、実際の体色欠損、ボーナス種類数と件数の混同 | T3/T7：丸め前比較、実色、5種count合計 |
| 訂正・言語変更後の古い画像、準備待ちで共有の操作期限を失う | T7：revision、事前生成、タップ直後にFileを渡す |

## ファイルと順序

| 工程 | ファイル | 責任 |
| --- | --- | --- |
| T0 | README、既存acceptance/tuning/release資料 | 最新状態と採否 |
| T1 | 新規scene/chameleon-outline.js、既存chameleon28.js/stage.js/street.js | 輪郭8段階 |
| T2 | 新規scene/tongue-rig.js/travel-tongue-motion.js/travel-tongue.js、既存showcase-tongue.js/street.js/app.js | 10秒の舌とダイヤ |
| T3 | 新規presentation/result-evidence.js/result-evidence-view.js、既存result-data.js/result-view.js/app.js | 静止結果と実色 |
| T4 | 新規presentation/cameo-reservations.js、既存catalog.js/street-accents.js、素材生成スクリプト | 背景5案 |
| T5 | 既存presentation/actor-reactions.js、scene/characters.js/street.js | 警察2案 |
| T6 | 新規presentation/precision-badge.js、既存hud-view.js/bonus-view.js/app.js | 精密札のみ |
| T7 | 新規presentation/result-card-data.js/result-card-view.js/result-portrait.js/result-model.js、ui/share-card.js、既存result-view.js/ui/share.js | 称号・主カード・PNG・共有 |
| T8 | 新規storage/presentation-extras.js、既存store.js/memory-store.js | 札と小芝居の保存 |
| T9 | 新規acceptance/design-followups-evidence.md、既存端末・公開・対応表 | 統合と実機 |

T0後、T1→T2、T3、T8を分担する。T8完了後にT4/T6、T4後にT5、T1/T3後にT7、最後にT9。同時編集する実装担当は最大2名。`app.js/street.js/result-view.js/catalog.js` の担当は各時点1名に固定する。翻訳先は `src/i18n/messages/{ja,en,es,pt-BR,zh-Hans,fr,de,ko,ru,it,zh-Hant,id,tr,vi,th}.js`。

## T0：最新mainと未完了項目を揃える

**Files:** 既存 `README.md`、`docs/acceptance/results.md`、`docs/acceptance/effects80-evidence.md`、`docs/tuning/adjustment-table.md`、`docs/release/release-and-rollback.md`。

**Interfaces:** 入力＝main SHA、各PRのmerge状態、CIと既存証拠。出力＝実装済み・自動確認済み・実機未確認・配備不明を区別した一覧。

- [ ] 最新mainと開いているPRを読み、基準から増えた変更を計画へ反映する。#14/#16/#18の機能を再実装しない。
- [ ] READMEのボーナス・80件・ガイドの「未実装」を、対応する実装と証拠に沿って更新する。古い作業記録は書き換えて成功に見せない。
- [ ] 公開版の状態を取得できる場合は配布版とcommitを記録する。取得できなければ「公開状態未確認」とし、古い手順の「未公開」を現在の事実として転記しない。
- [ ] 基準の `npm test` を一度実行し、成功・失敗・DB専用skipを別々に記録する。実装工程の初回基準であり、この文書PRのために全試験を再実行する指示ではない。
- [ ] 文書だけの差分をcommitする。以降の変更先・テスト担当を明記する。

## T1：段階ごとの輪郭

**Files:** 新規 `src/scene/chameleon-outline.js`、変更 `src/scene/chameleon28.js`、`src/scene/street.js`、`src/scene/stage.js`。新規 `tests/scene/chameleon-outline.test.mjs`、`tests/e2e/design-outline.e2e.mjs`。

**Interfaces:** `outlineForBuilding(building:number): {stage:number,thickness:number,rgb:readonly number[]}`、主人公の `setOutlineStyle(style):void` を追加する。表は要件DES-02と同じ8段階。1〜50の整数以外は段階0へ戻す。従来の `createOutlineMaterial(thick=0.085)` はデフォルトの色0.1059を維持し、呼出側が明示した材質だけ変更する。

- [ ] 太さ `[.0255,.034,.0425,.051,.0595,.068,.0765,.085]`、区間、色を厳密に照合するテストを追加する。10/11、15/16、20/21、25/26、30/31、35/36、39/40、50、不正入力を含める。
- [ ] 主人公の変更前後で警察の線・内部黒線・胴の色が同一であるテストを追加する。現在の40棟モデルの線の太さ・色の値を固定して照合する。
- [ ] `node --test tests/scene/chameleon-outline.test.mjs` で未実装による失敗を確認する。
- [ ] `uOutlineRgb` を不透明な輪郭材質へ追加し、既存インスタンスの値だけ更新する。段階が同じなら再設定しない。通常本編は `view.building`、ガイドは対象棟、簡易表示は同じ表を使う。
- [ ] 同じコマンドで全対象成功を確認する。自動ブラウザでsceneTと棟番号が違う静止ガイド、39→40、再開直後、簡易表示を撮影・検査する。
- [ ] 明暗各3色で比較面の同一画素を採取し、線の変更を除いた中央のRGBが基準版と一致することを確認する。目視では細線が消失しないことも確認し、数値と画面の両方を残す。
- [ ] 対象ファイルをcommitし、独立レビューを通す。

## T2：移動10秒周期の舌とダイヤ

**Files:** 新規 `src/scene/tongue-rig.js`、`travel-tongue-motion.js`、`travel-tongue.js`。変更 `showcase-tongue.js`、`street.js`、`src/app.js`。新規 `tests/scene/travel-tongue-motion.test.mjs`、`travel-tongue.test.mjs`、`tests/e2e/travel-tongue.e2e.mjs`。既存 `tests/scene/showcase-*.test.mjs` と `tests/e2e/home-idle.e2e.mjs` は維持する。

**Interfaces:**

- 共通形状：`createTongueRig(hero)` が `apply(frame)`, `writeTip(outPosition,outTangent)`, `getLocalEnvelope(outBox)`, `reset()`, `dispose()` を返す。既存のホーム用公開名は薄いwrapperとして残す。
- 時間制御：`createTravelTongueMotion()` が `sample({t,moving,running,hidden,drawable,blocked,reducedMotion},outFrame)` と `reset()/dispose()` を返す。tはゲーム時計msでありsceneTではない。
- 描画：`createTravelTongue(hero)` が `prepareBase()/apply(frame)/reset()/dispose()` を返す。`prepareBase()` は基本歩行前に前フレームの追加姿勢だけを除く。
- appから本編へ `presentation.moving` を渡す。`session.running && !guideView.stationary` を基準にし、実際の移動と無関係な `walking` の見た目だけで数えない。

- [ ] 9,999msで未発生、10,000msで1回、20,000msで2回のテストを追加する。棟切替でリセットしない、1,400msの段階境界、抑止時は消費して次の10秒へ進む、同時刻の反復sampleで再発生しないことを検査する。
- [ ] 停止・非表示・描画停止を挟む時、前後のサンプルで停止区間を加算しないテストを作る。負・逆行・非有限のtは採用せず、再開の最初のフレームは差分0。1,000ms以上の飛びはアプリの自動停止に従い、取りこぼした回数を再生しない。
- [ ] 1000周期の姿勢復元、頭と目の既存反応、宝石演出の割込み、終了、取消、二重dispose、材質を借りる側の破棄0回を検査する。指定した対象テストを実行し、未実装の失敗を確認する。
- [ ] 既存ホームの形状・姿勢復元を共通の形状処理へ移す。ホームの時間制御は移さない。先端の実座標・接線をその同じ形状計算から得て、見た目だけ別曲線でダイヤを置かない。
- [ ] 舌用ダイヤは既存形状・材質を共有した別ノードにする。追加2描画（ダイヤと光る内側）を予算へ入れる。表示中の既存宝石状態は保存して抑止し、取消・収納で既存反応の要求に戻す。
- [ ] 舞台の順序を、前補正解除→歩行→既存反応→周期演出へ揃える。既存反応中・危険・ガイドの抑止はDES-06どおり。通常停止と非表示は時点保持、離脱・終了・描画喪失は収納取消とする。
- [ ] 新規対象3ファイルのテストと `node --test tests/scene/showcase-motion.test.mjs tests/scene/showcase-tongue.test.mjs tests/scene/showcase-lifecycle.test.mjs tests/scene/presentation-clock.test.mjs` を実行する。全対象成功、skipなしを確認する。
- [ ] `node --test --test-concurrency=1 tests/e2e/travel-tongue.e2e.mjs tests/e2e/home-idle.e2e.mjs tests/e2e/guidance.e2e.mjs` で本編の10秒・ホームの900ms・ガイドを分けて検査する。3寸法でダイヤ込みの8px余白を測定する。
- [ ] commitし、見た目・時刻・資源所有の独立レビューを通す。

## T3：静止した振り返りとベスト棟の実色

**Owns:** E072/E076/E084/E086/E087、RES-03/04の色データ。

**Files:** 新規 `src/presentation/result-evidence.js`、`result-evidence-view.js`、変更 `src/app.js`、`presentation/result-data.js/result-view.js`。新規 `tests/presentation/result-evidence.test.mjs`、`tests/e2e/result-evidence.e2e.mjs`。

**Interfaces:** `prepareResultEvidence(input,{signal,onYield,revision})` は `Promise<{available,reason,data,revision}>`。inputは `{rulesVersion,generatorVersion,seed,history,endedAtT,targets,originalSummary,displaySummary}`。dataは `{frames3,finalColors,alertPoints,alertMarks,recovery,longestStreak,visualSamples}`。`visualSamples` は通過棟ごと最大1件、`{building,hsv,matchUnits,from,to}`、正の評価時間区間だけを採用する。利用者向けreader/seek/play/pause/speed操作を公開しない。

- [ ] v1/v2旧例とv3/v4ボーナス例、同時刻入力、棟境界、0棟・全50棟、pause/resume、quit、公式訂正を固定試験へ追加する。入力をfreezeし、元summaryと履歴を変えないことを検査する。
- [ ] `finishPlay`で終了済みsessionから `meta.rulesVersion/generatorVersion/seed`、`recorder.entries`、`state.endT ?? state.t`、`game.course.targets` を取得し、`persistEnd`の元summaryと組み合わせてメモリ専用の `lastResult.evidenceInput` へ渡す。秘密やsnapshot全体は渡さない。大量コピーはここで行わず、画面表示後にT3の分割処理へ移す。旧結果・ホーム直帰・再開始では保持を解除し、通常結果で取得できることをE2Eで検査する。
- [ ] 通常終了、persistEndの保存失敗、v1/v2途中再開からの終了で、session破棄後も今回の実色が得られるE2Eを置く。同じ結果の言語変更・再表示はメモリ上context/計算済み資料を使う。アプリ再起動後の過去結果に履歴がなければmissingとし、保存先のsummaryだけから再構成しない。本編保存・outboxの形式は増やさない。
- [ ] 3コマは終了T−2000/T−1000/Tを0へ制限。グラフは棟末＋終了点、最大50点、0棟終了でも終点1個を持つ。代表の警察登場・2人化・回復は各版と既存登退場条件に従い最大3印。
- [ ] 最長区間は棟平均の実値85%以上、同率は早い区間。回復は警戒70%→35%。欠損なら該当資料だけ利用不可にする。対象試験を実行し、未実装による失敗を確認する。
- [ ] 検証・デコード・コピーから1000件または4msでyieldする。最大20万入力、完全状態索引320個以下。既存stateFromHistoryを途中時刻読取へそのまま使わず、正規規則を変更しない。
- [ ] `visualSamples` は各評価区間の実色を処理する時に一度だけ集計する。正の時間を持つ最大瞬間一致の区間、同率は最初、同時刻の途中色は除外。目標色を代入しない。
- [ ] 最高平均の棟の選択はT7が表示成績から行う。途中再開・旧結果で実色を復元できなければmissingを渡す。ベスト棟平均と代表色の瞬間一致を別項目として保持する。
- [ ] 公式訂正でrevisionを増やし、旧解析をabort。元成績と表示成績に整合する派生だけ採用する。遅い結果はplayId/画面世代/revisionで捨てる。解析に失敗しても主成績・再プレイは使える。
- [ ] 保存・送信・実績・ゲーム開始・音の呼出0回、動く再生UIなしを試験で確認する。対象単体と `node --test tests/e2e/result-evidence.e2e.mjs` を実行し、commitと独立レビューを行う。

## T4：背景5案と中間配達の予約

**Owns:** E020/E056/E067/E068/E069。

**Files:** 新規 `src/presentation/cameo-reservations.js`。変更 `catalog.js/street-accents.js/scene/street.js`、`scripts/render-street-atlas.mjs` と生成素材。新規 `tests/presentation/cameo-reservations.test.mjs`、`extended-street.test.mjs`、`tests/e2e/extended-street.e2e.mjs`。

**Interfaces:** `createCameoReservations({playId,restore,claimStart})` が `reserve/start/cancel/tick/stats` を返す。stateは `{count,lastStartedAt,rngState,reservedMidpoint,midpointUsed}`。T8の保存取得に成功して初めて絵を出す。物語の章情報・発見通知は追加しない。

- [ ] 最大6回・15秒間隔・1組3枚、配達用1回の開始時予約を検査する。0/15/30/45/60/75秒に通常6回を消費しようとしても5回までに抑える。
- [ ] 110000〜126500msの時間予約、機体最大1500ms、期限切れの静止旗、通常再開条件、5回後の保存復帰、欠損復帰の新規抽選停止をテストする。失敗確認後に実装する。
- [ ] 踏切の遮断→後端通過→開放、水源と渦の位置、ロボットの塗装→足の汚れ→見下ろす順序、鳥と荷物の同期と屋根接触を固定姿勢で検査する。
- [ ] 新しい絵は制作スクリプトで再現可能に作る。粒子・画像・形・描画呼出は既存との合計上限で計測する。文字や仮の四角を完成素材にしない。
- [ ] catalogと対応表は実装した採用IDだけ更新し、除外4件は除外のまま保持する。元80件を削って96件に合わせない。
- [ ] 対象単体と新規E2E、既存catalog/scope試験を実行する。3寸法・停止・終了・再利用後を確認し、commitと独立レビューを行う。

## T5：警察の聞き込みと足跡

**Owns:** E034/E039。

**Files:** `src/presentation/actor-reactions.js`、`src/scene/characters.js/street.js`。新規 `tests/presentation/police-investigation.test.mjs`、`tests/e2e/police-investigation.e2e.mjs`。

**Interfaces:** 既存createActorReactionsを維持し、表示用補正をroot・影・道具・光へ一括適用する。正式な追跡位置・警戒へは反映しない。

- [ ] 警察1→0/1→2、停止、終了、棟枠再利用で補正が残らないこと、道具の同時表示が最大1個であることを検査する。
- [ ] ノックの手・足の接地、足跡を見る→迷う順を固定姿勢で検査し、失敗確認後に実装する。
- [ ] 足跡を装飾24枠へ含め、実際のプレイヤーの経路として保存しない。
- [ ] 新規対象と既存 `tests/presentation/actor-reactions.test.mjs` を実行し、同じ入力で警戒・発見時刻・成績が一致することを確認する。画像証拠、commit、独立レビューを残す。

## T6：ほぼ完全一致の札だけを追加する

**Owns:** E044。E045は対象外。

**Files:** 新規 `src/presentation/precision-badge.js`、変更 `src/app.js`、`presentation/hud-view.js/bonus-view.js`。新規 `tests/presentation/precision-badge.test.mjs`、`tests/e2e/precision-badge.e2e.mjs`。

**Interfaces:** `createPrecisionBadge({claim})` の `consume({building,from,to,matchUnits,evaluationEnd,unitsPerPercent})`。claimはT8の `claimPrecisionBadge(playId)`。

- [ ] 97.999/98.000%、499/500ms、途中未達、棟境界、4000ms開始→次描画4501msで4500msまでの達成を拾う試験を追加する。
- [ ] 追加得点0、1playId1回、精密ボーナスとの同時表示は一つにまとめること、保存失敗時は永続化成功としないことを検査する。
- [ ] 失敗確認後に実装する。判定は評価区間の時間から計算し、表示フレーム数で代用しない。軌跡の入力購読・線・タイマーは作らない。
- [ ] 対象と既存bonus-view、bonus E2Eを実行し、警告・ガイドと重ならないことを確認してcommitと独立レビューを行う。

## T7：称号・4要素の結果カード・画像付き共有

**Owns:** RES-01〜08、E075/E090/E094。

**Files:** 新規 `src/presentation/result-card-data.js`、`result-card-view.js`、`result-portrait.js`、`result-model.js`、`src/ui/share-card.js`。変更 `src/app.js`、`presentation/result-data.js/result-view.js`、`ui/share.js`、`ui/presentation.css`、15辞書。新規 `tests/presentation/result-card-data.test.mjs`、`result-card-view.test.mjs`、`tests/ui/share-card.test.mjs`、`tests/e2e/result-card.e2e.mjs`。

**Interfaces:**

- `rankForPassed(passed): {rankKey,from,to}|null` はRES-02の7区分。不正な値はnull。
- `selectBestVisual({summary,rules,visualSamples}):{building,hsv,average,instantMatch}|null` は実値比で選ぶ。未知版や実色欠損はnull。
- `buildResultCardModel({displaySummary,rules,visualSamples,evidenceState,locale,revision,verificationState})` は不変の `{revision,passed,rankKey,totalScore,bonusCount,countState,hero,verificationState}` を返す。countStateはknown/missing。heroはpending/matched/missingと対象棟・実色を持つ。evidenceStateはpending/ready/failedで、pendingから共有用Fileは作らない。
- `createResultPortrait({hero,signal})` は既存モデルから `Promise<{image:CanvasImageSource,dispose()}>` を返す。
- `drawResultCard(canvas,{model,portrait,locale})` は画面とPNGの共通描画。
- `prepareResultCard({canvas,revision,signal}):Promise<{blob:Blob,file:File,revision}>`。
- `sharePreparedResult({prepared,currentRevision,text,url,navigator}):Promise<'shared'|'cancelled'|'unavailable'|'failed'>`。共有の成功は投稿成功としない。

- [ ] 称号の0/1/9/10/19/20/29/30/39/40/49/50、負・小数・51・NaN、今回と自己ベストの違いを試験化する。50棟と全クリアが矛盾する入力は確認中にする。
- [ ] ベスト棟は通過済みの有効tupleだけを候補にし、matchSum/evalMsをBigIntの交差積で比較する。丸め同率と真の同率、早い棟、v1〜v4の単位差、正の評価時間、実色欠損を試験化する。平均値から体色を逆算しない。
- [ ] ボーナス5行のcount合計と重複のないawards ID数を照合する。精密の5/10点を1件、種類数5と獲得件数を区別し、現行完全成功の156件・7280点を別値として検算する。対応版の0と旧版missingも区別する。追加得点のないE044の札だけでは件数を増やさない。
- [ ] 新規data単体で失敗を確認してから上記の純粋関数を実装する。元summaryは変更せず、applyVerifiedScore後の同じ表示用コピーから称号・総点・件数を作る。
- [ ] 結果の一番上に主カードを表示する。1200×630で左に主人公、右に称号とスコア、下に通過棟数とボーナス件数。主成績・再プレイは解析待ちにせず、準備中はキャラクター部分だけ明示する。E075等の追加資料は任意パネルへ置く。
- [ ] 主人公はNo.28・実HSV・当該棟の線で静止撮影する。ホームの色循環・ランダム色・壁色の代入は使わない。立体描画器は全画面切替を通じ同時1個。主カードの静止画生成後は不要な描画器を解放し、E090を開く時の所有を移す。
- [ ] 0棟・履歴なし・画像素材失敗・描画不能では、使える既存初期色素材＋記録なし、またはキャラクター準備失敗を示す。最高一致と偽る色を出さず、スコアと再プレイを維持する。
- [ ] フォントと主人公画像の準備後に同じcanvasからPNGを生成し、画面のカードと画像が同一の4要素を持つことを数値と実画像で検査する。15言語・長い称号・0/50棟・大きい得点・件数missingの文字切れを確認する。
- [ ] PNGは利用者のタップ前に一度準備する。代表色解析がpendingの仮画像からはFileを作らない。記録なしが確定したmissingでは説明付きカードを作れる。ランキングの確認待ちは画像にも確認中と示す。タップ時にrevisionが一致するFileをcanShare({files})とcanShare(全payload)の両方で確認し、その操作内でshareへ渡す。タップ後の待機や画像生成完了を自動共有のきっかけにしない。準備中は状態を表示して主画像共有を無効にする。
- [ ] 公式訂正・verificationStateの変化・言語変更・新結果・画面離脱でrevisionを増やして旧生成をabortし、古いFile/Object URLを無効化する。得点が同じpending→officialでも新画像から確認中が消える試験を置く。生成中の旧Promise完了後も新画像を上書きしない。
- [ ] ファイル非対応、共有候補なしを示すAbortError、canShare=false、連打、DataError、フォント失敗、PNG生成失敗を試験化する。共有先一覧やX選択結果を取得する存在しないAPIを作らない。AbortErrorは取消との区別ができない場合も通常復帰にし、自動で本文の別窓を起動しない。利用者がXを見つけられず戻った場合にも使える「画像を保存」と「本文でXを開く」の明示タップを用意し、黙って画像なしに切り替えない。
- [ ] E090は横ドラッグ8px以上でタップ反応を取り消し、縦はページへ譲る。主カードの画像は触っても回転しない。結果の模型と一度に一パネルだけ開く。
- [ ] 対象3単体と `node --test --test-concurrency=1 tests/e2e/result-card.e2e.mjs tests/e2e/result-actions.e2e.mjs` を実行する。ホームのX共有も維持する。3画面の実画像を残してcommitと独立レビューを行う。

## T8：精密札と小芝居の状態を保存する

**Owns:** EXT-03、T4/T6の保存契約。発見帳は作らない。

**Files:** 新規 `src/storage/presentation-extras.js`、変更 `store.js/memory-store.js`。新規 `tests/storage/presentation-extras.test.mjs`。

**Interfaces:** `claimPrecisionBadge(playId):Promise<boolean>`、`loadDirector(playId):State|null`、`claimCameoStart({playId,tabId,generation,state}):Promise<boolean>`。store/memory-storeで揃える。StateはT4の5フィールド。

- [ ] 同時2claimでtrueは1回、別タブの古い世代は拒否、5回後の再開は追加1回以下、破損・保存拒否で成績を保つ試験を先に失敗させる。
- [ ] 専用キーを32KiB・直近32playId以内に制限し、開始前に所有者付き取引で枠を取得する。期限切れの取得枠は消費済みにし、旧playIdの遅い保存を採用しない。
- [ ] DB_VERSION=1と既存ストア・本編snapshot・送信本文を維持する。不要な旧演出記録の整理で成績やoutboxを削除しない。
- [ ] 対象と既存storage/presentation、resume、net/outbox試験を実行し、commitと独立レビューを行う。

## T9：96案と新結果の統合・実機へ渡す

**Files:** `README.md`、`docs/acceptance/design-followups-evidence.md`、`docs/device-test-procedure.md`、tuning/release資料、旧案対応表。

**Interfaces:** 証拠列は `commit/requirementId/evidence/automated/device/published/blockedReason`。予定・自動・実機・公開を混同しない。

- [ ] 採用16と除外4、元80、DES8/EXT4/RES8/FOLLOW8の44要件割当を照合する。除外4機能のファイル・入力購読・UIが増えていないことを確認する。
- [ ] 工程ごとは対象試験に絞り、最後のコード変更後に `npm test`、`npm run build`、`npm run test:e2e` を一度ずつ完了する。既存CIを弱めず、失敗試験をskipしない。文書だけの改訂でゲーム全件を再実行したとは書かない。
- [ ] 3画面寸法、4ガイド、20/40/50棟、危険、停止、通常練習、結果再表示、公式訂正、動きを減らす、描画不能を統合確認する。
- [ ] v1〜v4の途中保存と未送信を使い捨てデータで復元し、成績・識別値・送信回数・旧版入口を保つ。本番データの初期化で通さない。
- [ ] iPhoneで開ける候補URLと配布版を揃える。本人の実機でSafari→X共有画面→X選択→PNG1枚が投稿画面へ添付され、4要素が画面と一致することを確認する。投稿そのものは本人が決める。X未導入・共有取消・帰還・画像保存も確認する。
- [ ] 実機を使えなければOS/Xアプリ版・添付結果を未確認と記録し、端末から実行できる手順を渡す。ブラウザのAPIモック成功だけでX添付済みとしない。
- [ ] 同条件の基準版と装飾版で開始直後と最終地区を各30秒測る。95百分位33.4ms以下・中央値悪化10%以内を目標とし、取れないJSヒープは未測定とする。結果画像生成も入力・再プレイを止めないか測る。
- [ ] Fableが実画像・集計・共有状態を最終判定し、調整コードはSonnetへ戻す。修正の対象試験と再確認が通ったcommitで実装PRを提出する。マージ・本番反映は本人へ委ねる。

## 初版からの変更

E045/E051/E088/E097の実装を取り消し、再生用readerの公開・物語の章時計・発見保存・軌跡の購読を削除した。静止資料に必要な結果解析は残す。E094を主結果カードへ統合し、称号・最高一致1体・スコア・ボーナス件数の自動PNGと主Xボタンからの共有へ変えた。
