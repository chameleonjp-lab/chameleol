# ホームの連続色変化・巻きベロ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームのカメレオンを24色・12秒周期で色変化させ、時々巻きベロを伸縮させる。

**Architecture:** 非表示時間を除く既存の時計を小ファイルへ移し、ホームの既存描画ループから色と舌の表示状態を更新する。舌はホームだけに付ける固定形状で、既存モデルの頭・口・目の参照を使う。アプリ全体の保存やゲーム判定へ接続しない。

**Tech Stack:** JavaScript ES Modules、Three.js 0.170.0、Node.js 20以上、既存のNode test runner・Playwright/Chromium。

**Spec:** [ホームの連続色変化・巻きベロ仕様](../specs/2026-11-14-chameleol-home-idle-spec.md)。実装者は両方を読む。

## Global Constraints

- 基準はmain `e3a74eb8f843eb2d608c9435ae9cb15e28c6b60a`。着手時に最新mainとの差を確認し、他の変更を巻き戻さない。
- 色は仕様HOME-02の24色、各500ms、周期12000ms。元の緑から始め、最後から最初も連続させる。
- 舌は初回2000〜3000ms未満、以後は動作終了から6000〜10000ms未満、1回900ms。ゲームの乱数と時計は使わない。
- 「動きを減らす」では空間的な動きと舌を止め、体色の滑らかな循環は続ける。非表示・context lost中は時計を進めない。
- 模型枠は維持し、402×700・402×874・874×402で枠の内側8CSS px以上に全体を収める。描画予約は1系統、舌形状は32×6分割で再利用する。
- Node.js 20以上、Three.js 0.170.0、既存の保存・採点・送信形式を維持する。新しい依存・画像・音・DB変更は加えない。
- 当初は文書のみのPR。追加の実装依頼により以下を実装・検証する。マージ・公開・実験場連携は行わない。

## Review Focus

| 見落としやすい条件 | 期待する動作 | 担当する検証 |
| --- | --- | --- |
| 非表示中に描画が1回も呼ばれない | 復帰時に色・舌が飛ばず、過去の予約を連発しない | H1の時計境界、H3の非表示試験 |
| 舌を伸ばしている最中の画面変更・端末設定変更 | 古い部品が戻らず、姿勢が残らない | H2の復元、H3/H4の中断試験 |
| 口・舌・目に毎回変形を足す | 基準姿勢から設定し、20回再表示後も位置がずれない | H2の姿勢反復、H4の20往復 |
| 横向き・小さい枠で最大長になる | 舌と輪郭が欠けず、ボタンを覆わない | H3のカメラ範囲、H4の実描画 |
| 借りた材質を舌側で解放する／途中作成に失敗する | 二重解放・資源残りを起こさず、ホームを操作できる | H2の所有権、H3の例外試験 |

---

## 1. ファイルと責務

| 区分 | ファイル | 責務 |
| --- | --- | --- |
| 新規 | `src/scene/presentation-clock.js` | 既存の時計2関数をそのまま移す |
| 変更 | `src/scene/stage.js` | 時計をimportし、同じ公開名でre-exportする |
| 新規 | `src/scene/showcase-motion.js` | 24色の循環、舌の予約・900msの段階、設定変更を数値として扱う |
| 新規 | `src/scene/showcase-tongue.js` | ホーム専用の巻きベロ形状、口・目・頭の姿勢、専用資源の解放 |
| 変更 | `src/scene/showcase.js` | 時計・動作・舌・カメラ・描画予約・監視を一つにまとめる |
| 新規 | `tests/scene/showcase-motion.test.mjs` | 色と舌の境界・周期・設定変更 |
| 新規 | `tests/scene/showcase-tongue.test.mjs` | 実際のモデルと形状、姿勢復元、材質の所有権 |
| 新規 | `tests/scene/showcase-lifecycle.test.mjs` | 注入した描画器と時計で予約・監視・例外を検証 |
| 既存利用 | `tests/scene/presentation-clock.test.mjs` | 時計移動の互換性を確認 |
| 新規 | `tests/e2e/home-idle.e2e.mjs` | 実アプリの表示、サイズ変更、画面遷移、旧ゲームとの分離 |
| 実装時作成 | `docs/acceptance/home-idle-evidence.md` | 自動・実機の結果と未実施範囲、画面証拠 |
| 実装時更新 | `README.md`、`docs/device-test-procedure.md` | 実装状態とiPhone確認方法を更新する |

`src/scene/chameleon28.js`、`src/app.js`、採点規則、保存層は既存の接続口を使い、変更を前提にしない。実装中に変更が必要と分かった場合は理由・影響・追加試験を証跡に記録し、無関係な整形を混ぜない。

## 2. 接続口

### 動作を決める処理

`showcase-motion.js` はThree.jsとDOMをimportしない。

```js
HOME_PALETTE_HEX // 仕様どおりの24要素。変更不可の配列
sampleHomeColor(activeMs, outRgb) // outRgb: Float64Array(3)、同じ配列へ0〜1のRGBを書き込む
createHomeIdleMotion({ random = Math.random, reducedMotion = false } = {})
// -> { sample(activeMs, outFrame), setReducedMotion(reduced, activeMs), dispose() }
```

`outFrame` は呼出側が1個だけ用意し、`colorRgb: Float64Array(3)`、`tonguePhase`（idle/anticipate/extend/hold/retract/settle）、`tonguePhaseMs`、`extension`、`unroll`、`mouthOpen`、`gazeWeight`、`headTilt`、`yaw` を持つ。数値は有限値で、率は0〜1。`yaw` は従来の `-0.85 + sin(activeMs/2400)*0.35` を使う。動きを減らす時は-0.85で固定する。

色の計算は `p=(activeMs % 12000)/500; i=floor(p); f=p-i`。24番目の次は0番目とし、両RGB間をfでつなぐ。長時間経過も剰余で扱い、フレーム数から進めない。

乱数は0以上1未満を返す注入可能な関数。初回待機 `2000+1000*r`、次回待機 `6000+4000*r`。非有限・範囲外なら0.5へ置き換える。予約を過ぎた最初のsampleでその時点を動作開始とする。一度のsampleで過去の動作を複数開始しない。時計が逆行・非有限なら前回の有効時刻を使う。

### 舌を描く処理

```js
createShowcaseTongue(hero)
// -> { apply(frame), getLocalEnvelope(outBox), reset(), dispose() }
```

`hero` は既存 `createChameleon()` の戻り値。`head`、`tongue.position`、`tongue.material`、`tongue.children[0].material`（輪郭）、`actorParts.jaw/mouth/eyes` を借りる。元の直線舌は非表示のままとし、ホーム用部品だけをheadへ追加する。借用材質はdisposeしない。新しい形状・配列・部品はこの処理が所有する。

`apply` は `hero.animate(dt,{walking:false})` の後に1回呼ぶ。頭・目はそのフレームの通常姿勢へ追加し、顎・口は作成時の姿勢から設定する。`reset` は顎・口を保存した値へ戻し、頭・目の追加分を残さない。`dispose` は何度呼ばれてもよく、resetして新部品を外し、自分の形状だけを解放する。

### ホームへの接続

既存 `createShowcase(container)`、戻り値 `hero/resize/dispose` を維持する。検査用には第2引数の依存注入（`now`、`random`、`requestFrame`、`cancelFrame`、`rendererFactory`）を追加し、既定値は現在のブラウザAPIにする。`rendererFactory` の呼出契約はWebGLRendererと同じ初期化オプションを受け、現在showcaseが使う描画器のメソッドを持つものを返す。

`stats()` は読み取り専用で `{ active, renderCount, pendingFrames, colorRgb, tonguePhase, drawCalls, geometries, textures }` を返す。呼出時だけ値をコピーし、毎フレーム検査用の配列を作らない。画面には表示せず、操作を強制する入口は作らない。既存 `__kamereoru.showcase` から自動検証が読める。

ホームは `createVisiblePresentationClock({ now })` を使い、`visibilityTarget` を渡さない。時計に内蔵された表示変更の監視は使わず、ホーム側の1つの制御処理が `stopped = document.hidden || contextLost || zeroSize` を計算する。各通知で `tick(now(), stopped)` を呼んでから予約を取消し、全理由が解除された時だけ再開する。既存の本編・終了演出が時計内蔵の監視を使う方式は維持する。

## 3. 工程

### H1：表示時間と色・舌の進行を決める

**Files:** 新規 `presentation-clock.js`、`showcase-motion.js`、`showcase-motion.test.mjs`。変更 `stage.js`。既存 `presentation-clock.test.mjs` を使う。

**Interfaces:** 既存の時計2関数の引数・戻り値・disposeを維持する。H2/H3へ前章の `HomeIdleFrame` と動作処理を渡す。

- [x] H1.1 色の0/250/499.999/500/11999.999/12000ms、24区間、100周後を検証するテストを追加する。0msと12000msが緑、250msがRGB `[105,196,60]/255`、500msが `[122,196,60]/255`。60回/秒と120回/秒の同じ時刻で同じ値を期待する。
- [x] H1.2 舌は乱数0で2000ms、0.5で2500msから開始し、899.999ms後はsettle、900ms後はidleになるテストを追加する。次回は終了時刻から6000/8000ms待つ。乱数呼出回数、時刻飛びで1回だけ開始、逆行・非有限入力、動きを減らす設定の途中切替も検証する。
- [x] H1.3 `node --test tests/scene/showcase-motion.test.mjs` を変更前に実行し、未実装の接続口が原因で失敗することを確認する。依存不足による失敗を代用しない。
- [x] H1.4 時計をそのまま切り出してstageから再公開し、仕様の値と接続口で動作処理を実装する。段階間の伸縮・口・視線は連続させる。伸長は速く、収縮は370ms使う。idleの幾何表示は0にする。
- [x] H1.5 `node --test tests/scene/presentation-clock.test.mjs tests/scene/showcase-motion.test.mjs` を成功させ、対象ファイルだけをコミットする。時計移動の既存4試験も成功すること。

### H2：巻きほどける舌と小さい顔の動作を作る

**Files:** 新規 `showcase-tongue.js`、`showcase-tongue.test.mjs`。既存 `chameleon28.js` は読み取り利用。

**Interfaces:** H1のframeと既存heroを受け、`apply/getLocalEnvelope/reset/dispose` をH3へ渡す。`getLocalEnvelope` は舌の全段階を含むhead座標系の保守的な範囲を書く。

- [x] H2.1 実際のheroを作り、収納・伸長中・最大・収縮中の形状が異なる、口元の始点が動かない、頂点と法線が有限、巻きの先端と直線部分に切れ目がないことを検証するテストを追加する。1000回apply後も位置の累積ずれがなく、reset後の顎・口が元と一致することも確認する。
- [x] H2.2 `node --test tests/scene/showcase-tongue.test.mjs` を変更前に実行し、未実装で失敗することを確認する。
- [x] H2.3 32×6分割の固定頂点・法線・添字配列を作る。前方へ伸ばす部分と先端の1.25巻きの曲線を一本につなぎ、ほどけ率で巻きが開閉するよう座標を更新する。本体と輪郭は同じ形状を使う。全縮小時のゼロ長による法線の非数値化を防ぎ、口へ収めてから非表示にする。毎フレームのTubeGeometry作成はしない。
- [x] H2.4 途中例外で作成済み形状を解放する処理、基準姿勢の復元、冪等なdisposeを実装する。テストで借用材質のdisposeが0回、専用形状は1回、部品数が作成前に戻ることを確認する。
- [x] H2.5 対象試験を成功させ、対象ファイルだけをコミットする。曲がり方の見た目の合格はH4で実描画を見て判断し、数値試験だけで済ませない。

### H3：ホームの描画と寿命に組み込む

**Files:** 変更 `showcase.js`。新規 `showcase-lifecycle.test.mjs`。

**Interfaces:** H1の時計と動作、H2の専用部品を使い、現在の `mountShowcase/disposeStage` から同じ形で呼べるようにする。

- [x] H3.1 描画予約・時刻・描画器を注入した試験を追加する。初回が緑、250ms/500msで色が変わること、非表示通知だけを挟んでも復帰時に時間が飛ばないこと、dispose後の遅延コールバックが新しい描画を予約しないことを検査する。変更前の関連試験の失敗を確認する。
- [x] H3.2 各フレームを「表示時計→frame計算→hero.setColor(frame.colorRgb)→通常animate→ホーム専用pose→groupの向き→render」の順にする。色・舌・首振りを同じelapsedで更新する。描画予約IDはnullを未予約として扱い、重複予約を防ぐ。
- [x] H3.3 visibilitychange、context lost/restored、端末の動きを減らす指定、ResizeObserverを一つのshowcaseの所有物にする。前章の接続どおり、時計内蔵の監視は無効にし、全停止理由をまとめて時計へ渡す。context lostでは復旧を許すためイベントの既定動作を抑止する。復帰イベントで基準時刻を更新してから1本だけ予約し、複数の停止理由が重なる間は再開しない。disposeでは全監視を外し、時計・舌・モデル・影・描画器の順に所有資源を片付ける。
- [x] H3.4 resizeで通常モデルと舌の最大姿勢を含む範囲からカメラ距離を計算し、8CSS pxの余白を確保する。向きの全範囲と頭の傾きを含める。枠幅・高さ0なら有効サイズが来るまで描画を予約せず、復帰時に時計を再設定する。動作中のカメラ距離は固定する。
- [x] H3.5 最初からreduce、途中reduce、二重dispose、作成途中の失敗、非表示とcontext lostの重なり、0サイズから復帰、監視解除後の通知を検証する。累積50msでcontext lost→非表示→表示復帰（まだlost）→context復旧の順と、非表示のまま先にcontext復旧する順で、全理由の解除前は50msのまま、解除50ms後だけ100msになることを確認する。`node --test tests/scene/showcase-lifecycle.test.mjs tests/scene/showcase-motion.test.mjs tests/scene/showcase-tongue.test.mjs tests/scene/presentation-clock.test.mjs` を成功させてコミットする。

### H4：実アプリで表示・画面遷移・既存ゲームとの分離を確かめる

**Files:** 新規 `tests/e2e/home-idle.e2e.mjs`。既存 `tests/e2e/helpers.mjs` は変更せず利用する。

**Interfaces:** 実アプリの `__kamereoru.showcase`、`stats()`、実際の材質・形状を読む。時間制御はブラウザの時計をページ読込前に導入し、既存ボタンから画面を移動する。

- [x] H4.1 3画面寸法で0/250/500/12000msの色、舌の予備・伸長・収縮・収納、枠との関係を検証する。体色の画素と材質の値、曲線の形と実描画の両方を見る。存在フラグだけで合格にしない。初回時刻は2000〜3000msの範囲で検出する。
- [x] H4.2 舌の各段階で「設定」「遊び方」「練習」「ゲーム開始」へ移る。途中で画面を離れた読み込み、ホーム再表示、言語変更を含む20往復でcanvasが1個、描画予約が最大1個、旧表示の更新が0であることを確認する。初期化後の描画資源が回数に比例して増えないことを記録する。
- [x] H4.3 端末設定の動的切替、画面回転、非表示復帰、描画不可を確認する。色の循環を動かしてから既存の固定入力で本編を開始し、色変化なしの場合と出題・採点・履歴・送信本文を比較する。プレイの識別値と実行日時だけを揃えて比較し、それ以外を除去しない。
- [x] H4.4 `node --test --test-concurrency=1 tests/e2e/home-idle.e2e.mjs tests/e2e/game.e2e.mjs tests/e2e/guidance.e2e.mjs tests/e2e/saved-run.e2e.mjs tests/e2e/presentation.e2e.mjs` を実行する。presentation内の結果表示600ms、`pause_hidden_resume`、`leave_before_best_sound`、`leave_game_unsubscribes_and_discards_scheduled_callbacks`を実行したことも確認する。終了のスキップは `node --test --test-name-pattern='GAME-17' tests/e2e/play.e2e.mjs` で確認する。実行した件数・失敗・skipを記録し、名前で対象を絞ったskipを実行済みに数えない。共通時計を切り出すため、既存の開始・終了・中断画面をこの確認へ含める。
- [x] H4.5 画面画像を目視確認して、巻き・口への収納・輪郭・色のつながり・ボタンの読みやすさを修正する。自動検証結果と画像を証跡へ記録し、対象ファイルだけをコミットする。

### H5：実機と提出資料を揃える

実装・自動検証・証跡は完了。H5.2は実機が利用できず未確認。候補URL未用意、本番公開・マージは未実施。

**Files:** `docs/acceptance/home-idle-evidence.md`、`docs/device-test-procedure.md`、`README.md`。

**Interfaces:** H1〜H4の結果、対象commit、配布候補の識別値を受け、実装PRの確認記録へまとめる。

- [x] H5.1 iPhoneだけで開ける実装候補を用意できた場合は、その実在するURLと対象版を記載する。未用意なら未用意と記録する。旧公開版やlocalhostを修正版の確認先として案内しない。今回の計画PRからサイト作成・公開を始めない。
- [ ] H5.2 iPhone 17 Pro Safariで3画面条件、ホーム30秒、10回再表示、別アプリ復帰、動きを減らす設定を確認する。色・巻きベロ・操作の見え方、かくつき・発熱を記録する。実機が利用できなければ未確認のまま残し、サイトデータ削除を要求しない。
- [x] H5.3 実装統合時に `npm test` と `npm run build` を1回実行する。SQL・サーバー処理を変更しない限り、この変更だけのために本番DBへ接続しない。新しい失敗や変更がない限り全試験を繰り返さない。
- [x] H5.4 仕様12項目、5つのReview Focus、実装先、テスト、画像、実機の状態を証跡で対応付ける。配点・保存・規則版・出題の変更がないことを差分で確認し、READMEの「計画段階」を実装の実際の状態へ更新する。
- [x] H5.5 実装PRに、変更点・関連試験・実機未確認範囲・確認先を記載する。mainへ直接pushせず、利用者によるマージを待つ。公開の実施有無を別に記録する。

## 4. 対応表と完了条件

| 要件 | 実装工程 | 主な証拠 |
| --- | --- | --- |
| HOME-01〜03 | H1・H3 | 24色の時刻境界、実アプリの画素 |
| HOME-04〜06 | H1・H2 | 予約と900msの段階、巻きと収納の画像 |
| HOME-07〜09 | H1・H3・H4 | 非表示・設定切替・画面遷移・姿勢復元 |
| HOME-10 | H3・H4・H5 | 3画面寸法、最大姿勢の余白、実機 |
| HOME-11〜12 | H2・H3・H4 | 資源の所有権、20往復、途中失敗・描画不可 |

この文書の作成完了と、H1〜H5の実装完了を分ける。実装と検証の状態は上のチェックと[検証記録](../../acceptance/home-idle-evidence.md)に記載する。自動試験だけが完了した場合は実機未確認を残し、巻きベロを直線の伸縮へ省略して完了扱いにしない。

[計画の検証と修正記録](../../reviews/2026-11-14-chameleol-home-idle-review.md)
