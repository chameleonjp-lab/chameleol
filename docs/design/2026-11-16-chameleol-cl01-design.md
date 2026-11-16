# CL01 設計票：全体の見た目と部品の契約

2026-11-16。担当 CL-D（見た目の設計）。製品コード・試験コードは書いていない。
正本は[全体要件](../superpowers/specs/2026-11-16-chameleol-final-requirements.md)F01〜F14 と[全体計画](../superpowers/plans/2026-11-16-chameleol-master-plan.md)の契約 IF01〜IF11 v1.1。本票は CL02（A）・CL03（B）・CL04（C）・CL05 の実装の手引き。
数値はすべて**初期値**で、実画像を見て調整してよい。「確認済み」はこの票の作成時に自分でソースを開いて確かめた事実だけ。確かめていないことは「未確認」と書く。
除外4件（E045/E051/E088/E097）は設計しない。App・規則・保存・通信・共有制御・15辞書・catalog 採否を Claude が編集する設計にしない。足りない物は「不足（処理側へ依頼）」として挙げる。
前回の設計メモ（scratchpad の `team/design-visual.md`、以下「旧メモ」）の数値を土台にし、時間・抽選・件数を描画側で持っていた箇所を新しい契約へ合わせて書き直した。

## 1. 開始状態（CL00 の照合）

### 1.1 基準

| 項目 | 値（確認済み） |
| --- | --- |
| ブランチ | `work/chatgpt-cg00-cg02-20261116`、作業ツリーはきれい |
| 開始head | `cae3efc`（受渡し文書だけの commit）。その親 `7d551ed` が CG02 準備commit（共通の開始点） |
| main | `52a6be5` |
| 通常起動 | App は舞台へ `presentationSet:'legacy80'` を渡す（`src/app.js:998`）。`resultCardPorts` 未指定。catalog は採用80/除外20（`catalog.js:2-7`） |

### 1.2 既にある物（読むだけ。再実装しない）

| 物 | 場所と実際の形（確認済み） |
| --- | --- |
| C0〜C4 の処理 | `createGameExtrasController({playId,rules,extrasPort,seed})` → `{step(input),event(e),snapshot(),dispose()}`（`game-extras-controller.js:7-63`）。step/snapshot は凍結した `{travelTongue,cameo,policeExtra,precisionBadge}` を返す |
| 舌の時計 | `src/scene/travel-tongue-motion.js`（場所は scene だが controller が import する処理側の部品。B は編集しない） |
| 小芝居の予約 | `cameo-reservations.js`。回数6・間隔15000ms・中間旗の予約・静止旗 |
| 警察2案 | `police-extras.js`。E034→E039 の順に各1回 |
| 精密札 | `precision-badge.js`。98%・500ms・1回・表示1400ms |
| 評価区間 | `evaluation-segments.js`。App が毎フレーム `drain()` して `presentation.evaluationSegments` に入れる（`app.js:1186`） |
| 輪郭8段階 | `chameleon-outline.js` の `outlineForBuilding(b)`（段階は 0〜7 の番号）、`hero.setOutlineStyle(style)` |
| 結果解析と5パネル | `result-evidence.js`、`result-evidence-view.js` の `mountResultPanels({host,t,state,panels})`（DOM と SVG だけ） |
| 結果の値 | `buildResultCardModel`（`result-card-data.js:106`）、`buildResultMiniatureModel`（`result-miniature-data.js`） |
| 共有制御 | `createResultCardController`（`result-card-controller.js:22`）、`createResultRendererOwner`（`result-renderer-owner.js:2`）、`sharePreparedResult`（`share-card.js:4`） |
| CG02 の先行準備 | App が ports 取得直後、controller と mount より前に `r.resultRendererOwner` を作る（`app.js:1674`）。舞台更新の後に `bonusPresentation.tick({...,precisionBadge:gameExtrasController.snapshot().precisionBadge})`（`app.js:1188`） |
| 表示保存 | `extrasPort`（App 側）。描画側は触らない |

### 1.3 まだ無い物（この票で設計する）

ports 本体（`result-card-ports.js`）、主カードの描画、主人公の撮影、E075 模型、E090 回転パネル、画像の保存画面、舌の描画（`tongue-rig.js`・`travel-tongue.js`）、舞台の mode 分岐（`street.js`・`stage.js`）、DOM 簡易舞台の step、背景5案と警察2案と札の表示、結果アトラスの詰め直し、街アトラスの拡張。

### 1.4 契約の記述と現行ソースの食い違い（実装はソースの形に合わせる）

| 番号 | 資料の記述 | 現行ソースの実際（確認済み） | 扱い |
| --- | --- | --- | --- |
| D01 | ports は「createResultPortrait/drawResultCard/createRenderer/destroyRenderer/mount/onChange/panels」 | App は `{...cardPorts, getPublicUrl, onChange}` を controller へ広げて渡す（`app.js:1676-1679`）。controller は ports から `createCanvas`・`encodePng`・`waitForPresentation`・`urlApi`・`focusTarget`・`visibilityTarget`・`navigator`・`shareImpl` も読む（`result-card-controller.js:28-31,49,64,68,113`）。`getLayoutKey` は App が読む（`app.js:1675`） | 製品の ports は `navigator`・`shareImpl`・`urlApi`・`waitForPresentation`・`focusTarget`・`visibilityTarget` を**定義しない**（定義すると本物を上書きする。試験の代用品だけが使う） |
| D02 | 「主カードと PNG を同じ描画元」 | controller は自分で作った canvas に `drawResultCard` して PNG にした後、`width=height=0` にして捨てる（`:35,64-75`）。snapshot に主人公の画像は無い（`:32`） | 画面のカードは ports が別の canvas に同じ `drawResultCard` で描く。主人公画像は `result.resultPortrait?.portrait?.image` から読む（下の不足 N01） |
| D03 | share の結果を見て案内を出す | `share()` は shared と cancelled のどちらも state を `'ready'` に戻す（`:117`）。準備前のタップは `'unavailable'` を返すだけで onChange を呼ばない（`:107`） | 画面は sharing→ready の遷移で `card.shareClosed`（「共有を終了しました」）を出す。タップ時の state を記録して準備中の案内を出す（§3.6） |
| D04 | 舌の段階名 | `'prepare','extend','hold','retract','store'`、各 150/250/350/450/200ms。枠は `{id,startedAt,elapsedMs,building,phase,phaseProgress,jewelVisible}`。`jewelVisible` は extend/hold/retract で true（`travel-tongue-motion.js:2,27`） | 旧メモの anticipate/settle は使わない |
| D05 | E020/E067/E068/E069 の長さ（旧メモ 2600/2000/2400/2200ms） | 4案とも 2000ms（`catalog.js:32`）。E056 は 1500ms（`cameo-reservations.js:55`） | 時間表を 2000ms・1500ms に詰め直した（§5） |
| D06 | 中間旗は 110000〜126500ms | 110000〜126500ms は通常抽選を止める予約枠。機体の開始は 125000≦t<126500 で、`placements.midpoint===true` の時だけ（`:57,86`）。間に合わない・取消・期限切れは静止旗 `{id:56,startedAt:125000,elapsedMs:0,phase:'static',building:25,durationMs:0}`（`:48`）で、以後ずっと返る | §5.6 |
| D07 | 警察2案の長さ（旧メモ 1500/1800ms） | inquiry 1200ms（id 34）、footprints 1500ms（id 39）、`phase:'investigate'`。`policeStage!==1`・ガイド・警告・`actorBusy.police`・`!placements.policeSettled` で即 null（`police-extras.js:11-12`）。elapsedMs は `running!==false` の時だけ進む | §5.7 |
| D08 | 札の表示時間（旧メモ 1200ms） | `startedAt` から 1400ms だけ snapshot が値を返す。controller はガイド・警告（App の `activeNotice`）中は null（`game-extras-controller.js:21,42`） | §5.8 |
| D09 | bonus tick の warningActive | App は `warningActive: stage>0||activeNotice` を渡す（`app.js:1188`）。警察が1人でもいると true | 札は tick の値どおり抑止する（判断は §8 Q03） |
| D10 | IF09 の `priority` | App の `readPlayView` は `priority` を作らない（`events.js:35-52`）。旧 accents でも未使用 | B は `priority` を作らない（追加すると新しい判定になる） |
| D11 | DOM 簡易舞台の step | `createDomStage(container,{course,rules})` は `presentationSet`・`gameExtrasController` を受けず、`setBestDistance(){}` は何もしない（`stage.js:18,71`） | §4.7 |
| D12 | 任意パネルは model/miniature を表示 | `mountResultPanels` は各パネルの `render(container, evidenceData, ctx)` に解析データだけを渡す（`result-evidence-view.js:128`）。`needsData!==false` だと解析待ち・欠損で描かない | E075/E090 は ports が持つ最新 snapshot を読み、`needsData:false` にする（§3.8） |
| D13 | 結果の並び | App は mount の**後**に写真（`.result-scene`）を `.result-main` の前へ入れる（`app.js:1690`）。`evidenceHost` は `.result-actions` の直後へ入る（`:1685`） | §3.5 で mount が `.result-actions` を動かす |
| D14 | 結果アトラスの作成 | `render-result-atlas.mjs:5` は `executablePath:'/usr/bin/chromium'`。この環境にその実行ファイルは無い（確認済み）。e2e は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` か Playwright 同梱を使う（`tests/e2e/helpers.mjs:14`） | A が同じ方式に直す |
| D15 | 舞台の初期化 | 本編の `createThreeStage` は効果が無効（`presentationEnabled:false`）だと accents/reactions を作らない（`street.js:795-796`） | §4.1 の表 |

### 1.5 処理側への不足（描画側で二重実装しない）

| 番号 | 不足 | 依頼 |
| --- | --- | --- |
| N01 | 画面のカードが主人公画像を読む口が契約に無い（D02） | `result.resultPortrait.portrait.image` を ports から読んでよいことの確認、または snapshot へ主人公画像を足す |
| N02 | 新しい文言キー（§3.11 の表） | 15辞書へ追加。足りない間は §3.11 の代わりの表示を使う |
| N03 | 効果無効（`effects:false`）の extended96 で札を出すか（D15） | App 側で決める（§8 Q04） |

## 2. 共通の約束

### 2.1 上限の現状と配分（新旧合計）

本編の数値は旧メモの測定（基準 `e8c69b4`、`budget.mjs`：`effects:false` を基準に既存演出を強制した最大）。その後に街の演出は増えていない（`git log e8c69b4..HEAD` で `street-accents.js`・`actor-reactions.js`・`effects.js` の変更は0件、`street.js` は輪郭の T1 の11行だけ。確認済み）。それでも**現行 head での再測定は CL03/CL04 の最初の作業**とし、それまで数値は未確認。

| 項目 | 上限 | 旧測定の最大 | B の配分 | C の配分 | 予定後の最大 |
| --- | --- | --- | --- | --- | --- |
| 追加描画呼出 | 12 | 8 | 舌1＋舌の輪郭1＋ダイヤ1＝3 | 0（既存の束を使う） | 11 |
| 追加形状 | 16 | 11 | 舌の管1＋ダイヤ1＝2 | 0 | 13 |
| 追加画像 | 4 | 2 | 0 | 0（街アトラスを大きくして1枚のまま） | 2 |
| 静的装飾 | 24 | 24（通常21〜23） | 0 | 足跡最大3、静止旗1。家具の枠を減らして空ける（§5.1） | 24 |
| 小芝居 | 同時1組・3枚 | 3 | 0 | 新5案もこの3枚（世界に固定する絵も数える） | 3 |
| 環境粒子 | 8 | 6 | 0 | 0（雨どいの水は絵2枚で粒子を使わない） | 6 |
| 成功リング | 1 | 1 | 0 | 0 | 1 |
| 1プレイの小芝居 | 6回・開始15秒間隔 | controller が数える | 数えない | 数えない | — |
| 街の枠 | 7 | 7（`SLOTS=7`） | 変えない | 変えない | 7 |
| 圧縮画像 | 1.5MiB | 3ファイル計 231,494B（`atlas.webp` 114,676＋`result-atlas.webp` 99,578＋`detected.webp` 17,240、確認済み） | 0 | 街アトラス拡張で＋約40KB（推測） | 約 0.27MiB |
| 展開後（本編） | 16MiB | 街 1024²＝4,194,304＋終了の小画像 480×720＝1,382,400 | 0 | 1024×1536 で 6,291,456 | 7,673,856 |

### 2.2 結果画面の合算 16MiB（16,777,216B）

数え方：その瞬間に同時に持つ「読み込んだ画像」「画面の canvas」「取っておく主人公画像」「開いたパネルの canvas」「保存用 img」の幅×高さ×4。PNG の Blob（圧縮）は数えない。

| 持つもの | 大きさ | バイト | 担当 |
| --- | --- | --- | --- |
| 結果アトラス（詰め直し後） | 1920×1520 | 11,673,600 | A |
| カード1枚分の画素（下の「カード枠」） | 1200×630 | 3,024,000 | A |
| 主人公の切り抜き（`result.resultPortrait`） | 360×480 以下 | 691,200 以下 | A |
| 任意パネル（E090 の WebGL canvas だけ。E075 は SVG にして画素を持たない） | 560×560 以下 | 1,254,400 以下 | A |
| 合計 | | 16,643,200 | 余り 134,016 |

「カード枠」は次の3つで**共有し、同時に2つを満杯で持たない**：
1. controller が PNG を作る間の canvas（1200×630、作った直後に controller が捨てる）
2. 画面の主カードの canvas
3. 保存画面の `img`（1200×630 の PNG を展開）

決まり：
- 画像の準備中（`state:'pending'`）の画面カードは 600×315（756,000B）の canvas で描く。この間は E090 の再取得を待たせる（§3.9）。準備中の瞬間の合計は 11,673,600＋756,000＋691,200＋3,024,000＝16,144,800B。
- `ready` になったら、controller が自分の canvas を捨てた後（onChange の中で直接描かず `queueMicrotask` で）画面カードを 1200×630 に描き直す。
- 保存画面を開いている間は画面カードの canvas を `width=height=0` にし、閉じたら描き直す（保存画面は画面全体を覆うので見た目は変わらない）。
- 主人公の撮影中は描画器の 480×720 の描画面（1,382,400B、深度の分は未確認）が一時的に増えるが、その時は主人公の切り抜きも PNG の canvas もまだ無い。
- 「描画器の同時所有1」は owner が守る。ports は描画器を自分で作らない（`createRenderer` は owner だけが呼ぶ）。

### 2.3 比較面の保護（F12）の測り方

舌・ダイヤ（B）と新しい絵（C）を、3寸法（402×700、402×874、874×402）の自動ブラウザで、描画倍率1と2で測る。

| 条件 | 測り方（試験の手順） | 合格 |
| --- | --- | --- |
| 胴＋4px と重ならない | 胴の楕円体（`hero.comparePoint` を中心に胴の半径、`chameleon28.js:342`）の8頂点を投影した画面の箱を4px広げる。舌は `getLocalEnvelope`、ダイヤは自分の箱の8頂点を `matrixWorld` で投影した箱。C の絵は各絵の4隅を投影した箱 | 箱が交わらない |
| 壁遮蔽 1.5%以下 | 同じ `t` で、舌を隠した描画と出した描画の両方で `stage.checkComparisonSurfaces()`（`street.js:1569`）を呼び、`wallPixels` の差 ÷ 隠した時の `wallPixels` | 0.015 以下 |
| 比較画素の不一致 0 | 舌・絵を出した描画で `checkComparisonSurfaces()` | `wallMismatches===0` かつ `bodyMismatches===0` |
| 端 8px | 上の箱が canvas の内側 8px に入る | 4辺とも |
| 警察1人の最大振り向き | 警察1人の時、主人公の頭は最大 `1.15×min(1,0.5×1.6)＝0.92rad` 振り向く（`chameleon28.js:547`）。`hero.head.rotation.y=-0.92` に固定した描画でも上の4つを測る | 4つとも |
| DOM の保護 | HUD（高さ 75px、測定）、ボーナス通知（上 84px から）、ガイド（上 88px から）、一致の札（402×700 で y 374〜410） | 舌・ダイヤ・C の絵の箱が重ならない、または DOM の下に隠れるだけ（canvas は DOM を覆えない） |

C の絵は既存の「比較面を描かないステンシル」（`street-accents.js:21`）を通るので、壁の正面の前に置くと**穴が開いて見える**。だから C の絵は、壁の下端の線（`y=0,z=0` の投影）より 4px 下の「道の帯」、路地の隙間、屋根より上にだけ置く（§5.1）。

### 2.4 実測した画面上の位置（この票の数値の根拠）

自動 Chromium・倍率1、`debugStart` の後に舞台のカメラで投影した値（scratchpad `visual2/measure.mjs`）。CSS px。

| 寸法 | 舞台 canvas | 主人公 x | 足 y | 胴 y | 頭 y（推定） | 壁の下端 y | 縁石の手前 y | 1単位の大きさ（胴付近） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 402×700 | 402×420 | 153 | 328 | 290 | 263 | 309〜317 | 342 | 約27px |
| 402×874 | 402×514 | 153 | 401 | 355 | 322 | 378〜388 | 419 | 約33px |
| 874×402 | 454×402 | 173 | 313 | 277 | 252 | 296〜304 | 327 | 約26px |

道の帯（壁の下端＋4px〜canvas の下端−4px）はおよそ 95px／120px／90px。警察1人目の胴は x≈68／49／92。

### 2.5 補足の常時表示（No.71/80/93/99/100）

結果画面の写真（`.result-scene`：No.71 立ち姿、No.80 写真、No.93 地区の背景、No.99 再プレイへ跳ぶ、No.100 視線の反応）は、主操作（カード・もう一度・Xでシェア・保存/本文/作り直す）の**下**に置き、畳まない・隠さない・`hidden` にしない。並べ方は §3.5。主人公が2体同時に最初の画面へ入らないこと（カードの主人公と写真の立ち姿）を 402×874 で確かめる。

## 3. CL-A（CL02）結果画面

F07〜F12、IF03/04/06/07/10。編集先：`src/presentation/result-card-ports.js`（新規）、`result-card-view.js`・`result-portrait.js`・`result-miniature-view.js`・`result-turn-view.js`（新規、名前は A が決めてよい）、`result-evidence-view.js`、`result-view.js`、`src/ui/presentation.css`、`scripts/render-result-atlas.mjs` と素材、対応試験。

### 3.1 ports の形

```js
// src/presentation/result-card-ports.js
export function createResultCardPorts({result, host, scope}) -> ports
ports = {
  createRenderer(),                       // -> THREE.WebGLRenderer | null。owner だけが呼ぶ
  destroyRenderer(renderer),              // 冪等。dispose → forceContextLoss → canvas を 0×0 → DOM から外す
  async createResultPortrait({hero, signal, rendererLease}), // -> {image, dispose}（§3.4）
  drawResultCard(canvas, {model, portrait, locale}),          // 同期。画面と PNG の共通の描画元（§3.3）
  getLayoutKey(),                         // -> 'card-1200x630-v1'（定数。§8 Q05）
  onChange(snapshot),                     // 最新を保持し、mount 済みならカードと開いたパネルへ流す
  mount({host, controller, scope, onTextShare}), // -> {dispose}（§3.5）
  panels: [MODEL_PANEL, TURN_PANEL],      // E075・E090。初回だけ登録（§3.8・§3.9）
};
```
- 定義しないもの（D01）：`createCanvas`・`encodePng`（controller の既定を使う）、`navigator`・`shareImpl`・`urlApi`・`waitForPresentation`・`focusTarget`・`visibilityTarget`（定義すると本物を上書きする）。
- `createRenderer`：`THREE.ColorManagement.enabled=false`、`new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true})`、`outputColorSpace=LinearSRGBColorSpace`、`toneMapping=NoToneMapping`、`setClearColor(0,0)`、`setPixelRatio(1)`。本編の `street.js:80-85` と同じ色の扱いにして「実色」を保つ。作れなければ `null`（owner が null を返し、controller が failed にする）。
- factory の中では描画器を借りない・DOM を作らない（owner はまだ無い。`app.js:1671-1674`）。`scope.own(dispose)` だけ登録する。

### 3.2 呼ばれる順番（App・controller・owner、確認済み）

```
App.showResult()
 1 cardPorts = createResultCardPorts({result:r, host:el, scope})   … factory。状態 {latest:null, view:null}
 2 r.resultRendererOwner ??= createResultRendererOwner({createRenderer, destroyRenderer})
 3 createResultCardController(...) の中で refresh() → ports.onChange(snapshot#1, state:'pending')
     → latest に保持するだけ（view はまだ無い）。prepare() が非同期で始まる
 4 cardPorts.mount({host:el, controller, scope, onTextShare})
     → DOM を作り、controller.snapshot() を読んで最初の描画（latest ではなく snapshot() を正とする）
 5 App が evidenceHost を .result-actions の直後へ入れ、mountResultPanels(..., panels:cardPorts.panels)
     → この時点から E090 を開ける（600ms の待ちの間でも owner から 'model' を借りられる）
 6 600ms 後：owner.acquire('portrait') → 開いている E090 の lease は onRevoke → release
     → createResultPortrait → drawResultCard → PNG → onChange(state:'ready')
 7 以後の onChange：画面カード・開いたパネルを最新へ
```
- 言語の変更は App が結果画面を作り直す（factory から再実行）。主人公は `result.resultPortrait` の署名が同じなら撮り直さない（`result-card-controller.js:45`）。
- 公式訂正・確認状態の変化は App が `cardController.refresh()` → onChange。開いている E075/E090 は onChange で更新する（IF06）。

### 3.3 主カード 1200×630

```
0                                                                          1200
┌───────────────────────────────────────────────────────────────────────────┐
│ ┌写真枠(36,36) 516×558───────────┐ ◆ カメレオる  (592, 基線92)              │
│ │ 地区の空 (48,48) 492×486        │ ┌称号の札 (592,112) 572×176──────────┐ │
│ │      光の輪 中心(294,320) r260   │ │      路地の隠れ上手                 │ │
│ │      主人公 高さ430・足 y=516    │ └───────────────────────────────┘ │
│ │   ═══台 中心(294,520)═══        │ 総得点 (592,基線336)        [確認中]    │
│ ├─────────────────────────┤ 7,280点  (592,基線470)                  │
│ │ 最も合った建物：12棟目 (帯 48px) │ ボーナス獲得 23件 (592,基線540)        │
│ └─────────────────────────┘ 20/50棟 (592,基線592)                   │
└───────────────────────────────────────────────────────────────────────────┘
```

| 要素 | 位置・大きさ | 書式（初期値） |
| --- | --- | --- |
| 背景 | 全面 | 縦の色の変化 `#1d2a5a`→`#14183a`。右半分に固定の星18個（`i=0..17`：x=`620+(i*137)%560`、y=`24+(i*89)%150`、半径 `1.5+(i%3)*0.5`、白50%）。`passed===50` の時だけ右上 (880,−40) 中心の放射線（`#ffe066` 10%、10°おき） |
| 写真枠 | 36,36,516,558 角丸8 | 地 `#eee8d4`、影 0,8,20 `#0006` |
| 写真の中 | 48,48,492,486 | 地区の空を**手続きで描く**（画像を使わない）。色と建物の影は `render-result-atlas.mjs` の `skies` と同じ値を共通の小さな関数（例 `drawDistrictSky(ctx,index,rect)`）に置き、作成スクリプトとカードの両方から使う。地区は matched なら `hero.building`、それ以外は `min(50,passed+1)`（passed が null なら1）。区分は `b<20,23,30,40` |
| 光の輪 | 中心 294,320 半径 260 | 白22%→0 の円形の色の変化 |
| 台 | 中心 294,520、横150・縦24、厚み10 | 上面 `#cbb9a4`、側面 `#a8957f`、線 `#24394b` 3px。影 (294,518) 横96・縦12 `#24394b` 35% |
| 主人公 | 中心 x=294、足 y=516、高さ430 | 切り抜き画像（上下左右4px の余白込み）を `s=430/(h−8)` で拡大。主人公が無い時は影絵（`result-evidence-view.js:9` の SILHOUETTE を 3.6倍、中心 294,330、白15%・線 白40% 3px） |
| 写真の帯 | 48,534,492,48 中央 | 28px・700・`#342811`。matched：`resultBestBuilding`＋「：」＋`evidence.building`。missing：`card.noRecord`。主人公 pending：`evidence.pending`。準備失敗（`state:'failed'` かつ prepared 無し）：`card.failed`。棟平均・瞬間一致度の数値は載せない（F08 の分離） |
| ゲーム名 | 592,60〜92 | 小さなダイヤ（幅24・高さ32、§4.4 と同じ3色）＋`app.title` 40px・900・`#8dff6a`、縁 6px `#0a0c1e`、x=624 |
| 称号の札 | 592,112,572,176 角丸18 | 地 `#232a5e`、枠 `#ffe694` 4px（50棟は `#ffd43b` 6px）。文字域 604,124,548,152。`#fff6d6` 900。文字は `rankKey` があれば `card.rank.<rankKey>`、無ければ `card.confirming` |
| 総得点の見出し | 592,基線336 | `result.total` 30px・700・`#fff0a0` |
| 確認中の札 | 右端1164、306〜346 | `verificationState` が `accepted`・`verifying`・`pending_review`・`under_review` で、かつ `rankKey!==null` の時だけ。地 `#ffcc4d`、`card.confirming` 26px・800・`#3b2a00`、左右16、角丸999。順位は載せない |
| 得点 | 592,基線470、幅572 | `card.score` を `{score}` で分け、数字は `formatNumber(totalScore,{},locale)` 132px・900・縦の色の変化 `#fff6b0→#ffd43b→#ff922b`・下6px の影 `#5c3a00`、前後の文字 40px・700・`#fff0a0`。null は「—」 |
| ボーナス件数 | 592,490,572,64、基線540 | `card.bonusCount` を `{count}` で分け、数字 60px・900・白、前後 34px・800・`#fff6d6`。`countState:'missing'`（旧版・破損）は `card.bonusMissing`（不足 N02。届くまでは `bonus.card.title`＋空白＋`evidence.colors.missing`）34px・`#b9bee6`。0件は「0」（F09） |
| 通過数 | 592,564,572,36、基線592 | `card.passed` を `{count}` で分け、数字 34px・900・白、前後 28px・700・`#b9bee6`。null は「—」 |

- 書体：`'<weight> <size>px system-ui, -apple-system, "Hiragino Sans", "Noto Sans", "Noto Sans JP", "Noto Sans Thai", "Noto Sans Arabic", sans-serif'`（`game.css:35` と同じ並び）。
- 文言は **引数の `locale`** で引く（`t(key,params,locale)`、`formatNumber(v,{},locale)`）。`getLanguage()` を使わない（画面と PNG を同じにするため）。
- canvas の大きさが 1200×630 でない時（画面の準備中 600×315）は `ctx.scale(canvas.width/1200, canvas.height/630)` で同じ座標系に描く。文字の幅は `measureText`（変換の影響を受けない）で測るので、改行と縮小の結果は同じになる。
- 載せない物：名前、playId、seed、照会情報、順位（F11）。

#### 3.3.1 長い称号・文字の縮め方（15言語×27称号＝405通り）

現行辞書で最も長い称号は de 37文字（「Fluchtkünstler mit tausend Gesichtern」）、ru 36、it 35。日本語・中国語は最大10文字（確認済み）。
1. 1行で 72px から 4px ずつ下げて 48px まで。
2. 入らなければ2行（行の高さ1.15）で 60px から 40px まで。
3. それでも入らなければ 40px・2行で横を最大12%縮める（`ctx.scale(0.88,1)`）。
4. まだ入らなければ 40px・3行。省略記号「…」は使わない。
- 改行：空白のある言語は空白で。ja・zh・ko・th は `Intl.Segmenter(locale,{granularity:'word'})`（無ければ1文字ずつ。行頭に「ー。、！）」を置かない）。iPhone の `Intl.Segmenter` 対応は未確認。
- 得点は 132px で幅572に入らなければ 4px ずつ 88px まで。ボーナス件数・通過数は全体を 0.7倍まで、次に横 0.85倍まで、最後に2行。写真の帯は 28→22px、横0.85倍、2行（22px）。
- 確認中の札と見出しが重なる時は見出しを先に縮める（30→22px）、次に札を 20px まで。
- 試験は 405通りを描き、文字域からのはみ出し0、3段目へ進んだ件数（目標0）を記録する。

#### 3.3.2 状態ごとの見せ方（画面カード）

| snapshot | 画面カードの canvas | 主人公 | 主ボタン「Xでシェア」 | 状態の小文字（aria-live） | 作り直す |
| --- | --- | --- | --- | --- | --- |
| `pending` | 600×315 | 影絵（帯は matched/missing/pending の文） | `aria-disabled=true`、不透明度0.6 | `card.preparing` | 隠す |
| `ready` | 1200×630 | 実色の切り抜き | 有効 | なし。直前が `sharing` なら `card.shareClosed` | 隠す |
| `sharing` | そのまま | そのまま | `aria-disabled=true`（連打止め） | なし | 隠す |
| `failed` で prepared 無し（準備失敗） | 600×315 | 影絵・帯 `card.failed` | 有効（押すと案内だけ） | `card.failed` | 出す（`controller.retry()`） |
| `failed` で prepared あり（共有失敗） | 1200×630 | 実色 | 有効 | `card.shareFailed`（不足 N02。届くまでは文なしで小ボタン行の枠を 2px `#ffcc4d`） | 隠す |
| `unavailable` | prepared があれば 1200×630、無ければ 600×315 | 同左 | 有効（押すと案内だけ） | `card.shareUnavailable`、フォーカスを「画像を保存」へ | 隠す |

- 主人公の切り抜きを使うのは `snapshot.prepared?.revision===snapshot.revision` の時だけ（その時 `result.resultPortrait` は今の主人公。D02・N01）。
- 主成績と「もう一度」は最初から使える（カードの状態を待たない）。
- `missing`（一致度の記録なし）は既定色の主人公で PNG を作れるので共有できる。pending の仮の絵は PNG にならない（controller が作らない）。

### 3.4 主人公の撮影（`createResultPortrait`）

1. `signal` か `rendererLease.signal` が中断済みなら `AbortError` を投げる（以下の各段の後でも確かめる）。
2. `renderer=rendererLease.renderer`、`setSize(480,720,false)`。カメラ `PerspectiveCamera(32,480/720,.1,100)`、位置 (5,3.2,8)、注視点 (0,1.45,0)（結果アトラスと同じ構図、`render-result-atlas.mjs:11`）。照明は不要（トゥーンの材質）。
3. `createChameleon()`（`characters.js:12` の再輸出）を新しく作る。`setColor(rgbFloat(hero.hsv))`（本編と同じ変換 `palette-colors.js:4`）、`setOutlineStyle(outlineForBuilding(hero.outlineBuilding))`（最高一致棟の段階。missing は 1）。姿勢：`animate(0.7,{walking:false})`、`group.rotation.y=-0.35`（右＝称号の方を向く）、`head.rotation.z=0.12`、`jewel.visible=true`。舌は出さない。乱数・色の循環は使わない。
4. 描画 → 2D canvas 480×720 へ写す → 不透明（alpha>20）の範囲 ±4px で切り抜く。360×480 を超える時は縦横比を保って縮める。結果は 2D canvas（`w×h×4≦691,200`）。描画器の破棄後も使える。
5. 一時の 2D canvas は 0×0、作った主人公は `dispose()`。
6. 返り値 `{image:切り抜きcanvas, dispose(){image.width=image.height=0}}`。失敗は例外にする（主人公の無い PNG を作らない）。

### 3.5 結果画面の並びと 3寸法

mount が行うこと（App の DOM の**並びだけ**を変える。App のコードは変えない。§8 Q06）：
1. `host.classList.add('has-result-card')`。
2. カード `section.result-card`（canvas＋下の1行）を作り、`.result-title` の直後へ入れる。
3. `.result-actions` をカードの直後へ移す。中の `[data-testid=result-share]`（App の既存ボタン。黒地白字 `.btn-x`）を `[data-testid=result-again]` の直後へ移し、`result-card-share` を付ける。
4. その直後へ小ボタン行 `div.result-card-secondary`：「画像を保存」`card.save`、「本文でXを開く」`card.textShare`（`onTextShare()` を呼ぶ）、「作り直す」`card.retry`（準備失敗の時だけ）、状態の小文字 `p.result-card-status[aria-live=polite]`。
5. dispose で自分の要素・class・購読を外す（App の要素は戻さない。画面ごと捨てられるため）。

最終の並び（DOM と見た目が同じ。写真と成績だけ CSS の `order` で入れ替える）：
```
題「逃げきった！」
[主カード 幅=列幅]               … 402幅で 370×194
称号・ボーナス獲得 23件           … 1行（2行まで）。称号＋「 · 」＋card.bonusCount（新しいキー不要）
[ もう一度 ]                      … 既存の主ボタン
[ Xでシェア ]                     … 既存の .btn-x
[画像を保存][本文でXを開く]       … 40px、最初から出す。共有中も押せる
状態の小文字
[ホームへ][ランキング]
ふり返り（チップ・開いた1パネル）  … order 4
成績（通過・平均・最大連続・総得点） … order 5
写真（No.71/80/93/99/100）          … order 6。畳まない
注記・状態・補足の詳細・ランキング  … order 10（DOM の順のまま）
```
- 主ボタンのタップは App の既存ハンドラが `controller.share()` を**直接**呼ぶ（`app.js:1731`）。ports は追加のリスナーを `.result-actions` の捕捉段階に置いてタップ時の state を覚え、泡立ち段階で上の表の案内を出す（伝播を止めない・share を遅らせない）。
- 402×700 の見込み（計算）：題 27〜72、カード 87〜281、1行 287〜307、もう一度 315〜363、Xでシェア 379〜427、小ボタン 435〜475、ホーム 491〜539。主操作は最初の画面に入る。402×874 は同じ位置で、写真は約 880px 以降（最初の画面に入らない）。
- 874×402（`orientation:landscape and max-height:500px`）は2列の格子：左列にカード（約311×163＋1行）、右列に題（1.6rem）→ `.result-actions`。それ以外は全幅で下へ。右列の高さの見込み 約330px（ホーム・ランキングまで）。
- 試験は3寸法で、主カード・もう一度・Xでシェア・小ボタン2つがスクロール前に入ること、写真の主人公がスクロール前に入らないこと、横にはみ出さないことを測る。

CSS（`presentation.css`、A だけが書く。初期値）：
```css
.screen.result.has-result-card{display:flex;flex-direction:column}
.screen.result.has-result-card>*{order:10}
.screen.result.has-result-card>.result-title{order:1}
.screen.result.has-result-card>.result-card{order:2;margin:0 0 4px}
.screen.result.has-result-card>.result-actions{order:3}
.screen.result.has-result-card>.result-evidence-host{order:4}
.screen.result.has-result-card>.result-main{order:5}
.screen.result.has-result-card>.result-scene{order:6;margin-top:10px}
.result-card-canvas{display:block;width:100%;height:auto;aspect-ratio:1200/630;border-radius:10px;box-shadow:0 4px 12px #0006}
.result-card-summary{margin:6px 0 0;font-size:16px;font-weight:700;line-height:1.3;color:#fff6d6;text-align:center;overflow-wrap:anywhere}
.result-card-secondary{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
.result-card-secondary .btn{flex:1 1 140px;width:auto;min-height:40px;margin:0;font-size:.9rem}
.result-card-status{flex-basis:100%;margin:0;font-size:14px;line-height:1.4;color:#fff0a0}
.result-card-status:empty{display:none}
.result-actions [aria-disabled=true]{opacity:.6}
@media(orientation:landscape) and (max-height:500px){
 .screen.result.has-result-card{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);column-gap:14px;align-items:start}
 .screen.result.has-result-card>*{grid-column:1/-1}
 .screen.result.has-result-card>.result-card{grid-column:1;grid-row:1/span 2}
 .screen.result.has-result-card>.result-title{grid-column:2;grid-row:1;font-size:1.6rem;margin:0 0 4px}
 .screen.result.has-result-card>.result-actions{grid-column:2;grid-row:2}
}
```

### 3.6 読み上げと文字

- canvas は `role="img"`、`aria-label` は既存キーだけで組む：`app.title`: 称号. `result.total` `card.score`. `card.bonusCount`（missing は §3.3 の代わりの文）. `card.passed`. 主人公の文（matched：`resultBestBuilding`: `evidence.building`、missing：`card.noRecord`、pending：`evidence.pending`）。状態が変わるたびに更新する。
- カードの下の1行は画面の文字（`aria-hidden="true"`。canvas の名前と重ねて読ませない）。

### 3.7 画像の保存画面（IF07）

```
┌ 画像を保存 ─────────────────── [閉じる] ┐
│ ┌──────────────────────────────┐ │
│ │ <img src=controller.getImageUrl()>    │ │  幅いっぱい、比 1200:630
│ └──────────────────────────────┘ │
│ 画像を長押しして保存できます（card.saveHint） │
│ [ 画像を保存 ]（<a download="chameleol-result.png">） │
└──────────────────────────────────┘
```
- 「画像を保存」を押した時だけ `getImageUrl()` を呼ぶ。null（準備中・古い版）なら開かず、状態の小文字に `card.preparing`（失敗時は `card.failed`）。
- `div.result-card-viewer[role=dialog][aria-modal=true]`、地 `#14183a` 96%、枠 `#ffffff33`、角丸16、左右16px。見出しは `card.save`（`card.viewerTitle` を不足 N02 として依頼）。`img.alt` は §3.6 の文。開いたら「閉じる」（`common.close`）へフォーカス、Esc で閉じる。
- 開いている間は画面カードの canvas を 0×0（§2.2）。閉じたら `revokeImageUrl()`、画面カードを描き直し、フォーカスを「画像を保存」へ戻す。onChange で revision が変わったら閉じる（controller の refresh は URL を自分で解除する、`result-card-controller.js:87`）。
- canvas の長押しでは iPhone で保存できない（旧レビューの知識。実機は未確認）ので、保存は必ず `img` で行う。

### 3.8 E075 街の模型（SVG。描画器も canvas も使わない）

- パネル定義：`{id:'model', order:60, labelKey:'evidence.model.title', needsData:false, render}`。render は ports が持つ最新 snapshot の `miniature` を読む。`miniature.available===false` は `evidence.unavailable` の点線の枠。
- SVG `viewBox="0 0 340 260"`、幅100%。10棟ずつ5段の「すごろく」：段 r（0〜4）の基線 y=`52+r*44`、列 c（0〜9）の x=`22+c*30`、偶数段は左→右、奇数段は右→左。道は箱の足元を結ぶ折れ線 `#2a3263` 幅10・角丸。
- 箱：幅26、奥行きのずれ (+8,−6)、高さは地区で 18/22/20/26/34、線 `#24394b` 1.5。

| 状態 | 正面 | 上面・側面 | 印 |
| --- | --- | --- | --- |
| passed | 壁色 `hsvToHex(wallHsv)` | 上 白30%混ぜ、側 黒25%混ぜ | 正面の左下に 8×8 の体の色の札（`bodyHsv`）。無ければ点線の空の札 |
| arrived | 壁色 | 同上 | 点線の縁 `#ff8a8a` 2px＋屋根に赤い三角旗 `#ff5a5f`。体の色の札（`finalColors` 由来）。無ければ点線 |
| unreached | 白8% | 上面なし | 点線 白25% |
| 壁色の欠損（wallHsv null） | 塗らない | 塗らない | 点線 白40%（推測の色で埋めない） |

- 主人公の影絵（幅16、`arrived` の棟。全50棟 passed なら50棟目）をその棟の `bodyHsv`、無ければ白で。50棟クリアは50棟目の箱の縁を `#ffd43b` 2px。
- 凡例は DOM の文字（色だけでなく塗り・点線・旗の形でも区別）：通過／到達／未到達／色の記録なし（キーは不足 N02）。SVG は `role=img`、`aria-label` は `result.buildings`: `{passed}/50`（既存キー）で始める。
- onChange で miniature が変わったら SVG を作り直す（開いている時だけ）。

### 3.9 E090 回して見る（owner から 'model' を借りる）

- パネル定義：`{id:'turn', order:70, labelKey:'evidence.turn.title', needsData:false, render}`。render は「パネルの1回分」の物を作り、`{dispose(), update(snapshot)}` を返す（mountResultPanels は dispose だけを使う。ports は生きている回の update を自分の onChange から呼ぶ）。
- 正方形 300×300（列幅まで）。地はカードの写真と同じ光の輪＋`#14183a`、足元に台（CSS の楕円）。canvas は借りた描画器の `domElement`。`setPixelRatio(min(devicePixelRatio, 560/300))` で裏の大きさを 560×560 以下（1,254,400B 以下）にする。
- カメラ `PerspectiveCamera(32,1,.1,100)`、位置 (0,1.9,9.5)、注視点 (0,1.45,0)（初期値。尻尾まで入るかを画像で調整）。主人公はカードと同じ色・輪郭段階・姿勢（§3.4 の 3）。
- 操作：`pointerdown` で始点、横に 8px 以上かつ縦より大きく動いた時だけ回す（`rotation.y = 始めの角 + dx×0.012`）。それまではタップ・スクロールのまま。`touch-action:pan-y`。慣性・自動回転なし。描くのは動かした時に rAF 1回だけ（ループを持たない）。左右に 44px の「◀」「▶」（π/6 ずつ）。説明の1行（キーは不足 N02）。主カードは触っても回らない。
- 借り方：
  1. 開いた時、`model.hero.status==='pending'` なら `evidence.pending` を出して借りない。
  2. それ以外は `owner.acquire('model',{signal,onRevoke})`（signal はこの回の AbortController）。最初の600ms の間でも借りてよい。
  3. `onRevoke`（撮影が優先）：canvas を外し、この回の主人公・材質を破棄し、`card.preparing` を出して「カード待ち」にする。描画器そのものは owner が `destroyRenderer` で壊す。
  4. 「カード待ち」の間に onChange が `state` を `ready`・`failed`・`unavailable` にしたら、**その時の model** で借り直す（向きは0へ）。`pending` の間は借りない（§2.2 の合算のため）。
  5. 開いている間に主人公の署名（`status,building,hsv,outlineBuilding`）が変わったら、手放して 4 と同じく待つ（撮影が先）。言語だけの変化は説明の文字を差し替えるだけ。
  6. 閉じる・別のパネル・dispose：abort → `lease.release()` → 主人公と材質を破棄。冪等。

### 3.10 既存の5パネルの直し（`result-evidence-view.js`・`presentation.css`）

- 警戒グラフの印（今は真値の位置に半径5の丸と番号を重ねている、`result-evidence-view.js:162-165`）：
  - 真値の点：`circle r=3 fill=#fff stroke=#14183a stroke-width=1` を本当の位置 (cx, trueY) に必ず置く。
  - 番号の丸：`r=7 fill=#fff stroke=#14183a stroke-width=1.5`、数字 `font-size=10 font-weight=700 fill=#14183a`。真値の点の中心から 14px 上（上端 `y0−4` を越える時は 14px 下）。前の番号の丸と中心が 16px 未満なら、さらに 16px ずつ同じ向きへずらす。
  - 連結線：真値の点の縁から番号の丸の縁まで `stroke=#fff stroke-width=1`。描く順は 面→線→連結線→真値の点→番号の丸。真値の点は動かさない。
- 最長成功フィルム：`.evidence-film-frame{width:38px}`（今は44px、`presentation.css:154`）。
- 3コマ・2色・立て直し・グラフの他の部分は変えない。

### 3.11 結果アトラスの詰め直しと result-view の計算

| 区画 | 今 [x,y,w,h] | 新 [x,y,w,h] |
| --- | --- | --- |
| 空 1・20・23 | [0/640/1280,0,640,400] | 同じ |
| 空 30・40 | [0/640,400,640,400] | 同じ |
| 視線 glance | [0,1680,240,360] | [1280,400,240,360] |
| 立ち姿 clear・detected・quit・proud | [0/480/960/1440,960,480,720] | [0/480/960/1440,800,480,720] |
| 全体 | 2048×2048＝16,777,216B | 1920×1520＝11,673,600B |

```
1920 ┌空1──────┬空20─────┬空23─────┐ 0
     ├空30─────┼空40─────┼glance┐   │ 400
     ├clear──┬detected┬quit──┬proud──┤ 800
     └───────┴────────┴──────┴───────┘ 1520
```
- `render-result-atlas.mjs`：配置の定数を上へ、`executablePath` を e2e と同じ方式へ（D14）。区画の中身は変えない。配置表を `result-atlas-bounds.js` にも書き出す（例 `export const RESULT_ATLAS={width,height,backgrounds,portraits,reaction}`。`PORTRAIT_BOUNDS` は区画の中の座標なので値は同じ）。
- 作り直した画像は描画器の違いで画素が変わり得る。10区画を前後で比べ（各区画の平均絶対差・最大差を記録）、差が目で分かる時は「今の画像から区画を切り出して並べ直す」方法（PIL の crop/paste、WebP 品質88）に替える。どちらにしたかを票に書く。
- `result-view.js`：`2048` の直書き（`:11` の sprite）と区画の座標（`:12-14,:66` の 960・1680）を `RESULT_ATLAS` から計算する。
- `presentation.css:42` の `.ending-comic` の古い `background-size`/`background-position`（2048 前提。`:55` で detected.webp に上書き済み）を消す。
- 既存の e2e（`presentation.e2e.mjs:218-237` の展開後16MiB、`result-actions.e2e.mjs`）は変えずに通す。

### 3.12 新しい文言（15辞書は編集しない。不足 N02 として処理側へ依頼）

既存キーで足りる物：`card.rank.*`・`card.bonusCount`・`card.passed`・`card.score`・`card.noRecord`・`card.preparing`・`card.failed`・`card.confirming`・`card.shareUnavailable`・`card.save`・`card.textShare`・`card.retry`・`card.saveHint`・`card.shareClosed`・`app.title`・`result.total`・`result.buildings`・`resultBestBuilding`・`evidence.building`・`evidence.pending`・`evidence.unavailable`・`common.close`（ja で確認済み）。

| 依頼するキー | 日本語の案 | 届くまでの表示 |
| --- | --- | --- |
| `card.bonusMissing` | ボーナス獲得 記録なし | `bonus.card.title`＋空白＋`evidence.colors.missing` |
| `card.shareFailed` | 共有できませんでした。画像を保存するか、本文でXを開いてください。 | 文なし・小ボタン行の枠の強調 |
| `card.viewerTitle` | 結果の画像 | `card.save` |
| `evidence.model.title`／`.passed`／`.arrived`／`.unreached`／`.missing`／`.alt` | 街の模型／通過／到達／未到達／色の記録なし／街の模型。50棟のうち{passed}棟を通過、{arrived}棟目まで到達 | 英語の控え（`bonus-view.js:3` の FALLBACK と同じ作り）。控えは辞書が揃ったら消す |
| `evidence.turn.title`／`.hint`／`.left`／`.right`／`.alt` | 回して見る／左右になぞると回ります／左へ回す／右へ回す／今回の主人公。左右に回して見られます | 同上 |
| `presentation.nearPerfect` | ほぼ完全一致！ | C が使う。§5.8 |

控えの英語は ports を明示した試験（CL05）でだけ見える。G4 で辞書が揃うまで「15言語の文言」は未完了として票に残す。
