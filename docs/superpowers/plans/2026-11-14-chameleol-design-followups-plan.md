# カメレオる：輪郭・舌のダイヤ・後続20案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 難しさに対応する線と10秒周期の舌・ダイヤを追加し、後続20案と残る確認を、既存80案・記録を保ったまま完成させる。

**Architecture:** 表示専用の段階表・舌制御・演出予約と、履歴を読み直す結果用の処理を分ける。既存の舞台・画面更新・保存の取引を共用し、採点エンジンと送信本文は変更しない。

**Tech Stack:** JavaScript ES modules、Node.js 20以上、Three.js 0.170.0、既存IndexedDB、node:test、既存Playwright環境。

**Spec:** [要件仕様書](../specs/2026-11-14-chameleol-design-followups-spec.md)。[Claude依頼プロンプト](../../prompts/2026-11-14-claude-design-followups.md)のモデル・役割指定を優先する。同名の補助スキルがない環境では、プロンプト記載の設計→実装→独立レビューの工程を実行する。

基準mainは `9c1c06fdde1121334f9c0093182f873318e4f57c`。これは実装前の計画であり、下のテストは実装者が追加・実行する予定である。本計画の作成中にゲームの試験が成功したという意味ではない。

## Global Constraints

- 全50棟、既存の色合わせ・警戒・採点・順位・出題の乱数・保存形式・サーバーへの送信内容を見た目の変更で変えない。
- 規則v1〜v4を扱う既存互換を維持し、再生も記録に対応する版を使う。
- Node.js 20以上、Three.js 0.170.0を維持する。
- 自動画面検査は402×700、402×874、874×402を使う。自動Chromium/WebKitと実機Safariを区別する。
- 既存15言語を維持し、追加文言・代替説明・共有画像の文言も15言語で扱う。
- 新旧の合計で、街7枠、静的装飾24、背景小芝居1組・最大3枚、環境粒子8、成功リング1、追加描画呼出12・形16・画像4、圧縮画像1.5MiB・展開後16MiBを守る。
- 小芝居は全体で1プレイ最大6回、開始間隔15秒以上。E051は15秒の一話を1回とする。
- 変更をmainへ直接pushせず、マージは本人に委ねる。実験場への追加掲載をこの依頼から行わない。

## Review Focus

| 特に壊れやすい条件 | 担当工程・検査 |
| --- | --- |
| ガイド位置sceneTとゲーム時計の違い、途中保存から40棟へ復帰 | T1：表示用の棟を正とし、段階が誤らない |
| 舌・既存反応が同じ顎と目を動かす、停止と離脱が動作途中で起きる | T2：基本姿勢の復元、優先取消、1000周期で累積ずれなし |
| 同時刻入力・棟境界・旧版・壊れた20万件履歴・結果訂正 | T3：時刻制限・版・中断・再計算一致、主画面を待たせない |
| E051とE056が同じ小芝居回数・表示枠を奪う | T4：事前予約・期限・取消・6回上限を合算 |
| 実表示前の発見登録、共有取消、2タブの保存競合 | T7/T8：描画確認後のみ登録、取消復帰、集合結合 |

## ファイルの分担と工程順

以下の「新規」は提案するファイル名であり、存在する実装とは区別する。既存ファイルは基準mainで確認したものに限る。

| 工程 | 主な変更先・新規ファイル | 責任 |
| --- | --- | --- |
| T0 | README.md、docs/acceptance/*、docs/tuning/adjustment-table.md | 状態・基準・証拠を揃える |
| T1 | 新規src/scene/chameleon-outline.js、既存chameleon28.js/stage.js/street.js | 段階表と主人公だけの輪郭 |
| T2 | 新規src/scene/tongue-rig.js、travel-tongue-motion.js、travel-tongue.js、既存showcase-tongue.js/street.js/app.js | 舌の形と10秒制御 |
| T3 | 新規src/presentation/review-reader.js、review-data.js、review-view.js、既存app.js/result-data.js/result-view.js | 読み取り専用の振り返り6案 |
| T4 | 新規src/presentation/cameo-reservations.js、既存catalog.js/street-accents.js、scripts/render-street-atlas.mjs | 背景6案と予約 |
| T5 | 既存src/presentation/actor-reactions.js、scene/characters.js/street.js | 警察2案 |
| T6 | 新規src/presentation/precision-badge.js、ui/palette-trail.js、既存ui/controls.js、presentation/hud-view.js/bonus-view.js | 札と軌跡2案 |
| T7 | 新規src/presentation/result-model.js、ui/share-card.js、既存result-view.js/ui/share.js | 模型・回転・画像共有3案 |
| T8 | 新規src/presentation/discoveries.js、storage/presentation-extras.js、既存storage/store.js/memory-store.js | 発見帳1案と演出印 |
| T9 | docs/acceptance/design-followups-evidence.md、device-test-procedure.md、release/release-and-rollback.md | 統合・実機・配布条件 |

T0を先に行い、T1→T2は同じ担当が順に実装する。T8は、保存の接続口を作るT8aと、描画・結果へつなぐT8bに分ける。T8aをT4/T6より先に実装し、T3とT4の基礎部分は並行できる。T5はT4の予約の後、T6はT8aと区間読取の契約の後、T7はT1/T3の後、T8bはT4の実表示通知後に統合する。同じ `app.js/street.js/result-view.js/catalog.js` は同時に編集せず、担当の変更を取り込んでから次の担当へ渡す。追加文言の変更先は `src/i18n/messages/{ja,en,es,pt-BR,zh-Hans,fr,de,ko,ru,it,zh-Hant,id,tr,vi,th}.js` とする。

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

## T3：結果の読み取りと振り返り6案

**Owns:** E072/E076/E084/E086/E087/E088。

**Files:** 新規 `src/presentation/review-reader.js`、`review-data.js`、`review-view.js`。変更 `src/app.js`、`presentation/result-data.js/result-view.js`、`ui/presentation.css`、既存15言語辞書。新規 `tests/presentation/review-reader.test.mjs`、`review-data.test.mjs`、`tests/e2e/result-review.e2e.mjs`。

**Interfaces:** `prepareReview(input,{signal,onYield,revision})` は非同期で `{available,reason,reader,data,revision}` を返す。inputはEXT-02の8項目のみ。originalSummaryは元の署名対象、displaySummaryは `applyVerifiedScore` 適用後の表示用コピーとする。readerは `seek(tMs):Readonly<Frame>` を持ち、Frameは `{t,building,color,target,alert,status}`。dataは `{frames3,finalColors,alertPoints,alertMarks,recovery,longestStreak}`。`mountReviewView(host,{reader,data,scope,revision})` は `dispose()` を返す。`scope` は既存画面世代と共有時計で、別のゲームSessionを生成しない。

- [ ] 既存v1/v2互換例、v3/v4のボーナス例を入力にし、0ms、各棟境界の前後、同時刻複数入力、pause/resume、明度解放、発見、quit、全クリアをテストする。入力オブジェクトはfreezeし、結果に元配列参照を漏らさない。
- [ ] 正式エンジンの同じ時点までの値とseek結果が一致すること、最後のseekがoriginalSummaryと整合し、派生表示に使う値がdisplaySummaryとも整合することを検査する。未知版・不正形式・20万件超・不一致はavailable=falseで主成績を維持する。20万件ちょうどはデコード段階から処理を分割して継続できる。
- [ ] 3コマの時刻、最後の比較色、棟末＋最終終了時点の50点以下、70%→35%回復、最長成功の85%実値・等長時先勝ちを、具体的な履歴から照合する。0棟の2秒発見終了も終点1個を持ち、50棟の終了時刻は最後の棟末と統合する。丸めると85.00%になる未達を成功扱いにしない。
- [ ] 警戒の印は、最初の警察登場、最初の2人状態、最初の退場方向への回復の最大3個とする。各版の閾値と既存feedbackの登退場差を使い、履歴から再構成した印と説明する。入力の最終stateを各印へコピーしない。
- [ ] 対象2ファイルの単体試験で失敗を確認してから実装する。形式検証・デコード・コピーから逐次処理し、既存decodeHistoryと同じ結果・不正理由になることを既存例と境界例で照合する。入力と棟末・3コマ等の問い合わせ時刻を元順序を保って処理し、seek時は直近索引から進める。完全状態の索引は1000入力ごと＋棟境界、最大320個、各索引にnextEventIndexを持つ。`stateFromHistory` の本体・規則manifestを変えない。
- [ ] 終了直前の必要データだけをfinishPlayから切り離して保持する。終了色は対象イベントの適用前後の仕様を区別し、全クリアでは壁の添字49を使う。履歴がない旧結果を再生可能にしない。
- [ ] 分析は結果の主成績・再プレイを表示した後に開始し、デコード・検証・コピーを含む全段階を1000件または4msでyieldする。20万件のデコードを同期一括実行していないこと、索引320個以下、中断後のバッチ0回を検査する。中断時は次バッチへ進まず、playId/画面世代/revisionを確認する。
- [ ] 2倍の再生、1/2/4倍切替、停止・最初から・非表示停止・離脱取消を追加する。保存、送信、実績、ゲーム開始・音への呼出を0回とする監視試験を実行する。
- [ ] 公式結果の訂正後は呼出側でrevisionを1増やし、旧AbortControllerを中断する。新しいdisplaySummaryを作り、元originalSummaryは保持する。古いフィルム・分析・共有画像を無効化し、再計算が両summaryと整合する場合だけ新しいrevisionを表示する。E087と訂正後maxCombo等が不一致なら振り返りを利用不可にし、公式成績の表示を維持する。同じstatus文字列でも訂正値が変われば更新し、古いrevisionの後着は捨てる。
- [ ] 単体対象と `node --test tests/e2e/result-review.e2e.mjs` の成功を確認し、commitと独立レビューを行う。

## T4：背景6案を共通予約で動かす

**Owns:** E020/E051/E056/E067/E068/E069。

**Files:** 新規 `src/presentation/cameo-reservations.js`。変更 `catalog.js`、`street-accents.js`、`scene/street.js`、`scripts/render-street-atlas.mjs` と生成済み `presentation/assets/atlas.*`。新規 `tests/presentation/cameo-reservations.test.mjs`、`extended-street.test.mjs`、`tests/e2e/extended-street.e2e.mjs`。

**Interfaces:** `createCameoReservations({playId,restore,claimStart})` は `reserve({id,start,duration,slots})/start(ticket,t)/cancel(ticket)/tick(view)/stats()` を持つ。予約・保存済み開始・実表示を区別し、実表示通知 `onShown({id,playId,visibleMs,verification,building})` をT8bへ渡す。`reserve` は不可ならnull。`start` はT8aの所有者付き保存に成功して初めて許可する。保存待ちに期限を超えた場合は表示せず、取得枠だけ保守的に消費する。

- [ ] 最大6回・15秒間隔・一組3枚、物語の15秒所有、E056の開始時からの回数1枠確保と110,000〜126,500msの時間予約を検査する。0/15/30/45/60/75秒に通常6回を始めようとしても、通常側は5回までで配達用1回を残す。期限取消と配達後の通常再開時刻もEXT-01どおり検査する。
- [ ] 全6案の開始→中間→終わりの具体的姿勢を固定テストへ書く。水2枚と既存煙・葉・蒸気の合算8枚、鳥と荷物の屋根接触、塗装の所有棟、踏切の列車後端通過をassertする。
- [ ] 未実装の失敗を確認してから共通予約を実装する。旧CAMEOSの抽選・E051/E056の予約を別々のカウンターにせず、一つの予約へ接続する。
- [ ] 物語の状態を建物の描画7枠から分離し、棟の枠が再利用されても話を保持する。持続中success/lastEvalSuccessでは開始・継続を禁止せず、短い通知・危険・ガイドは一時非表示だけにする。章時計はゲーム時刻で進め、現在章へ戻し、過去章は再生しない。通常停止は章も停止。終了・離脱だけは取消する。
- [ ] T8aで `count/lastStartedAt/rngState/reservedMidpoint/midpointUsed/activeStory{startBuilding,startT}` を所有者付きで保存・復元する。5回後の再読込から追加1回以下、物語の途中復帰、欠損情報で新規抽選停止を検査する。開始保存完了後の0.5秒期限切れで絵を出さず、終了済み・別playIdの遅い保存を採用しない。
- [ ] 素材は既存の制作スクリプトで再現可能に生成する。ロボットの足・鳥の羽・荷物・ひもは必要な新規素材として実際に作る。仮の文字や色違いの四角を完成品としない。
- [ ] 採用済みIDだけをcatalogと旧80件対応表へ足し、残りは未実装として保持する。元の80件と合算した集合試験を更新し、20案が出来るまで100件実装済みにしない。
- [ ] 単体対象、`tests/e2e/extended-street.e2e.mjs`、既存 `tests/presentation/catalog.test.mjs` と `scope.test.mjs` を実行する。3寸法の読み取りやすさと最大場面の資源上限を確認する。
- [ ] commitと独立レビューを行う。

## T5：警察の聞き込みと足跡調査

**Owns:** E034/E039。

**Files:** 変更 `src/presentation/actor-reactions.js`、`src/scene/characters.js`、`src/scene/street.js`。新規 `tests/presentation/police-investigation.test.mjs`、`tests/e2e/police-investigation.e2e.mjs`。

**Interfaces:** `createActorReactions` の既存公開名を維持し、statsへ `displayOffset` を加える。正式な追跡位置とは別の表示補正を警察のroot・影・道具・記号・光へ一括適用し、解除時は基準を復元する。

- [ ] 警察1→0、1→2、停止、終了、棟枠再利用で補正が残らず、既存の無線・急停止・似顔絵・双眼鏡との同時道具表示が0または1になるテストを作る。
- [ ] 足が地面へ接し、ノックの手が扉へ届く固定姿勢、足跡を見てから迷う順序を検査する。失敗確認後に実装する。
- [ ] 小さい足跡を装飾24枠へ含める。正式なプレイヤーの歩行履歴・追跡入力として保存しない。
- [ ] 新規対象と既存 `node --test tests/presentation/actor-reactions.test.mjs` を実行し、同じ入力で警戒・発見時刻・結果が一致することを確認する。
- [ ] 3寸法の画面証拠、commit、独立レビューを残す。

## T6：ほぼ完全一致の札と操作軌跡

**Owns:** E044/E045。

**Files:** 新規 `src/presentation/precision-badge.js`、`src/ui/palette-trail.js`。変更 `src/app.js`、`src/ui/controls.js`、`src/presentation/hud-view.js/bonus-view.js`、`ui/presentation.css`。新規 `tests/presentation/precision-badge.test.mjs`、`tests/ui/palette-trail.test.mjs`、`tests/e2e/precision-trail.e2e.mjs`。

**Interfaces:** `createPrecisionBadge({claim})` は `consume({building,from,to,matchUnits,evaluationEnd,unitsPerPercent})` を受ける。履歴入力の各区間と評価終端を処理し、表示フレームの間引きに依存しない。claimはT8の `claimPrecisionBadge(playId)`。`createPaletteTrail(host)` は `point({pointerId,x,y,t})/release(pointerId)/clear()/tick(t)/dispose()` を返す。

- [ ] 97.999%と98.000%、499と500ms、途中未達、評価終了をまたぐサンプルをテストする。4000ms開始→次描画4501msでも4500msまでの500ms達成を拾う。棟境界で継続を切る。
- [ ] 札は追加得点0、同じplayIdで1回、既存精密ボーナスが同時なら一つの表示へ統合する。claim失敗時は今回の表示中だけ重複抑止し、永久保存したとは扱わない。
- [ ] 軌跡は最大24点・寿命240ms・選択点12px空白。pointercancel/lostpointercapture/releaseAll/停止/離脱でclearするテストを作る。明度バーと2本指操作の入力値が完全一致することを検査する。
- [ ] 対象の失敗を確認後、描画の更新とpointerイベントを共用して実装する。軌跡のために新しいrequestAnimationFrameを作らない。軌跡へpointer-events:noneを付け、色入力の捕捉を奪わない。
- [ ] 動きを減らす場合は直近1点だけにする。ガイドの95%説明と札の98%を混同しない文言を15言語で追加する。
- [ ] 対象と既存 `tests/ui/controls.test.mjs`、`tests/presentation/bonus-view.test.mjs`、`tests/e2e/bonus.e2e.mjs` を実行する。3寸法で主操作・警告・札の重なりを検査する。
- [ ] commitと独立レビューを行う。

## T7：模型・主人公の回転・共有カード

**Owns:** E075/E090/E094。

**Files:** 新規 `src/presentation/result-model.js`、`src/ui/share-card.js`。変更 `src/presentation/result-view.js`、`src/ui/share.js`、`src/scene/showcase.js`（必要な共通部だけ）、15言語辞書。新規 `tests/presentation/result-model.test.mjs`、`tests/ui/share-card.test.mjs`、`tests/e2e/result-extras.e2e.mjs`。

**Interfaces:** `mountResultModel(host,{building,portrait,signal})` は `dispose()` を返す。`createShareCard({displayData,locale,publicUrl,signal,revision})` は `Promise<{blob:Blob,revision:number}>` を返す。displayDataは表示許可済みの主成績・任意名・確定順位だけ。生成完了・共有タップ時にT3と同じrevisionを照合する。

- [ ] 0/19/20/49/50棟の模型をテストし、targets欠損時は中立色と説明を出す。今回の未通過部分へ架空の色を補わない。
- [ ] 3Dを開く前に本編・ホームの描画器をdispose済みか確認する。結果の一パネルのみ所有し、非表示中・静止中は新規描画しない。線はT1の到達棟を使う。
- [ ] 横ドラッグのみモデルの回転へ使い、縦はスクロールへ譲る。移動量8 CSS px以上はタップ反応を取消する初期値としてテストする。No.100のタップと再プレイへ漏らさない。
- [ ] 共有は画像準備完了と共有タップを分ける。`navigator.canShare({files})`、非対応、キャンセル、長いUnicode名、15言語、未知の順位、画像失敗、離脱をテストする。失敗を確認後に実装する。
- [ ] 1200×630画像を実際に描き、長い名前は書記素を壊さず折返しまたは省略する。色や数値をモデルの画面撮影から拾わず、確定したdisplayDataから描く。
- [ ] 一時URLは画面が利用し終えた時にrevokeし、非同期完了後に閉じた画面へダウンロードを発火しない。画像準備後に公式訂正・言語・名前が変わった場合もrevisionを増やして古い画像を無効化し、作り直してから共有する。
- [ ] 対象と既存 `tests/e2e/result-actions.e2e.mjs` を実行する。旧「Xでシェア」も使えること、回転10回再表示で描画器最大1個を確認してcommitと独立レビューを行う。

## T8：発見帳と演出印を安全に保存する

**Owns:** E097、EXT-03。T4の予約保存とT6のclaim契約を提供する。T8aは保存関数とその試験までを先行実装し、T8bで実表示・結果パネルへ接続する。

**Files:** 新規 `src/presentation/discoveries.js`、`src/storage/presentation-extras.js`。変更 `src/storage/store.js`、`memory-store.js`、`src/presentation/street-accents.js`、`result-view.js`。新規 `tests/storage/presentation-extras.test.mjs`、`tests/presentation/discoveries.test.mjs`、`tests/e2e/discoveries.e2e.mjs`。

**Interfaces:** store/memory-store両方へ `claimPrecisionBadge(playId):Promise<boolean>`、`loadDirector(playId)`、`claimCameoStart({playId,tabId,generation,state}):Promise<boolean>`、`commitDiscoveries({playId,tabId,endedGeneration,ids}):Promise<{allIds,runIds,newIds,saved}>` を追加する。`state` はT4の7フィールドを持ち、loadDirectorは同じ形かnullを返す。`createDiscoveryTracker({playId,onDiscover})` はT4の実描画後通知を受け、対象7IDの画面内・表示中の時間だけを合計する。

- [ ] 299/300ms、画面外、停止、非表示、抽選後取消、強制検証表示、同一ID重複をテストする。検証フラグがtrueなら永続化0回。
- [ ] 同時2タブで異なるIDを発見しても両方残り、同じ新IDは一方のnewIdsだけに入ることを確認する。claimは同時2呼出でもtrueが1回だけ。同じ結果のrunIds/newIdsは再表示・言語変更で不変とする。
- [ ] 保存失敗・壊れた専用値・容量上限で本編成績が維持されるテストを先に失敗させる。専用キーをUTF-8で32KiB・直近32playId以内へ固定する。claimCameoStartは進行中runsの所有者・世代を確認し、commitDiscoveriesはendRun成功後の終了済みrunsと所有者・終了世代を確認する。古い終了が新runへ影響する保存を拒否し、既存DB_VERSION=1・既存ストアを維持する。
- [ ] 実表示のIDはまず今回のメモリ集合へ集める。endRun成功後の別取引で累積と初発見差を確定し、今回一覧・初発見印・累積7件の状態を結果へ表示する。未実装や素材なしを発見済みへしない。保存失敗時は今回一覧を残し、再試行する。発見の有無をランキングへ送らない。
- [ ] 対象と既存 `tests/storage/presentation.test.mjs`、`resume.test.mjs`、`tests/net/outbox.test.mjs` を実行し、commitと独立レビューを行う。

## T9：全体確認、実機へ渡す準備、正式値の判断材料

**Files:** 新規 `docs/acceptance/design-followups-evidence.md`、変更 `README.md`、`docs/acceptance/results.md`、`docs/device-test-procedure.md`、`docs/tuning/adjustment-table.md`、`docs/release/release-and-rollback.md`、旧80件の対応表。

**Interfaces:** 完了報告は `commit / requirementId / evidence / automated / device / published / blockedReason` の列を持つ。予定のテストを実施済み件数へ足さない。

- [ ] 変更箇所に応じた対象試験を工程ごとに実行し、最後のコード変更後に `npm test` と `npm run build` を各一度実行する。全件を毎修正で繰り返さない。CIの既存チェックを勝手に弱めない。
- [ ] 同じ最後のcommitで `npm run test:e2e` を一度直列で完了する。SQL・別エンジンは規則・通信・保存契約に差分がある場合に対応試験を追加する。今回の単なる材質変更だけを理由に本番へ接続しない。
- [ ] 元80件・追加20件・DES-01〜08・EXT-01〜04・FOLLOW-01〜08の対応を照合する。E020等が一つでも未実装なら100件完了とは書かない。
- [ ] 3寸法、初回4ガイド、20棟明度解放、40棟、50棟、危険状態、通常練習、結果再表示、動きを減らす、描画不能、公式訂正をまとめて確認する。
- [ ] v1〜v4の途中保存と未送信結果を使い捨て環境で復元し、識別値・元成績・送信回数・旧版の入口を検査する。実データの削除や初期化で通さない。
- [ ] iPhoneから開ける候補URLと配布版を用意する。環境内の既存プレビュー／成果物の配布を使い、外部公開が別途必要なら完成候補と影響を示してから公開の判断を受ける。用意できなければURLなしと明記する。
- [ ] iPhone 17 Pro Safariで表示・2本指・音・アプリ復帰・10回再プレイを確認する。測定できなければ端末手順を渡し、実機未実施を残す。3寸法の自動試験だけで実機合格にしない。
- [ ] 基準版と装飾ありを同じ入力・温度条件で比べ、開始直後と最終地区を各30秒測る。95百分位33.4ms以下・中央値悪化10%以内を目標とする。取得できないJSヒープは未測定とする。
- [ ] Fableによる最終調整の指示をSonnetが反映し、該当試験だけ再実行する。その後のFable再確認が通ったcommitで実装PRを提出する。マージ・本番DB適用・本番配備はこの実装依頼の完了条件へ紛れ込ませない。

## 旧計画との関係

この計画は、新しいデザイン2件と後続20案、残る検証・資料更新を追加する。ホームの既存計画とボーナス計画は置き換えず、回帰確認の根拠とする。旧80案仕様の「除外20件」は過去の採用範囲であり、今回の計画で実装対象へ移す。実装が完了した工程だけ、catalog・対応表・受入証拠の状態を同時更新する。
