# カメレオる 追加演出80要件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 除外20案を含めずに80要件の見た目を実装し、既存の成績・入力・保存を保ったままゲーム中と結果の変化を増やす。

**Architecture:** 判定エンジンへは変更を加えず、読み取り専用の表示用処理を`src/presentation/`に集める。街は既存の7棟と共用部品を拡張し、結果は固定画像とDOMで表示する。画面ごとの停止処理と小さな成績保存を共通化する。

**Tech Stack:** Node.js 20以上、ブラウザ標準ES modules、Three.js 0.170.0、IndexedDB、node:test、既存のPlaywright手順。新しい実行時ライブラリは追加しない。

**Spec:** [確定仕様書](../specs/2026-11-11-chameleol-effects80-spec.md)、[80要件の対応表](../../requirements/chameleol-effects80.json)。基準コミット`858a4426327594a05ca810ee6156f8c2a0d5ad16`。

**追加計画：** [初回ガイドと練習](2026-11-11-chameleol-guided-play-plan.md)のG1〜G4を同じPRへ追加した。①②は初回プレー、③④は明度の初解放プレーで実施し、4段階を練習からいつでも選べる。演出80件の数と対応表は維持する。

## Global Constraints

- 本編50棟・1棟5000ms・評価区間[1500,4500)ms・既存の色判定・得点・順位・入力方法は変更しない。
- `kamereoru` / `KAMEREORU_`、DB名・DB_VERSION=1・既存保存キー・rulesVersion・generatorVersion・decorationVersion・historyFormat・結果送信形式を維持する。
- 除外IDは20,34,39,44,45,51,56,67,68,69,72,75,76,84,86,87,88,90,94,97。再生・グラフ・画像書き出し・収集帳を追加しない。
- 対応言語はja,en,es,pt-BR,zh-Hans,fr,de,ko,ru,it,zh-Hant,id,tr,vi,th。既存の言語解決と英語フォールバックを維持する。
- 壁・胴の比較面・パレットに光源・影・半透明の装飾を重ねない。装飾の操作は色入力を奪わない。
- 主対象はiPhone 17 ProのSafari。402×700、402×874、874×402で操作と成績の読み取りを確保する。
- 各演出専用のrequestAnimationFrameとsetIntervalを追加しない。ゲームの既存ループを使い、結果の数え上げ用だけ一つまで許可する。
- 公開・DB適用・実験場への連携・マージは今回行わない。追加料金の発生するサービスや実行時の画像生成を使わない。

## Review Focus

- 再プレイ連打・遅い開始応答：開始は1回、開始失敗では再操作でき、前画面の動きが残らない（T0）。
- 0棟・不正な棟別データ・同率：未通過や無効値を最高・最低へ混ぜず、0除算しない（T1）。
- 別タブ引継ぎ・重複終了・保存失敗：古い書込を拒否し、既存の成績と未送信結果を守る（T3）。
- 正式順位の遅着・古い画面への応答：今回の順位と名前のベスト順位を混同しない（T4）。
- 短い画面・動きを減らす設定・WebGL不可：操作面を覆わず、動作完了待ちで止まらない（T2・T10・T12）。

---

## 1. 作業範囲と現在の構造

計画を追加したPR #10は文書のみです。実装の進捗は工程ごとのチェック項目へ反映し、未実施の項目を完了扱いにしません。T0の実装・検証記録は[こちら](../../acceptance/effects80-t0-evidence.md)。T1〜T11・G1〜G4の実装と個別自動検証を追加済み。T12のSafari実機の性能・ヒープ測定は保留です。

| 現在の場所 | 確認した内容と変更方針 |
|---|---|
| `src/app.js` | 既存のsession.on、refreshHud、stage.update、showResultへ小さく接続。全体の作り直しはしない |
| `src/rules/v1/engine.js`・`course.js` | summary・rankAverage・areaOfなどの読み取りだけ。判定コードを変更しない |
| `src/scene/street.js` | 7棟の表示枠、InstancedMesh、既存stats・sampleComparisonを再利用 |
| `src/scene/characters.js`・`chameleon28.js` | 既存モデルへ姿勢を追加。No.24は尻尾の形状追加が必要で、単なる回転だけで済ませない |
| `src/scene/effects.js` | 星56・点56を維持。追加は制限付きの共用部品 |
| `src/scene/stage.js` | Threeと簡易表示の両方へ同じ接続口を持たせる |
| `src/storage/store.js` | DB_VERSIONを上げず、既存kvへ任意の表示用集計を終了時に書く |
| `scripts/build.mjs` | src・vendorを指紋化してコピーする。assetsはcredits.mdのみなので新しい画像はsrc配下へ置く |

## 2. 作るファイルと責任

| 新規ファイル | 担当すること |
|---|---|
| `src/presentation/scope.js` | 画面の有効性、時計、予約、入力・購読の解除 |
| `src/presentation/events.js` | 既存状態を読み取った表示用データの作成 |
| `src/presentation/catalog.js` | 80要件の元No.と表示上限・抽選・同時実行の制御 |
| `src/presentation/result-data.js` | 既存成績から最高・最低・地区・札・せりふを作る純粋関数 |
| `src/presentation/result-view.js` | 結果のDOM・静止画・短い数え上げ |
| `src/presentation/stats.js` | 小さな追加成績の検証・更新案・比較。DBへの直接書込はしない |
| `src/presentation/street-accents.js` | 地区部品・装飾・背景小芝居の共用表示とスロット後片付け |
| `src/presentation/actor-reactions.js` | 主人公と警察の動作の選択・競合処理 |
| `src/presentation/hud-view.js` | 成功帯・連続成功・旗・状態札のDOM更新 |
| `src/presentation/assets/atlas.webp`・`src/presentation/assets/result-atlas.webp`・`src/presentation/assets/atlas.json` | 画像2枚と領域定義。表示時は同じ画像を共用 |
| `src/ui/presentation.css` | 追加表示と画面幅・動きを減らす設定。既存game.cssの先頭からCSSの@importで読む |

## 3. 工程間の接続口

ここで示す型はJavaScriptのJSDocで定義します。新しい型検査・ビルドライブラリは追加しません。

```text
PresentationScope = createPresentationScope({id:string, kind:'game'|'result'|'ending'})
  own(cleanup:()=>void):void
  schedule(key:string, delayMs:number, callback:()=>void):void
  tick(activeMs:number):void
  isCurrent(id:string):boolean
  dispose():void

PlayView = {playId,t,passed,building,phase:'eval'|'grace'|'ended',
  color,matchState:null|'success'|'slight'|'danger',policeStage:0|1|2,
  combo,maxCombo,brightnessUnlocked,running,lastEvalSuccess:boolean}
readPlayView(session:GameSession, policeStage:number, {lastEvalSuccess:boolean}):PlayView

ResultContext = {playId:string, summary:ExistingSummary, name:string,
  newBest:boolean, targets:null|HSV[<=50], previous:null|PreviousResult,
  firstClearNow:boolean, arrivedBuilding:number}
buildResultData(context:ResultContext):ResultData
mountResultPresentation({host:HTMLElement,data:ResultData,scope:PresentationScope})
  => {finishNow():void, updateRank(rankView:RankView):void, dispose():void}

sanitizeStats(raw:unknown):PresentationStats
mergePresentationStats(raw:unknown, ended:EndedPresentation)
  => {next:PresentationStats, previous:null|PreviousResult,firstClearNow:boolean}
EndedPresentation = {playId,buildings,rankAverage,maxCombo,endedAt,cleared:boolean}
Store.endRun(tabId,generation,result,{localBest=null,presentation=null}={})
  => Promise<{presentation:null|{previous,firstClearNow}}>

createStreetAccents({scene,slots,atlas,scope})
  => {syncSlot(slotId:number,building:number):void,
       tick(view:PlayView):void,dispose():void}
createActorReactions({hero,police,scope})
  => {tick(view:PlayView):void,event(event:PresentationEvent):void,dispose():void}
mountPresentationHud({host,scope,bestDistance:number|null,bestCombo:number})
  => {tick(view:PlayView):void,event(event:PresentationEvent):void,dispose():void}
```

`scope.tick`には単調な画面内経過msを渡します。ゲームはstate.tをそのまま、結果は非表示時間を除いた経過値、終了演出は別のkind:'ending'のscopeを作り、非表示時間を除く0始まりの経過値を渡します。ゲームscopeを終了時にdisposeし、同じscopeの時計を逆戻りさせません。時計を関数内で勝手に読みません。`dispose`後のtick・scheduleは無効、同じkeyの予約は置換し、期限が来た予約は一度だけ実行します。ownは解除関数を登録し、disposeは何度呼んでも一度だけ解除します。ResultContext・ResultData・PlayViewは判定状態を参照書換しないコピーです。

`PresentationEvent`は`{type,t,building?:number,combo?:number}`とし、typeは既存イベント名に加えて`instantSuccess,policeUp,policeDown,searchStart`を使います。既存イベントの順序を保持し、追加イベントはUI内だけで発行します。police段階は既存alertStage、成功は既存instant tracker、searchStartは既存searchingのfalse→trueから取り、別の閾値判定を作りません。No.33・37のため、app側で直前に観測した評価中のclassifyMatch結果を一つの表示用変数へ持つ。session.frameとsession.inputを呼ぶ直前に評価中の既存matchUnitsを読み、evalEndでその変数をlastEvalSuccessへ取り込み、次の評価開始・棟切替・終了でfalseにします。evalEnd時点ではmatchUnitsがnullのため、既存の評価中フレーム／入力直前の観測値を用い、判定の計算を複製しません。readPlayViewへはその真偽値を引数で渡し、session.stateにフィールドを足しません。ResultDataは`{summary,mapCells,bestBuilding,worstBuilding,districts,colors,badges,speechKey,backgroundId,portraitId,comparison}`を返します。RankViewは`{state,rank:null|number,label:'current'|'personalBest'|null}`で、正式性を作るのは既存の通信結果だけです。

既存stageへ`presentationEvent(event)`を追加し、`update`の任意項目に`presentation:PlayView`を足します。簡易表示もこのメソッドを持ち、3Dの小芝居は安全に省略します。街のsyncSlotはNo.47を含む予約と小道具を棟IDに結び付け、別の棟を割り当てる前に解除します。

## 4. 実装順と依存

推奨順はT0→T1→T2→T10→T5→T3→T4→T6→T8→T9→T11→T7→T12です。全80件を完成させる前提で、早い段階から結果と成功時の変化を確認できます。1工程ごとに変更・確認・レビュー・コミットを行い、失敗中に次工程へ進みません。工程を一つの巨大な変更にまとめません。

追加のG1〜G4はT0の完了後に実施し、T11より前に完了させる。T11ではNo.55を③の案内と、No.11を①③の案内と重ねず一つの枠へまとめる。T12には初回／再プレー／同じ保存済みプレーの再開／初解放／明度未解放時の4段階練習を含める。G2の時計・入力の接続は表示だけの変更ではなく、`src/game/session.js`の進行役を変更する。`src/rules/v1/`の採点規則と履歴形式は変更しない。

| 工程 | 要件数 | 先に必要な工程 | 完成した時に使えるもの |
|---|---:|---|---|
| T0 | 共通 | なし | 止められる表示と開始の二重受付防止 |
| T1 | 7 | T0 | 既存成績だけの結果集計 |
| T2 | 7 | T1 | 結果の背景・主人公・短い動き |
| T10 | 8 | T0 | 成功と進行の上部表示 |
| T5 | 8 | T0 | 地区構造・門・遠景 |
| T3 | 5 | T1,T5,T10 | 保存済み成績の旗・比較 |
| T4 | 3 | T1,T2 | 地区はがき・色・正式順位 |
| T6 | 12 | T5 | 店や歩道の反応 |
| T8 | 10 | T0 | 主人公の姿勢 |
| T9 | 7 | T0 | 警察の姿勢 |
| T11 | 4 | T2,T5,T10 | 解錠・最後の5棟・終了場面 |
| T7 | 9 | T5,T6 | 背景の小芝居 |
| T12 | 結合 | 全工程 | 実機・再プレイ・全80件の確認記録 |

## 5. 工程ごとの作業

### T0：画面を離れたら表示を止める

**Files:** Create `src/presentation/scope.js`, `src/presentation/events.js`, `src/presentation/catalog.js`; Modify `src/app.js`, `src/scene/stage.js`, `src/scene/street.js`; Test `tests/presentation/scope.test.mjs`, `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** 第3章のscope・readPlayView・PresentationEventを作り、以後の全工程へ渡す。既存GameSessionの書込口は増やさない。

- [x] `dispose_twice_cleans_once`・`paused_tick_does_not_advance`・`ending_scope_starts_at_zero_after_game_dispose`・`disposed_callback_is_ignored`を先に作る。同じactiveMsでは予約が進まず、dispose後の実行回数は0であることを検証する。
- [x] `node --test tests/presentation/scope.test.mjs`で新しい接続口が未実装のため失敗することを確認する。
- [x] scopeを実装し、appのmount／disposeStageと画面世代へ接続する。既存showResultの700ms後のbest音もscope予約へ移す。session.on解除、終了のAbortController、動作予約をownへ登録する。street.updateは通常プレイのdtをゲーム時刻差から求め、running=falseなら0とする。既存のperformance.now由来のworldClock・粒子更新と追加動作の時計が食い違わないようにし、opening/endingは独立した時計で扱う。
- [x] startFlowは最初のawaitより前にStartAttemptを一つ作り、外部からの連打はそのcompletionを返す。beginPlay・rankedStartへの分岐はPromiseをreturn/awaitし、開始保存・通信が未完了の間に受付を解放しない。確認ダイアログを出して関数が戻るだけでは終了にしない。No.99は最初の受付通知だけを読み、開始APIを呼ばない。
- [x] StartAttemptは`{id,launchId,state,completion}`、stateはpending/choice/starting/started/cancelled/failedとする。再試行は同じattemptとlaunchIdを使い、再送用requestの既存IDを維持する。既存startTokenは各通信の有効性判定として残す。無名切替では通信トークンを無効にしてから同じattemptでbeginPlayへ一度だけ進む。キャンセル・ホーム・開始全体を中止する失敗ではattemptを終了して受付を解放し、遅着応答を無効にする。開始保存が失敗しても既存のmemoryOnlyでプレイを継続する場合はfailedで解除せず、同じattemptを舞台への引継ぎ完了まで保持する。成功時はbeginPlayの保存と舞台への引継ぎ完了でstartedへ移す。保存済みプレイ選択・容量不足の選択・再送選択も同じattemptのchoiceとして扱い、ダイアログからstartFlowを再帰呼出して自分の受付フラグを迂回しない。
- [x] 同試験を合格させる。通し試験の`restart_double_click`で開始呼出1回、`ranked_start_delayed_double_click`で名前あり開始応答を遅らせても開始要求1件、`start_retry_cancel_switch`で再試行・キャンセル・無名切替後の重複開始0件と次の操作可、`leave_before_best_sound`で遅れた音0回、`pause_hidden_resume`で表示時計が飛ばないことを確認する。
- [x] 対象ファイルを確認して`feat: add presentation lifecycle boundaries`でコミットする。

### T1：既存成績から結果を組み立てる

**Requirements:** No.78,81,82,83,77,79,95。

**Files:** Create `src/presentation/result-data.js`, `src/presentation/result-view.js`; Modify `src/app.js`, `src/i18n/messages/*.js`; Test `tests/presentation/result-data.test.mjs`。

**Interfaces:** buildResultDataとResultDataを作る。初期段階ではtargets・previous=null、firstClearNow=falseでよい。summaryの形式は変更しない。

- [x] `zero_passed_has_no_extrema`、`ties_choose_first_index`、`invalid_tuple_keeps_original_index`、`score_components_sum_without_rescoring`を先に作る。85%と85.004%のように表示の丸め後が同値でも最高を区別し、無効evalMsでは0除算しないことを固定する。欠損tuple、evalMs=-1/NaN/3001、matchSum=NaN/Infinity/小数/負数/上限超も集計から除かれ、元棟番号が保持されることを検証する。
- [x] `node --test tests/presentation/result-data.test.mjs`の失敗を確認する。
- [x] 第3章の型と仕様第3章の分数比較を実装し、得点4内訳・50マス・最大10宝石・既存newBest・せりふをDOMへ接続する。districts等の後続欄は空配列でも一貫した型にする。
- [x] 同試験を合格させる。0棟・1棟・50棟の結果で数値が既存summaryと一致することを確認する。
- [x] `feat: present existing result summaries`でコミットする。

### T2：固定画像で結果の場面を作る

**Requirements:** No.71,73,74,80,93,99,100。

**Files:** Modify `src/presentation/result-view.js`, `src/app.js`, `src/ui/game.css`, `src/i18n/messages/*.js`, `assets/credits.md`; Create `src/ui/presentation.css`, `src/presentation/assets/result-atlas.webp`, `src/presentation/assets/atlas.json`; Test T0の`tests/e2e/presentation.e2e.mjs`へ追加。

**Interfaces:** mountResultPresentation・finishNow・disposeを実装する。背景IdはareaOf(arrivedBuilding)のfrom値、portraitIdはclear/detected/quit/proudの4種類。

- [x] 提供No.28モデルから制作時に4姿勢を画像化し、背景5種類とまとめる。文字と成績は画像に焼き込まず、出典とサイズを記録する。実行時の撮影処理は書かない。
- [x] CSSはgame.cssの先頭から`@import './presentation.css'`で読む。CSSの移動・透明度で報告書0.6秒、得点0.6秒、再プレイ0.15秒、おまけ0.4秒を実装する。完了イベントを開始条件にしない。
- [x] 画面上部の並びを主成績→操作→補足とする。画像が読み込めなくても数値・再プレイは即使用可能にする。非表示とdisposeでCSSの動きも止め、再表示は初回報酬音や統計保存を繰り返さない。
- [x] `result_motion_and_skip`で600ms以内の確定とタップ即確定、`reduced_motion_replay`でanimationendなしでも開始、`result_has_no_webgl_renderer`で新規描画器0を確認する。低影響の装飾ごとの単体試験は作らず、3画面サイズの静止画で見た目を確認する。
- [x] `node --test --test-concurrency=1 tests/e2e/presentation.e2e.mjs`の合格と画像容量を確認し、`feat: compose static result scenes`でコミットする。

### T3：小さな端末内成績だけを追加する

**Requirements:** No.53,54,85,98,91。

**Files:** Create `src/presentation/stats.js`; Modify `src/storage/store.js`, `src/app.js`, `src/presentation/result-data.js`, `src/presentation/hud-view.js`, `src/presentation/street-accents.js`, `src/i18n/messages/*.js`; Test `tests/presentation/stats.test.mjs`, `tests/storage/presentation.test.mjs`。

**Interfaces:** sanitizeStats・mergePresentationStatsと任意presentation付きStore.endRunを作る。返却値は既存呼出元が無視してもよい。persistEnd→lastResultへ比較用のpreviousとfirstClearNowを渡す。

- [x] `duplicate_finish_is_idempotent`、`late_result_does_not_replace_previous`、`new_best_combo_uses_max`、`first_clear_date_never_overwritten`、`bad_optional_data_does_not_block_result`、`stale_writer_keeps_stats_and_outbox`を先に作る。既存kv・outbox・localResultsの内容も検証する。
- [x] `node --test tests/presentation/stats.test.mjs tests/storage/presentation.test.mjs`の失敗を確認する。
- [x] 仕様の2048バイトと整数範囲を検証し、readwriteの既存endRun取引でkvを読み、更新案を1回だけ書く。新DB・新ストア・版変更はしない。endedAtは終了確定時のミリ秒値を渡し、古い結果や同じplayIdではpreviousResultを進めない。
- [x] 本編開始時にlocalBestの名前枠とbestComboを一度読む。No.53の旗は既存街の地点とHUDへ、No.54は過去正数を超えた時だけ。初クリア・前回比較・最大3実績は保存前の値で決め、再描画ではキャッシュしたResultContextを使う。
- [x] 同試験を合格させる。容量不足・読込不能では既存成績の失敗表示を保ち、今回の追加比較だけ省略して操作を続けられることを確認する。
- [x] `feat: persist bounded presentation statistics`でコミットする。

### T4：地区・目標色・正式順位を見せる

**Requirements:** No.89,92,96。

**Files:** Modify `src/presentation/result-data.js`, `src/presentation/result-view.js`, `src/app.js`, `src/i18n/messages/*.js`; Test `tests/presentation/result-data.test.mjs`, `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** ResultDataのdistricts・colorsを完成し、updateRankへ既存pollResultからRankViewを渡す。現在画面世代とplayIdが一致しなければ更新しない。

- [x] `district_mean_uses_equal_building_weights`、`district_at_unpassed_building_boundary`、`targets_are_optional_and_not_persisted`を追加する。evalMsの異なる2棟でも棟の重みは等しく、20棟目未通過でも背景は20の地区となることを確認する。
- [x] `node --test tests/presentation/result-data.test.mjs`の新規失敗を確認後、最大5はがき・50色を作る。No.92のcopyはfinishPlayのsessionを破棄する前に取得する。
- [x] pollResult・localBest読込・ranking読込の表示側を世代で守る。accepted/verifyingは順位なし、officialでもベストと異なる成績は個人ベスト順位と明示する。送信のflushNetworkは中断しない。
- [x] `late_rank_after_restart`、`official_different_from_personal_best`、`anonymous_and_failed_have_no_rank`で旧画面書換0回、誤った今回順位0件を確認する。言語変更で同じ順位の開く動作を繰り返さない。
- [x] 集計単体と対象通し試験を合格させ、`feat: add district cards and guarded official ranks`でコミットする。

### T5：街の構造に変化を付ける

**Requirements:** No.1,2,3,4,9,10,11,57。

**Files:** Create `src/presentation/street-accents.js`, `src/presentation/assets/atlas.webp`; Modify `src/presentation/assets/atlas.json`, `src/scene/street.js`, `src/scene/stage.js`, `src/i18n/messages/*.js`, `assets/credits.md`; Test `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** createStreetAccents・syncSlot・tick・disposeを作る。既存7枠を再利用し、instancedの上限増加を行うなら仕様の描画上限内で定数を更新する。

- [x] 仕様第5章のNo.1〜11の該当条件に従い、地区5種の歩道と目印、屋根3種以上、店内3種、路地2種、門、夜の高架を制作する。
- [x] static部品は共用形状・共用atlasにまとめる。syncSlotで前の棟の装飾を戻し、比較面のstencil・material・色描画経路には変更を加えない。
- [x] 1・19・20・22・23・29・30・39・40・50棟と縦横を固定条件で撮る。`comparison_color_is_unchanged`で既存sampleComparisonの壁・体の一致を確認し、`street_budget`で7枠と追加描画上限を確認する。
- [x] 対象通し試験を合格させ、`feat: diversify district silhouettes and storefront depth`でコミットする。

### T6：看板と小物を短く動かす

**Requirements:** No.5,6,7,8,17,18,19,47,62,63,64,66。

**Files:** Modify `src/presentation/street-accents.js`, `src/presentation/catalog.js`, `src/presentation/assets/atlas.webp`, `src/presentation/assets/atlas.json`, `src/scene/street.js`, `src/scene/effects.js`; Test `tests/presentation/catalog.test.mjs`, `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** T5のtick・syncSlotとT0のPresentationEventを使う。publicな新しい時計やloopは作らない。

- [x] `slot_reuse_cancels_old_sign`と`ambient_particle_pool_is_bounded`を先に作る。棟の再割当後に旧No.47の変形が0件、追加粒子は全種類合計8以下となることを固定する。
- [x] `node --test tests/presentation/catalog.test.mjs`の失敗を確認する。
- [x] 仕様表の時間・個数で12要件を実装する。No.5と47は同じ看板を排他で使い、葉3・煙3・蒸気2の共用枠を作る。点や光源の増殖を避け、停止時は進めない。
- [x] 同試験を合格させ、固定条件で各演出の開始・中間・終了と比較面の色を確認する。
- [x] `feat: add bounded street decoration reactions`でコミットする。

### T7：背景の小芝居を増やす

**Requirements:** No.12,13,14,15,16,36,61,65,70。

**Files:** Modify `src/presentation/catalog.js`, `src/presentation/street-accents.js`, `src/presentation/assets/atlas.webp`, `src/presentation/assets/atlas.json`; Test `tests/presentation/catalog.test.mjs`, `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** T0の表示専用乱数とT5の共用表示を使う。抽選・15秒間隔・6回上限・昼限定・30回連続50ms超での停止は仕様第4章の値で固定する。

- [x] `cosmetic_rng_does_not_change_course`、`cameo_limit_and_cooldown`、`night_rainbow_becomes_none`、`slow_frames_disable_cameos_until_next_play`を追加する。同seed同入力のcourse・summary・historyが装飾の有無で一致することを確認する。
- [x] 新規試験の失敗を確認後、人物・乗り物を一つの枠で使い回す。鳥は3羽でも一組、No.70は発見IDを保存しない。画面外へ出たら即解除し、終了後の回収待ちを残さない。
- [x] `node --test tests/presentation/catalog.test.mjs`を合格させ、強制表示の固定条件で9種類を全確認する。通常の抽選率を試験を通すために上げない。
- [x] `feat: add pooled background cameos`でコミットする。

### T8：主人公の姿勢を増やす

**Requirements:** No.21〜30の10件。

**Files:** Create `src/presentation/actor-reactions.js`; Modify `src/scene/chameleon28.js`, `src/scene/street.js`; Test `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** createActorReactionsのhero側を作る。姿勢は原型からの差分として計算し、上書きの積み重ねで関節がずれないようにする。street.updateでは既存hero.animate・警察animateが原型の歩きを更新した後に追加の差分を適用し、applyEnding中は追加反応を呼ばない。

- [x] 忍び足・息止め・警戒・足接地を常時状態として分け、目配せ・汗・得意顔・宝石確認・つまずきは短い反応として一つずつ再生する。競合時は仕様の優先順で選ぶ。
- [x] No.24は既存尻尾の固定形状を確認し、同じ頂点構成の2形状の補間で包む／緩めるを作る。新規骨格ライブラリは使わない。宝石を安全な位置へ合わせ、リセットで原型へ戻す。
- [x] `hero_pose_reset_after_restart`で10回後の原型姿勢、`comparison_color_is_unchanged`で胴と壁の比較を確認する。No.27は猶予中に一度だけ、距離・警戒・入力が変わらないことを確認する。
- [x] 固定条件で10件の動作を確認し、対象通し試験の合格後、`feat: add readable hero reactions`でコミットする。

### T9：警察の動作を増やす

**Requirements:** No.31,32,33,35,37,38,40。

**Files:** Modify `src/presentation/actor-reactions.js`, `src/scene/characters.js`, `src/scene/street.js`, `src/presentation/assets/atlas.webp`, `src/presentation/assets/atlas.json`; Test `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** createActorReactionsのpolice側を完成する。T8より先に着手する場合も同じexportとhero側の無操作を保つ。

- [x] 2人の役割、無線、似顔絵、急停止、双眼鏡、顔合わせ、帽子を仕様表の時間で作る。No.33・37はview.policeStage===1 && view.phase==='grace' && view.lastEvalSuccessで候補にする。手帳・帽子・双眼鏡は使い回し、人数0時は全て隠す。
- [x] searchingの変化をeventで受け、無線→捜索小道具の順で排他にする。新しい位置追跡・経路探索・警戒判定は書かない。
- [x] `police_reaction_keeps_logical_stage`で30/25未満と70/65未満の既存出退場を確認し、固定条件で7件を撮る。停止中の小道具・時計と再プレイ後の帽子の残りを確認する。`search_prop_after_success_eval`で評価中に成功→evalEnd→猶予の順を通し、No.33・37が実際に起動でき、次の評価開始で古い成功を使わないことを確認する。
- [x] 対象通し試験を合格させ、`feat: vary police search reactions`でコミットする。

### T10：成功と進行を分かりやすくする

**Requirements:** No.41,42,43,46,48,49,50,52。

**Files:** Create `src/presentation/hud-view.js`; Modify `src/app.js`, `src/scene/effects.js`, `src/scene/street.js`, `src/ui/presentation.css`, `src/i18n/messages/*.js`; Test `tests/presentation/hud.test.mjs`, `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** mountPresentationHudを作り、tickとeventで更新する。No.53・54用の入力はT3まではnull/0。既存controlsのpointer-routerへ装飾入力は追加しない。

- [x] `success_band_resets_on_grace`、`combo_11_uses_10_gems`、`recovery_once_after_stage2`を先に作る。成功1000msで1、猶予で0、11連続でも粒10、段階2→0で札1回を検証する。
- [x] `node --test tests/presentation/hud.test.mjs`の失敗を確認後、輪1枚・枠光・帯・シャッター・宝石・解除・立て直し・進行マーカーを実装する。飾りはpointer-events:noneとし、成功時間は現在回の一つの開始時刻だけで管理する。
- [x] 同試験を合格させる。`short_viewport_controls_remain_usable`で402×700のパレット・バー・停止が押せること、DOM簡易表示でも帯と数値が使えることを確認する。
- [x] `feat: add bounded success and progress feedback`でコミットする。

### T11：節目と終了を見せる

**Requirements:** No.55,58,59,60。

**Files:** Modify `src/app.js`, `src/ui/controls.js`, `src/scene/street.js`, `src/presentation/hud-view.js`, `src/presentation/street-accents.js`, `src/presentation/result-view.js`, `src/ui/presentation.css`, `src/i18n/messages/*.js`; Test `tests/e2e/presentation.e2e.mjs`。

**Interfaces:** 既存unlockBrightness／enterBuilding／cleared／detectedを使う。T2の画像とT5の門を再利用し、既存playEndingに重ねる。

- [x] 解錠は19棟目評価終了の既存通知から、屋上札は46〜50棟目の現在番号から更新する。操作許可を0.6秒の動作待ちにしない。
- [x] cleared後0.8秒で門を開き、detected後0.6秒で漫画風の現在表情を見せる。既存の終了スキップとdisposeのAbortSignalで全て止める。ending scopeを作るのはfinishPlay一回だけとし、終了中は通常プレイのstage更新と二重に時計を進めない。既存playEndingの計測も非表示を除く同じ経過時間に合わせる。
- [x] `unlock_does_not_wait_for_animation`、`last5_is_46_to_50`、`ending_skip_cleans_everything`で境界と停止を確認する。最終評価前に壁が消えないことを色読み取りで確認する。
- [x] 対象通し試験を合格させ、`feat: emphasize unlock and escape milestones`でコミットする。

### T12：全80要件・再プレイ・負荷を確認する

**Files:** Modify `tests/e2e/presentation.e2e.mjs`, `tests/e2e/helpers.mjs`, `docs/device-test-procedure.md`, `docs/acceptance/results.md`, `docs/requirements/chameleol-effects80.json`; Create `docs/acceptance/effects80-evidence.md`。

**Interfaces:** 固定表示の試験口は既存のverification環境だけで提供し、本番では利用できない。evidenceはNo.・条件・画像／動画・測定値・結果の表にする。

- [x] 検証専用条件で80件を個別に呼び出し、完了条件と画面証拠を対応付ける。除外20件が混入していないことと、対応表の採用ID80件・重複0を確認する。
- [x] 同じ出題・同じ入力で装飾あり／なしを比較し、summary・history・送信用本文が一致することを確認する。新しい表示キー以外の保存・通信契約を変更しない。
- [x] 0棟・途中発見・50棟・同率・無名・未送信・保存失敗・別タブ引継ぎ・言語変更を確認する。10回連続の再プレイ後、旧scopeの購読・予約・音・DOM更新は0、描画器は仕様上限内、結果は0であることを確認する。
- [ ] 固定条件をiPhone 17 Pro Safariの3画面寸法で確認する。開始直後と最終地区の各30秒でフレーム間隔を測り、95百分位33.4ms以下、装飾ありの中央値悪化10%以内を目標として記録する。基準版自身が33.4msを超える場合は原因を分け、実機合格を保留し、測定値を残す。
- [x] 追加描画・素材の上限を満たす。ウォームアップ後に再プレイごとの対象物数を比較し、解放されるべき対象が単調増加しないことを確認する。SafariでJSヒープの数値を取れない場合は「未測定」とし、オブジェクト数をメモリ測定と言い換えない。
- [x] 最終変更後に`npm test`、`npm run build`、`node --test --test-concurrency=1 tests/e2e/presentation.e2e.mjs tests/e2e/game.e2e.mjs tests/e2e/play.e2e.mjs tests/e2e/saved-run.e2e.mjs`を1回実行し、合格結果を記録する。工程中は対象試験だけを回す。SQL・サーバー側が無変更ならその試験を手動で繰り返さない。既存CIの設定は今回変更しない。
- [x] 独立レビューで問題があれば修正し、該当試験だけを再実行する。iPhone未確認・未計測はそのまま記録し、公開済みや合格と書かない。
- [x] `test: verify effects coverage and replay lifecycle`でコミットし、実装PRを作る。公開・マージ・実験場更新は別の指示で行う。


## 6. 調整の扱いと完了条件

RICEの順序は比較の参考です。素材作成や尻尾の形状の実績を得た段階で見積もりを更新し、変更理由を残します。性能不足はまず共用化・描画の削減で解消し、それでも難しい場合は要件の削除をせず未達条件として報告します。

計画の完了は「80件に実装先と確認手段があり、除外20件とその依存が入らず、独立レビューの重要指摘が解消したこと」です。ゲームの完成は別で、T0〜T12の作業と検証を終えた時だけ判断します。後戻りが必要な場合も既存の成績と追加キーを消さず、旧画面が未知の追加キーを無視できる状態を維持します。


実装PR：[演出80件・初回ガイドと練習 #12](https://github.com/chameleonjp-lab/chameleol/pull/12)。T12の実機測定は未完了であり、自動試験の成功とは分けて扱う。
