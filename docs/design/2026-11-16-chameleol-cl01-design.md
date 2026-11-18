# CL01 設計票：全体の見た目と部品の契約

**2026-11-17 CL02受入修正：** [独立レビューと修正記録](../reviews/2026-11-17-chameleol-cl02-acceptance-review.md)を反映。§1の開始状態はCL01作成時の履歴で、CL02の結果部品は既に追加済み。以下の画像配分と撮影寸法は現在の修正値、未実装のCL03/04は元の担当で継続する。

**2026-11-16 ChatGPT補足反映：** 契約v1.2と[CG02補足受渡し](../acceptance/chameleol-chatgpt-unblock-20261116.md)を正とする。N01/N03/Q01/Q03〜06は下表のとおり確定。N02/Q02の翻訳は、両者の実装完了後にChatGPTがまとめて行う。§1.4の行番号は補足前90473eeの調査記録であり、現在の行番号ではない。

2026-11-16。担当 CL-D（見た目の設計）。製品コード・試験コードは書いていない。
正本は[全体要件](../superpowers/specs/2026-11-16-chameleol-final-requirements.md)F01〜F14 と[全体計画](../superpowers/plans/2026-11-16-chameleol-master-plan.md)の契約 IF01〜IF11 v1.2。本票は CL02（A）・CL03（B）・CL04（C）・CL05 の実装の手引き。
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
| 評価区間 | `evaluation-segments.js`。App が毎フレーム `drain()` して `presentation.evaluationSegments` に入れる（`app.js:1187`） |
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
| D02 | 「主カードと PNG を同じ描画元」 | controller は自分で作った canvas に `drawResultCard` して PNG にした後、`width=height=0` にして捨てる（`:35,64-75`）。補足前はsnapshotに主人公の画像が無かった。v1.2でportraitImageを追加済み | 画面のカードは ports が別の canvas に同じ `drawResultCard` で描く。主人公画像は `snapshot.portraitImage` から借りる（N01解消） |
| D03 | share の結果を見て案内を出す | `share()` は shared と cancelled のどちらも state を `'ready'` に戻す（`:117`）。準備前のタップは `'unavailable'` を返すだけで onChange を呼ばない（`:107`） | 画面は sharing→ready の遷移で `card.shareClosed`（「共有を終了しました」）を出す。タップ時の state を記録して準備中の案内を出す（§3.5） |
| D04 | 舌の段階名 | `'prepare','extend','hold','retract','store'`、各 150/250/350/450/200ms。枠は `{id,startedAt,elapsedMs,building,phase,phaseProgress,jewelVisible}`。`jewelVisible` は extend/hold/retract で true（`travel-tongue-motion.js:2,27`） | 旧メモの anticipate/settle は使わない |
| D05 | E020/E067/E068/E069 の長さ（旧メモ 2600/2000/2400/2200ms） | 4案とも 2000ms（`catalog.js:32`）。E056 は 1500ms（`cameo-reservations.js:55`） | 時間表を 2000ms・1500ms に詰め直した（§5） |
| D06 | 中間旗は 110000〜126500ms | 110000〜126500ms は通常抽選を止める予約枠。機体の開始は 125000≦t<126500 で、`placements.midpoint===true` の時だけ（`:57,86`）。間に合わない・取消・期限切れは静止旗 `{id:56,startedAt:125000,elapsedMs:0,phase:'static',building:25,durationMs:0}`（`:48`）で、以後ずっと返る | §5.7 |
| D07 | 警察2案の長さ（旧メモ 1500/1800ms） | inquiry 1200ms（id 34）、footprints 1500ms（id 39）、`phase:'investigate'`。`policeStage!==1`・ガイド・警告・`actorBusy.police`・`!placements.policeSettled` で即 null（`police-extras.js:11-12`）。elapsedMs は `running!==false` の時だけ進む | §5.8 |
| D08 | 札の表示時間（旧メモ 1200ms） | `startedAt` から 1400ms だけ snapshot が値を返す。controller はガイド・警告（App の `activeNotice`）中は null（`game-extras-controller.js:21,42`） | §5.9 |
| D09 | bonus tick の warningActive | App は `warningActive: stage>0||activeNotice` を渡す（`app.js:1188`）。警察が1人でもいると true | 札は tick の値どおり抑止する（判断は §8 Q03） |
| D10 | IF09 の `priority` | App の `readPlayView` は `priority` を作らない（`events.js:35-52`）。旧 accents でも未使用 | B は `priority` を作らない（追加すると新しい判定になる） |
| D11 | DOM 簡易舞台の step | `createDomStage(container,{course,rules})` は `presentationSet`・`gameExtrasController` を受けず、`setBestDistance(){}` は何もしない（`stage.js:18,71`） | §4.7 |
| D12 | 任意パネルは model/miniature を表示 | `mountResultPanels` は各パネルの `render(container, evidenceData, ctx)` に解析データだけを渡す（`result-evidence-view.js:128`）。`needsData!==false` だと解析待ち・欠損で描かない | E075/E090 は ports が持つ最新 snapshot を読み、`needsData:false` にする（§3.8） |
| D13 | 結果の並び | App は mount の**後**に写真（`.result-scene`）を `.result-main` の前へ入れる（`app.js:1694`）。`evidenceHost` は `.result-actions` の直後へ入る（`:1685`） | §3.5 で mount が `.result-actions` を動かす |
| D14 | 結果アトラスの作成 | `render-result-atlas.mjs:5` は `executablePath:'/usr/bin/chromium'`。この環境にその実行ファイルは無い（確認済み）。e2e は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` か Playwright 同梱を使う（`tests/e2e/helpers.mjs:14`） | A が同じ方式に直す |
| D15 | 舞台の初期化 | 本編の `createThreeStage` は効果が無効（`presentationEnabled:false`）だと accents/reactions を作らない（`street.js:795-796`） | §4.1 の表 |

### 1.5 処理側への不足（描画側で二重実装しない）

| 番号 | 不足 | 依頼 |
| --- | --- | --- |
| N01 | 画面のカードが主人公画像を読む口（D02） | 解消済み。snapshot.portraitImageを追加。画像の所有/解放はcontrollerとresult側のまま |
| N02 | 新しい文言キー（§3.12 の表） | 翻訳は両者の実装完了後にChatGPTが一括対応。今回は15辞書を編集せず§3.12の控えで進める |
| N03 | 効果無効（`effects:false`）のextended96の札（D15） | 解消済み。stepは1回続け、Appが通知値をnullにして表示を止める。簡易DOMだけなら止めない |

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
| No.28の目画像 | 256×256 | 262,144 | A |
| 任意パネル（E090。最大の主人公画像を保持する配分例） | この例は530×530。実画像が小さければ残り予算から最大560×560 | 1,123,600（この例） | A |
| 配分例の合計 | 最大の主人公画像691,200Bを保持 | 16,774,544 | 余り2,672。実画像と残り予算から都度決定 |

「カード枠」は次の3つで**共有し、同時に2つを満杯で持たない**：
1. controller が PNG を作る間の canvas（1200×630、作った直後に controller が捨てる）
2. 画面の主カードの canvas
3. 保存画面の `img`（1200×630 の PNG を展開）

決まり：
- 画像の準備中（`state:'pending'`）の画面カードは 600×315（756,000B）の canvas で描く。準備中に開いている E090 は裏の大きさを 300×300（360,000B）に下げ、撮影で取り上げられた後の借り直しは準備が終わるまで待つ（§3.9）。準備中は目画像262,144Bも数え、最大11,673,600＋756,000＋691,200＋3,024,000＋360,000＋262,144＝16,766,944B。
- controllerはPNGのBlob完成後に生成canvasを解放し、その後readyを通知する。画面カードは従来のqueueMicrotaskで1200×630へ描き直し、E090が通知中に拡大しても生成面と重ねない。
- 保存画面を開いている間は画面カードの canvas を `width=height=0` にし、閉じたら描き直す（保存画面は画面全体を覆うので見た目は変わらない）。
- 撮影は472×708の描画面/作業面/読出し配列を数える。アトラス11,673,600＋画面756,000＋3面4,010,112＋目画像262,144＝16,701,856B。GPUの深度/MSAA/内部コピーを含む全体使用量は未確認で、この画像画素の上限とは別に扱う。
- 「描画器の同時所有1」は owner が守る。ports は描画器を自分で作らない（`createRenderer` は owner だけが呼ぶ）。

### 2.3 比較面の保護（F12）の測り方

舌・ダイヤ（B）と新しい絵（C）を、3寸法（402×700、402×874、874×402）の自動ブラウザで、描画倍率1と2で測る。

| 条件 | 測り方（試験の手順） | 合格 |
| --- | --- | --- |
| 胴＋4px と重ならない | 胴の楕円体（`hero.comparePoint` を中心に胴の半径、`chameleon28.js:342`）の8頂点を投影した画面の箱を4px広げる。舌は `getLocalEnvelope`、ダイヤは自分の箱の8頂点を `matrixWorld` で投影した箱。C の絵は各絵の4隅を投影した箱 | 箱が交わらない |
| 壁遮蔽 1.5%以下 | 同じ `t` で、舌を隠した描画と出した描画の両方で `stage.checkComparisonSurfaces()`（`street.js:1569`）を呼び、`wallPixels` の差 ÷ 隠した時の `wallPixels` | 0.015 以下 |
| 比較画素の不一致 0 | 舌・絵を出した描画で `checkComparisonSurfaces()` | `wallMismatches===0` かつ `bodyMismatches===0` |
| 端 8px | 上の箱が canvas の内側 8px に入る（舌・ダイヤは毎フレーム。C の世界に固定する絵は置く時。§5.1・§8 Q07） | 4辺とも |
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
  getLayoutKey(),                         // -> 'card-1200x630-v1'（構図版。Appが画面寸法を合成。§8 Q05）
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
| ゲーム名 | 592,60〜92 | 小さなダイヤ（幅24・高さ32、§4.5 と同じ3色）＋`app.title` 40px・900・`#8dff6a`、縁 6px `#0a0c1e`、x=624 |
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

- 主人公の切り抜きは`snapshot.portraitImage`から借りる。現在のheroと一致しない画像、撮影前、dispose後はnull。画像を変更/解放しない。共有可能かどうかは従来どおり`prepared?.revision===revision`で判断する（D02・N01）。
- 主成績と「もう一度」は最初から使える（カードの状態を待たない）。
- `missing`（一致度の記録なし）は既定色の主人公で PNG を作れるので共有できる。pending の仮の絵は PNG にならない（controller が作らない）。

### 3.4 主人公の撮影（`createResultPortrait`）

1. `signal` か `rendererLease.signal` が中断済みなら `AbortError` を投げる（以下の各段の後でも確かめる）。
2. `renderer=rendererLease.renderer`、`setSize(472,708,false)`。カメラ `PerspectiveCamera(32,472/708,.1,100)`、位置 (5,3.2,8)、注視点 (0,1.45,0)（結果アトラスと同じ構図、`render-result-atlas.mjs:11`）。照明は不要（トゥーンの材質）。
3. `createChameleon()`（`characters.js:12` の再輸出）を新しく作る。`setColor(rgbFloat(hero.hsv))`（本編と同じ変換 `palette-colors.js:4`）、`setOutlineStyle(outlineForBuilding(hero.outlineBuilding))`（最高一致棟の段階。missing は 1）。姿勢：`animate(0.7,{walking:false})`、`group.rotation.y=-0.35`（右＝称号の方を向く）、`head.rotation.z=0.12`、`jewel.visible=true`。舌は出さない。乱数・色の循環は使わない。
4. 描画 → 2D canvas 472×708 へ写す → 不透明（alpha>20）の範囲 ±4px で切り抜く。360×480 を超える時は縦横比を保って縮める。結果は 2D canvas（`w×h×4≦691,200`）。描画器の破棄後も使える。
5. 一時の 2D canvas は 0×0、作った主人公は `dispose()`。
6. 返り値 `{image:切り抜きcanvas, dispose(){image.width=image.height=0}}`。失敗は例外にする（主人公の無い PNG を作らない）。

### 3.5 結果画面の並びと 3寸法

mount が行うこと（App の DOM の**並びだけ**を変える。App のコードは変えない。§8 Q06）：
1. `host.classList.add('has-result-card')`。
2. カード `section.result-card`（canvas＋下の1行）を作り、`.result-title` の直後へ入れる。
3. `.result-actions` をカードの直後へ移す。中の `[data-testid=result-share]`（App の既存ボタン。黒地白字 `.btn-x`）を `[data-testid=result-again]` の直後へ移し、`result-card-share` を付ける。
4. その直後へ小ボタン行 `div.result-card-secondary`：「画像を保存」`card.save`、「本文でXを開く」`card.textShare`（`onTextShare()` を呼ぶ）、「作り直す」`card.retry`（準備失敗の時だけ）、状態の小文字 `p.result-card-status[aria-live=polite]`。
5. dispose で自分の要素・class・購読を外し、画面カードの canvas を 0×0 にし、保存画面が開いていれば閉じて `revokeImageUrl()` を呼ぶ（言語の変更で画面を作り直す時に古い画素を残さない）。App の要素は戻さない（画面ごと捨てられるため）。

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
- 402×700 の見込み（計算）：題 27〜72、カード 87〜281、1行 287〜307、もう一度 315〜363、Xでシェア 379〜427、小ボタン 435〜475、ホーム 491〜539。主操作は最初の画面に入る。402×874 は同じ位置で、写真は約 870px 以降（最初の画面にほぼ入らない。境目に近いので画像で確かめる。§8 Q11）。
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
- 正方形 300×300（列幅まで）。地はカードの写真と同じ光の輪＋`#14183a`、足元に台（CSS の楕円）。canvas は借りた描画器の `domElement`。実際のportraitImage、アトラス、主カード、目画像262,144Bを差し引いた残りから裏の大きさを決め、端末倍率か最大560×560の小さい方を使う。最大切抜き691,200Bを保持する場合は530×530以下となる。ただし `state==='pending'` の間は `setPixelRatio(1)`（300×300＝360,000B）にし、`pending` を抜けた onChange で上げて1回描き直す（§2.2）。
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
| `presentation.nearPerfect` | ほぼ完全一致！ | C が使う。§5.9 |

控えはCL05の明示接続とCG03の統合実装でだけ使い、本番公開へ持ち込まない。本人の追加指示により、両者の実装完了後にCG05前段でChatGPTが15辞書へまとめて翻訳し控えを外す。それまでは「15言語の文言」は未完了として票に残し、Claudeの実装開始を止めない。

## 4. CL-B（CL03）舌と舞台

F02/F03/F04/F05/F12、IF01/02/09/10。編集先：`src/scene/tongue-rig.js`・`travel-tongue.js`（新規）、`showcase-tongue.js`、`street.js`、`stage.js`、対応試験。`travel-tongue-motion.js`（処理側）・`app.js` は編集しない。

### 4.1 `presentationSet` の分岐（IF01）

```js
const mode = opts.presentationSet === 'extended96' && opts.gameExtrasController ? 'extended96' : 'legacy80';
```
controller が渡されただけでは新経路にしない（App は常に controller を渡し、`'legacy80'` を指定している。`app.js:998`）。

| 舞台 | 条件 | 旧 director（accents の抽選） | `step` | 描く物 |
| --- | --- | --- | --- | --- |
| WebGL | legacy80（既定） | 今のまま動かす | 呼ばない | 今のまま（舌・新5案・警察2案は出ない） |
| WebGL | extended96、効果あり | 止める（accents を `mode:'extended96'` で作る） | 毎フレーム1回 | 舌・ダイヤ（B）、小芝居と警察2案（C の部品） |
| WebGL | extended96、`presentationEnabled:false` | accents が無い | 毎フレーム1回、`drawable:false`・配置すべて false | 何も足さない。札はAppがnullにして抑止（Q04確定） |
| DOM（簡易） | extended96 | 無い | 毎フレーム1回、`drawable:false`・配置すべて false | 何も足さない |
| 練習・ホーム・検証の舞台 | controller 無し | — | 呼ばない | 今のまま |

禁止：旧 director との二重抽選、`cameo:null` の時に旧描画へ戻すこと、舞台の `presentationEvent` を controller へ転送すること（App が既に `gameExtrasController.event` を呼んでいる。`app.js:1043,1170`）。

### 4.2 `step` へ渡す値（IF02/IF09）

```js
const p = args.presentation;              // App が作る（readPlayView＋ガイド・警告・hidden・評価区間）
const extra = controller.step({
  ...p,                                   // t, playId, passed, building, phase, matchState, policeStage, running,
                                          // lastEvalSuccess, guidanceActive, guideActive, moving, warningActive,
                                          // hidden, evaluationSegments をそのまま
  drawable,                               // 下の表
  actorBusy: {hero, police},              // C の reactions.busy()（reactions.tick の後に読む）
  placements: {railway, water, robot, bird, midpoint, existing, policeSettled},
  reducedMotion,                          // 毎回 boolean
  frameIntervalMs,
  bestDistance,
});
```

| 値 | 作り方 |
| --- | --- |
| `t` | `p.t`（ゲーム時計）。`args.t`（ガイドの見せる位置 sceneT）を使わない。上書きしない |
| `drawable` | `!contextLost && !opening && !ending && presentationEnabled`。`contextLost` は `renderer.domElement` の `webglcontextlost`/`webglcontextrestored` を購読して持つ（dispose で外す） |
| `actorBusy` | `{hero: busy.hero===true, police: busy.police===true}`。`busy=reactions?.busy()`（C が足す安い読み出し。今の `stats()` は配列を作るので毎フレームは避ける）。reactions が無ければ両方 false |
| `placements` | `{...accents.placements(view, frameInfo), policeSettled}`。accents が無ければ5案すべて false・`existing:{}`。`policeSettled` は `policeStage===1` かつ `updatePolice` の中の「立ち位置に着いた」（`street.js:1050` の `arrived` を外へ出して持つ） |
| `reducedMotion` | `mq?.matches===true`（`mq=matchMedia('(prefers-reduced-motion: reduce)')` を作成時に1回作って保持し、毎フレーム読む） |
| `frameIntervalMs` | `p.running===true && !p.hidden && prevT!==null && Number.isSafeInteger(p.t) && p.t>=prevT` なら `p.t-prevT`、それ以外は 0。その後 `prevT = (p.running===true && !p.hidden && Number.isSafeInteger(p.t)) ? p.t : null`（初回・停止・非表示・不正値は 0） |
| `bestDistance` | `setBestDistance(v)` で受けた値を `Number.isInteger(v)&&v>=0&&v<=50 ? v : null` で持つ（accents へも今までどおり渡す） |
| 作らない物 | `priority`（D10）、`leaving`、第二の抽選の文脈。抑止の判定は controller だけが持つ |

- 1フレーム1回：App の `stage.update(args)` 1回につき `step` 1回。**終了演出・開始演出の分かれ道でも1回**呼ぶ（`drawable:false`。評価区間を落とさないため）。終了演出の内部フレーム（`api.update(lastArgs, frame)`、`street.js:1381`）では呼ばない（同じ評価区間を二度渡さないため）。
- `args.presentation` が無い呼び出し（練習の `renderPractice` など）では呼ばない。

### 4.3 フレームの中の順番（extended96）

```
update(args, cutsceneFrame)
 ├ disposed → return
 ├ opening、または ending かつ cutsceneFrame なし → step を1回（drawable:false）→ 今までどおり return
 ├（今までどおり）時計・棟・時間帯・カメラ・主人公の位置と色
 ├ ending（演出フレーム）→ travelTongue.cancel() → 今までどおり applyEnding（step しない）
 └ 通常
    1 travelTongue.prepareBase()              … 前フレームに舌が足した姿勢だけを戻す
    2 view.running なら hero.animate(...)      … 既存（reactions の包みが先に戻す）
    3 updatePolice(...)                        … 既存。arrived[0] を持つ
    4 presentationScope.tick / reactions.tick(view)   … 既存
    5 extra = controller.step(...)             … §4.2
    6 accents.tick(view, {cameo:extra.cameo, policeExtra:extra.policeExtra, actors})   … C（§5）
    7 {dx} = reactions.applyPoliceExtra(extra.policeExtra, view)                      … C（§5.8）
      ferretRoots[0].position.x += dx; ferretShadows[0].position.x += dx; fx.placeIcon(0, …+dx)   … B
    8 travelTongue.apply(extra.travelTongue)  … 加算。null なら取消と同じ
    9 成功リング（既存）→ drawFrame
legacy80 は 5〜8 を行わず、6 を今までどおり accents.tick(view) にする。
```

### 4.4 舌の形の共通部品（旧作業コピーの再利用）

旧作業コピー（`.claude/worktrees/agent-a2f81ca502cced406`、commit `1dee360`）を読んだ結果：

| 旧ファイル | 使う所 | 直す所 |
| --- | --- | --- |
| `src/scene/tongue-rig.js`（264行） | そのまま使う：`createTongueRig(hero,{name})` → `{mesh, apply({visible,extension,unroll,storage}), writePoint(u,pos,tan,normal), writeTip, getLocalEnvelope, reset, stats(){shapeWrites}, dispose}`、`createPoseLedger()` → `{add,set,restore,clear,appliedCount}`。管の計算は今の `showcase-tongue.js:40-88` と同じ式 | なし（同じ extension・unroll なら形を書き直さない点もそのまま） |
| `src/scene/showcase-tongue.js`（61行の薄い包み） | そのまま使う。公開名 `createShowcaseTongue(hero)` と `apply(frame)`、顎・口の絶対値の書込み、settle の150ms収納を保つ | なし。**ホームの舌は変えない**（下の試験で同じ頂点を確かめる） |
| `src/scene/travel-tongue.js`（236行） | ダイヤの形（八面体 半径0.2 を 横0.85×1.2・縦1.15×1.2・奥0.85×1.2）、面の色塗り、`placeDiamond`、台帳で書く5種、`stats()`、`dispose()` | 入力を旧 motion の枠から **controller の `travelTongue`** へ替える。姿勢の曲線は §4.5 の純粋な関数 `travelTonguePose(frame,out)` に移す（時計は持たない）。`TRAVEL_LIFT_RADIANS`（6°）は旧 motion から import せず自分で持つ |
| `src/scene/travel-tongue-motion.js`（旧、277行） | 使わない（時計は処理側の同名ファイル） | 姿勢の曲線（`writeCycle` の中身）だけを §4.5 へ移す |
| `tests/scene/travel-tongue*.test.mjs` | 形・姿勢・破棄・二重 dispose・包絡の試験の考え方 | 時計の試験は捨てる（処理側の試験がある）。入力を controller の枠に替える |

### 4.5 5段階の姿勢（controller の `phase`・`phaseProgress` だけから決める）

`ms = phaseProgress × 段階の長さ`、`u = phaseProgress`。`e`・`easeOutCubic` などは旧作業コピーと同じ式。

| phase（ms） | 口 | 視線 | 頭の傾き(rad) | 伸び | ほどけ | 収納 | ダイヤ | 持ち上げ | 光 | 回転 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| prepare（150） | e=easeOutCubic(u) | e | 0.04e | 0.05e | 0 | 0.6+0.4e | 0 | 0 | 0 | 0 |
| extend（250） | 1 | 1 | 0.04 | 0.05+0.95·easeOutQuart(u) | smoothstep(0.3,1,u) | 1 | grow(ほどけ) | 0 | 0 | 0 |
| hold（350） | 1 | 1 | 0.04 | 1 | 1 | 1 | 1 | easeOutCubic(min(1,ms/100)) | ms<200 なら sin(π·ms/200) | (π/4)·u |
| retract（450） | 1 | 1−0.5e（e=easeInOutCubic(u)） | 0.04−0.02e | 1−0.95e | 1−smoothstep(0.2,0.8,u) | 1 | smoothstep(0.6,0.95,ほどけ) | 1−e | 0 | π/4 |
| store（200） | 1−e（e=easeInOutCubic(u)） | 0.5(1−e) | 0.02(1−e) | 0.05 | 0 | 1−0.999·easeInCubic(u) | 0 | 0 | 0 | 0 |

- `grow(x)`（x はほどけ）：`w=clamp((x−0.6)/0.4)`、0なら0、`w<0.75` なら `1.08·easeOutCubic(w/0.75)`、それ以外 `1.08−0.08·smoothstep(0,1,(w−0.75)/0.25)`。
- `frame.jewelVisible===false` の時はダイヤを0にする（controller の枠と食い違わせない）。
- 台帳が書くのは5種だけ：`jaw.position.y −= 0.05·口`、`mouth.position.y −= 0.025·口`、`head.rotation.z += 傾き`、`eyes[0].rotation.y += 0.18·視線`、`eyes[1].rotation.y −= 0.18·視線`、そして舌の表示中は `jewel.visible=false`（尻尾の宝石との二重表示なし）。戻す時は「今の値が自分の書いた値のままの時だけ」前の値へ（引き算しない）。
- 持ち上げは `mesh.rotation.z = 持ち上げ×6°`。収納は `mesh.scale`（ダイヤは子なので一緒に縮む）。
- ダイヤ：舌の長さの 85% の点と接線（`writePoint(0.85)`）。中心＝点＋法線×(0.05＋(0.276−0.008)×大きさ)。縦軸を法線へ、`rotation.order='ZYX'`・`rotation=(0, 12°+回転, atan2(接線))`。色 上4面 `#c9fbff`、下4面 `#5fd8ee`、右上1面 `#ffffff`（光る時 `#fffbe0`・上面 `#effeff`）。`MeshBasicMaterial({vertexColors:true})` 不透明、輪郭なし、**1形状・1描画**。舌が所有し、dispose で1回だけ破棄。画面上の高さの見込み：402×874 約18px、402×700 約15px、874×402 約14px（12px 以上）。
- 舌の包絡（頭の座標、持ち上げ込み）：x −0.23〜1.06、y −0.17〜0.71、z ±0.25（旧作業コピーの測定値）。
- 停止中：controller の `elapsedMs` が止まるので同じ姿勢。形は書き直さない（`shapeWrites` が増えない）。
- 取消（`extra.travelTongue===null`、ガイド・警告・危険・主人公反応・終了・描画喪失・動きを減らす）：同じフレームで台帳を戻し、舌とダイヤを隠す（途中のアニメーションなし）。
- 最初の表示の引っかかりを避けるため、舌の mesh とダイヤを `street.js:1181-1206` の事前準備の `show(...)` に足す。`street.dispose()` では `scene.traverse` より前に `travelTongue.dispose()`。
- `presentationStats()` に `mode` と `tongue: travelTongue.stats()`（`visible, diamondVisible, shapeWrites, poseWrites, drawCalls, geometries`）を足す。

### 4.6 動きを減らす設定の途中変更

- `mq.addEventListener('change', onReduced)`（無い環境は `addListener`）。`onReduced` は `mq.matches` が true なら `travelTongue.cancel()` して `drawFrame()`（停止中でもすぐ収納が見える）。controller へは次のフレームの `reducedMotion:true` で伝わり、舌の機会は消費される。
- 解除は `presentationScope.own(() => mq.removeEventListener('change', onReduced))`。dispose の二度目は何もしない。
- 既存の `reducedMotion`（作成時に1回読む値。`street.js:792`、粒・accents・reactions が使う）は変えない。

### 4.7 DOM 簡易舞台（`createDomStage`）

- `createStage` は今も `createDomStage(container, opts)` に全部の opts を渡している（`stage.js:98`）。`createDomStage` が `presentationSet` と `gameExtrasController` を読み、§4.1 と同じ式で mode を決める。
- `update({t,color,policeStage,presentation})` の最後で、extended96 かつ `presentation` があれば `step` を1回：`drawable:false`、`actorBusy:{hero:false,police:false}`、`placements:{railway:false,water:false,robot:false,bird:false,midpoint:false,policeSettled:false,existing:{}}`、`reducedMotion`・`frameIntervalMs`・`bestDistance` は §4.2 と同じ作り方。戻り値は描かない（評価区間と札は controller の中で進み、App が snapshot を bonus へ渡す）。
- `setBestDistance(v)` は値を持つように直す（今は何もしない）。`matchMedia` の購読は dispose で外す。

### 4.8 C の部品を組み込む口（B が呼ぶ。C が作る）

```js
// street-accents.js（C）
createStreetAccents({scene, camera, slots, atlas, scope, seed, reducedMotion, mode='legacy80'})
accents.placements(view, frameInfo) -> {railway, water, robot, bird, midpoint, existing:{12:boolean}}
   // frameInfo = {viewport:{width,height}（CSS px）, hudBottom（CSS px）, heroX, policeX:[x0,x1], policeVisible:[b0,b1]}
   // legacy80 は全部 false。grace に入るフレームと 125000≦t<126500 以外は false でよい（controller はその時だけ読む）
accents.tick(view, extra)   // extended96：extra = {cameo, policeExtra, actors:frameInfo}。legacy80 は extra を無視
accents.stats()             // 既存＋{mode, storySprites, staticFlag, footprints}
// actor-reactions.js（C）
reactions.busy() -> {hero:boolean, police:boolean}         // stats().hero/police !== null と同じ意味
reactions.applyPoliceExtra(policeExtra, view) -> {dx:number}  // 姿勢は save() で書く（次の tick で自動で戻る）
   // view.running が false の時は姿勢に触らず、同じ dx だけ返す。policeExtra が null なら {dx:0}
```
- `hudBottom` は B が resize の時に `container.closest('.stage-wrap')?.querySelector('.hud')` の下端を測って持つ（読むだけ。見つからなければ 76）。
- B が C の部品を取り込むのは C の CL04 の部品試験が通った commit の後（§6）。それまで B は `accents.placements` が無ければ全部 false、`busy` が無ければ `stats()` から作る、`applyPoliceExtra` が無ければ `{dx:0}` として進める（存在確認で分ける。偽の絵は描かない）。

## 5. CL-C（CL04）街・警察・札

F04〜F06/F12、IF02/05/08/09/10。編集先：`street-accents.js`、`actor-reactions.js`、`characters.js`（必要な時だけ）、`bonus-view.js`、`scripts/render-street-atlas.mjs` と街アトラス、対応試験。`hud-view.js` は今回変える必要が無い（見つかれば理由を票に書く）。描画は controller の出力だけで決め、回数・間隔・期限・抽選・98%判定を描画側で持たない。

### 5.1 置き場所の決まり（全案共通）

- 新しい絵は既存の `sprite(...)` の束で描き、新しい描画呼出・形・画像を増やさない。
  - 世界に固定する絵は深度を使う `sprites` の束へ、新しい種類 `'story'` として入れる（`staticN` に数えず、`visibleCameos` に数える。小芝居1組3枚の上限を旧案と共有）。
  - 画面に固定する `cameoSprites`（深度なし）は旧9案だけが使う。新5案は使わない（深度なしだと主人公の上に描かれるため）。
  - `sprites` の束は40枚まで（`street-accents.js:44` の `np>=40`）。静的24＋粒子8＋'story'3＝35 で収まる。
- 置ける所（§2.3）：道の帯（壁の下端の線より 4px 下〜canvas 下端の 4px 上）、路地の隙間（両側の壁の正面の投影から 2px 以上内側）、屋根より上（その位置の建物の正面の上端の投影より 4px 上、HUD の下端＋6px より下）。
- 置く前の確かめ（`accents.placements`）：その案のすべての絵の、開始時と終了時（主人公が +4 進んだ時）の投影の箱が、上の帯に入り、主人公・警察の箱（世界の箱 x−1.6〜+1.2、y 0.2〜3.2、z 2.0〜3.0 を投影）から 6px 以上離れ、canvas の左右 8px の内側にあること。だめなら false（controller は選ばず、回数を使わない）。
- 描く時も毎フレーム同じ確かめをし、帯から外れた絵は**描かない**（穴の開いた絵を出さない）。controller の取得は取り消さない（描画側から抽選に触らない）。
- 静的装飾の24：足跡（最大3）・静止旗（1）を出す間は、家具の枠（`furnishingSlots`、`street-accents.js:54` の最大5）を同じ数だけ減らす。
- 時間：`p = cameo.elapsedMs / cameo.durationMs`（controller の時計）。`t - start` を自分で数えない。
- 動きを減らす設定（作成時の `reducedMotion`）：各案の「静止コマ」を時間いっぱい出すだけ。
- 位置の基準：`bx = (cameo.building − 1) × 10`（その棟の左端。小芝居の機会は grace の始まりで、主人公はほぼ bx にいる）。2000ms で主人公は +4 進む。
- 1単位の画面上の大きさは z で変わる（§2.4。z=5 付近で 402×700 約31px、402×874 約38px、874×402 約30px）。

### 5.2 街アトラスの拡張

1. 最初に、スクリプトを変えずに動かし（`python`・PIL・librsvg・cairo はこの環境にある。確認済み）、今の `atlas.webp` と 61枠を比べる（各枠の平均絶対差・最大差）。同じでなければ、作り直しの差（WebP 品質88の再圧縮）として数値を票に記録し、次の 2 では「今の画像を読み、上の 1024×1024 をそのまま使い、新しい行だけ SVG から描いて合成する」方法にする。
2. 既存の `add()` の後ろへ下の19セルを足す（既存の 0〜60 番は動かさない）。
3. 1024×1536（8列×12行）。`atlas.json` は `rows:12`・`height:1536`。
4. 格子の数を直に書いた所を一度に直す：`street-accents.js:25` のシェーダー `/ 8.0` → `/ vec2(8.0, 12.0)`、`:26` のキャッシュ名 → `'street-atlas-v2'`、`:44`（2か所）・`:86`・`:91` の `7-Math.floor(cell/8)` → `11-Math.floor(cell/8)`。`CELLS`（`:4`）へ新しい名前を同じ順で足す。
5. 拡張後も上の 1024×1024（61枠）と今の画像の差を数値で残す（合成なら差0のはず）。展開後 6,291,456B、圧縮後の大きさを記録する。

| 番号 | 名前 | 絵（128px セル。線 `#24394b`・太さ3・角丸。文字・数字は描かない） |
| --- | --- | --- |
| 61 | crossingPost | 支柱 `#e9e3d6`（黒黄の帯4本 `#293d4d`/`#eecb69`）、上に×の標識 `#f5e5cf`、左右の灯（枠 `#3a3f4d` r11、消灯レンズ `#7a4a4a` r7） |
| 62 | crossingPostLit | 61 の左のレンズ `#ff6b5e`＋不透明の輪 `#ffb39e` r13。右の点灯は x を反転して使う（支柱は左右対称） |
| 63 | crossingArm | セル中心から右端までの棒 `#f5e5cf`、赤帯 `#d26f75` 3つ、中心に軸 `#9caeb9` r8（中心で回すと根元で回る） |
| 64 | tram | 1両の路面電車 `#9fd1cb`、屋根 `#e7ecef`、窓4つ `#83a9b9`、車輪 `#293d4d`、前面に `eye()`。上下は透明 |
| 65 | droneA | 丸い機体 `#f0eee1`＋帯 `#e78b70`、`eye()`、腕4本の先に回転翼（横長の楕円 `#c7d1dd`）、下にフック |
| 66 | droneB | 65 の回転翼を細い線に |
| 67 | midFlag | 細い支柱 `#9caeb9`、2色の旗（`#83bd87`/`#f5e5cf` の斜め分け）に `eye()` の丸い紋、足元に小さな台 |
| 68 | gutterWaterA | 上に雨どいの口（`#9caeb9` 太さ14の曲がり）、下へ波打つ水 `#9fd1cb`、白い筋 `#dfedf1` 2本 |
| 69 | gutterWaterB | 68 の波の位相を半分ずらす |
| 70 | gutterSwirl | 排水の格子 `#556c8e`、その上の渦（`#dfedf1` 太さ6）、水しぶきの小円3つ `#9fd1cb` |
| 71 | robotPaint | 四角いロボット（胴 `#f0eee1`、顔 `#283c5a`・目 `#9fd1cb`）、車輪の足2本、右腕のローラー `#eecb69` |
| 72 | robotFoot | 腕を曲げて自分の左足を塗る。左足が `#eecb69` |
| 73 | robotLook | 頭を20°下へ、目を下向きの弧、左足は黄色 |
| 74 | paintStripe | 黄色い帯 `#eecb69`、右端は少しかすれる、線は太さ2 |
| 75 | birdCarryA | 丸い鳥 `#f8e7c9`・くちばし `#e49263`・`eye()`、翼が上、足でひもの輪 |
| 76 | birdCarryB | 翼が下、頭の横に汗 `#9fe6ff` |
| 77 | parcel | 箱 `#c3a18c`、十字のひも `#f5e5cf`、無地の札 `#eecb69` |
| 78 | rope | セル中央の縦線 `#8b6e5a` 太さ6（縦に伸ばして使う） |
| 79 | footprint | 線なし。指先が2つに分かれたミトン形 `#6e6a66`（左右は x 反転） |

### 5.3 E020 踏切（2000ms、3枚：電車・棒・支柱。すべて世界に固定・道の帯）

| 時間 | 支柱（x=bx+5.5、z=5.4、足元 y=0.245、幅0.55・高さ1.1） | 棒（軸 y=1.2・z=5.35、長さ2.2、+x 向き） | 電車（z=7.6、下端 y=0.05、幅3.2・高さ0.95） |
| --- | --- | --- | --- |
| 0〜400 | 左右の灯を 250ms ごとに交互 | 上向き +80°→0°（easeInOutSine） | 出ない |
| 400〜1500 | 交互を続ける | 0°（下りたまま） | 450〜1450 で x=bx+20 → bx−8（等速） |
| 1500〜1900 | 1750 で消灯 | 0°→+80° | 出ない |
| 1900〜2000 | 消灯 | 上向き | 出ない |

- 支柱の高さ 1.1 は、z=5.4 で上端が壁の下端の線より下になる値（1.3 を越えると壁の前に出て穴が開く。§2.3）。電車（高さ0.95・z=7.6）は主人公の足の線より下に投影される見込み（計算）。
- 静止コマ：棒が下り、左の灯、電車は x=bx+5。取消（cameo が null）は3枚とも同じフレームで消す。
- 置ける条件：§5.1。支柱の画面 x の見込み 402×700 約329、402×874 約367、874×402 約338（canvas 内）。

### 5.4 E067 雨どい（2000ms、2枚：水・渦。路地の隙間、粒子0、同時の水源1）

- 水（世界、路地）：x=bx+10（今の棟の右の隙間の中心）、z=0.15、上端 y=2.2・下端 y=0.3、幅0.45。
- 渦（世界、地面に平置き）：同じ x、y=0.25、z=0.9、0.9×0.9。
- 0〜200：水が上から伸びる（縦 0→1、上端固定）、渦 0.6→1。200〜1700：水 A/B を 120ms ごと、渦は 700ms で1回転（右回り）。1700〜2000：水が細る（横 1→0.2）、渦 1→0.6。静止コマ：水 A、渦 0°。
- 置ける条件：隙間の右の棟（b+1）の枠が見えていて、主人公が +2 進んだ時の水の箱が隙間の内側・canvas の内側。見込み（計算）：402×700 と 874×402 は可、402×874 は隙間が画面の右外になり不可（その寸法では出ない。§8 Q07）。

### 5.5 E068 縁石塗装ロボット（2000ms、2枚：ロボット・塗装。道の帯）

- ロボット（世界）：x=bx+5.5、z=5.0、足元 y=0、高さ0.85・幅0.8。塗装（世界、縁石の上に平置き）：y=0.25、z=4.35、左端固定で長さ 0→0.7、幅0.14。
- 0〜800 robotPaint：ロボットが +0.7 進み、塗装が伸びる。150ms ごとに上下 0.02。800〜1300 robotFoot。1300〜2000 robotLook（1600 で首を +0.08rad）。終わりに2枚とも消す（塗装を残さない）。静止コマ：robotFoot、塗装0.7。
- 終了時の主人公（bx+4）との差は約2.2単位（重ならない見込み）。

### 5.6 E069 重い荷物の配達鳥（2000ms、3枚：鳥・荷物・ひも。屋根より上）

- 場所（世界）：今の棟の屋根の右寄り x=bx+6.5、z=−1.2。着地の高さ `roof` はその枠の屋根の上端（平屋根 `h+0.6`、三角屋根は頂）。
- 共通の上下 `lift(ms)`：0〜300 は0、300〜1000 で sin により 0→1、1000〜1300 は1、1300〜1700 で 1→0、以後0。
- 鳥 y=`roof+0.35+0.6·lift(ms)`、荷物 y=`roof+0.2+0.2·lift(ms−120)`、ひもは両者の間に縦に伸ばす。翼：140ms ごとに A/B、1000〜1300 は 80ms ごとで B（汗）。1700〜2000 は屋根の上で A のまま止まる。静止コマ：lift=1、翼 B。
- 置ける条件：飛ぶ範囲の箱（鳥の上端〜荷物の下端）が、重なるすべての建物の正面の上端より 4px 上、HUD の下端＋6px より下で、高さ 56px 以上。屋根が高い棟では出ない（条件付き表示）。

### 5.7 E056 中間旗（機体と旗。1500ms と静止旗）

- 旗の位置（世界・道の帯）：x=`fx`=250（`bestDistance===25` の時だけ 249.0。自己ベスト旗は既存の `sprite('flag', best*10, .9, -.6, …)`（`street-accents.js:110`）で路地の奥。深さが違い、画面で約6px 以上離れる見込み。25棟の時はさらに1単位離す）、z=5.0、足元 y=0.245、高さ0.8・幅0.6。高さは壁の下端の線より下に収まる上限。
- `phase:'delivery'`（1500ms）：0〜800 機体（z=5.6、y=0.95、幅0.5・高さ0.3）が x=fx+6 から fx へ（easeOutCubic）、回転翼 A/B を 60ms ごと、小さく巻いた旗（大きさ0.5）をフックの下に。800〜1050 旗を下ろして立てる（大きさ 0.5→1、着地で縦 0.9→1.0 を 80ms）。この時の主人公は fx＋1.6〜2.1。1050〜1500 機体は x=fx+8 へ戻って去る（主人公の前を横切らない）。
- `phase:'static'`（間に合わない・取消・期限切れ・機体の後）：旗だけを fx に立てる。controller は以後ずっと static を返すので、旗が画面の外にある間は描かない。画面にある間は静的装飾1つに数える。
- `placements.midpoint`：125000≦t<126500 の間、旗（立てる時刻の主人公を fx+1.6 と見込む）と機体の通り道が道の帯に入り、主人公の箱から 6px 離れること。§5.1 の「警察の箱から 6px」はこの案だけ外す：警察1人目（x−2.9、z=2.7）と画面で近い（402×700 で旗 x≈82、警察 x≈68）が、警察は比較面ではないので重なっても可とし、画像で判定する（§8 Q08）。外さないと警察がいる時は必ず静止旗になる。

### 5.8 警察2案（E034・E039）

共通：警察1人目（`ferrets[0]`）だけ。正式な追跡位置・警戒は変えない。表示用のずれ `dx` を `reactions.applyPoliceExtra` が返し、B が root・影・記号へ同じ値を足す（§4.3 の7）。体・頭・道具・光の姿勢は C が `save()` で書く（次の `tick` で自動で戻る）。光（beam）は胴の子なので一緒に動く。`dx` は −1.0 まで（402幅で警察が画面の外へ出すぎない）。既存の似顔絵・双眼鏡の交互の番は進めない（`alternate` に触らない）。

E034 見当違いの聞き込み（`kind:'inquiry'`、1200ms）：

| ms | 体・頭 | dx | 道具 |
| --- | --- | --- | --- |
| 0〜200 | 体を壁の側（−z）へ +0.8rad 回す。相手は近くの街灯の柱、無ければ壁 | 0 | — |
| 200〜600 | 立ち止まる（足の振り0） | 0→−0.8（直線。足が地面に止まって見える） | 似顔絵（既存の `sketch`）を 0.15 上げて相手へ。330ms と 470ms に小さくうなずく（頭 z ±0.08） |
| 600〜800 | 「あれ？」頭 z +0.15 | −0.8→−1.0 | 下ろす |
| 800〜1200 | 向きを戻し小走り（足の振り1.6倍） | −1.0→0（easeInOutQuad） | 1150 で隠す |

E039 足跡の調査（`kind:'footprints'`、1500ms）：

| ms | 体・頭 | dx | 足跡 |
| --- | --- | --- | --- |
| 0〜150 | 歩きのまま | 0 | 3つが手前から 50ms おきに出る（大きさ0.6→1） |
| 150〜550 | 前かがみ（上体0.35rad、頭を下へ）、光を足跡へ | 0→−0.8 | 表示 |
| 550〜1150 | 迷う：頭 yaw −0.6→+0.6→−0.3（200ms ずつ、最初は主人公と反対） | −0.8 | 表示 |
| 1150〜1500 | 体を起こし小走り | −0.8→0 | 1500 で消す |

- 足跡：開始時の警察の x＋0.8・1.3・1.8、z=3.1、y=0.25 に平置き、0.32×0.42、左右交互に ±8°。世界に固定（静的装飾に数える）。主人公の箱と 4px 以上離れない足跡は出さない。取消・終了・棟の切替・枠の使い回しで必ず消す。経路として保存しない。
- 上体の姿勢に部品が要る時だけ、C が `characters.js` の `createFerret` の `actorParts` へ既存の胴の参照を足す（見た目は変えない）。
- 取消（controller が null を返す：警察 1→0／1→2、ガイド、警告、既存の警察の反応、立ち位置から外れる、終了）：同じフレームで `dx=0`、道具を隠し、足跡を消す。補正が残らないことを `ferretRoots[0].position.x === playerX + ferretRel[0]` で確かめる。
- 停止中（`view.running===false`）は姿勢を書き足さず、同じ `dx` を返す（二重に足さない）。

### 5.9 精密札（`bonus-view.js` の `tick({precisionBadge,...})`）

App は毎フレーム `bonusPresentation.tick({activeMs:s.t, phase, guideActive, warningActive: stage>0||activeNotice, running, precisionBadge})` を呼び、その後で batch があれば `show(batch, s.t, {quiet})` を呼ぶ（`app.js:1188-1190`）。`show` は中で `tick({t:now,quiet})`（precisionBadge 無し）を呼ぶ。

- 受け取り方：引数に `precisionBadge` の項目がある時だけ `badge` を更新する（値か null）。項目が無い呼び出し（`show` の中）では前の値を保つ。→ **show(batch) で札を消さない**。
- 抑止：`quiet = guideActive || warningActive`（既存の既定どおり）。quiet の間は札を出さない。期限・98%・500ms を自分で判定しない（controller が 1400ms を過ぎると null を渡す）。
- 文言：`'◎ ' + t('presentation.nearPerfect')`。キーがまだ無い間（`t(key)===key`）は `'◎ 98%'`。点数（`+0` など）・効果音は出さない。
- 見せ方：
  - batch が見えている時（`age<1400 && phase!=='eval'`）：既存の通知の行 `.bonus-card-notices` の最後へ `span.bonus-card-badge` として足す（既存の通知と「 · 」で区切る）。
  - batch が無い・見えていない時（評価中を含む）：カードを `is-badge-only` で出し、通知の行だけを見せる（題・点・行・詳細は隠す）。出入りは札の `elapsedMs` で：`--bonus-enter=min(1,elapsedMs/150)`、`elapsedMs≥1250` から `--bonus-progress=(elapsedMs−1250)/150`。
  - 札が null か quiet：batch も無ければカードを隠す。
- `stats()` に `badge:boolean`（見えているか）を足す。
- CSS は A が `presentation.css` に書く（C は書かない）：
```css
.bonus-card.is-badge-only .bonus-card-title,.bonus-card.is-badge-only .bonus-card-points,
.bonus-card.is-badge-only .bonus-awards,.bonus-card.is-badge-only .bonus-card-detail{display:none}
.bonus-card.is-badge-only{right:auto;left:50%;translate:-50% 0;margin:0;padding:5px 12px;max-width:calc(100% - 20px)}
.bonus-card.is-badge-only .bonus-card-notices{margin:0}
.bonus-card-badge{color:#ffe694;white-space:nowrap}
```
  （中央寄せは `translate` プロパティで行い、既存の出入りの `transform`（`presentation.css:108`）と重ねない。）

## 6. 工程間の受け渡しと順序

### 6.1 互いに使う物

| 使う側 → 作る側 | 物 | 形 |
| --- | --- | --- |
| B → C | 街の部品 | `createStreetAccents({...,mode})`、`accents.placements(view,frameInfo)`、`accents.tick(view,extra)`、`accents.stats()`（§4.8） |
| B → C | 警察・主人公の反応 | `reactions.busy()`、`reactions.applyPoliceExtra(policeExtra,view)`（§4.8・§5.8） |
| C → A | 札の CSS | `.bonus-card.is-badge-only`・`.bonus-card-badge`（§5.9。A が CL02 の最初の commit で書く） |
| A → B | なし（カードのダイヤは A が 2D で同じ色を描く。コードは共有しない） | — |
| CL05 → A/B/C | 明示接続の wrapper（§6.4） | 製品コードは変えない |

### 6.2 ファイルの担当（同じファイルを同時に編集しない）

| 担当 | 製品 | 試験（新しいファイルを作り、既存の試験ファイルは原則触らない） |
| --- | --- | --- |
| A | `result-card-ports.js`・カード/撮影/模型/回転の新規、`result-evidence-view.js`、`result-view.js`、`presentation.css`、`render-result-atlas.mjs`、`result-atlas.webp/.json`・`result-atlas-bounds.js` | `tests/presentation/result-card-*.test.mjs`、`tests/e2e/result-card.e2e.mjs` |
| B | `tongue-rig.js`、`travel-tongue.js`、`showcase-tongue.js`、`street.js`、`stage.js` | `tests/scene/tongue-rig.test.mjs`・`travel-tongue.test.mjs`・`stage-mode.test.mjs`、`tests/e2e/travel-tongue.e2e.mjs` |
| C | `street-accents.js`、`actor-reactions.js`、`characters.js`、`bonus-view.js`、`render-street-atlas.mjs`、`atlas.webp/.json` | `tests/presentation/street-extras.test.mjs`・`police-extras-view.test.mjs`・`bonus-badge.test.mjs`、`tests/e2e/street-extras.e2e.mjs` |
| 誰も編集しない | `app.js`、`index.html`、`game.css`、`travel-tongue-motion.js` ほか処理側・15辞書・catalog | — |

既存の試験ファイル（例 `tests/scene/showcase-tongue.test.mjs`、`tests/presentation/catalog.test.mjs`、`tests/e2e/presentation.e2e.mjs`）は**変えずに通す**。期待値の変更が要る時は理由を票に書き、CL-O が担当を一人に決めてから行う。

### 6.3 順序

```
共通base（CG02補足を含むPR #26最新head。7d551edと90473eeを保持し、CL-Oが開始SHAを記録）
 ├ A（CL02）: ①札の CSS と結果アトラス詰め直し → ②カード描画・撮影 → ③ports と mount → ④E075/E090・保存画面 → ⑤5パネルの直し
 ├ B（CL03）: ①tongue-rig と showcase の薄い包み（ホーム不変） → ②travel-tongue（姿勢・ダイヤ） → ③stage/street の mode 分岐・step・DOM 簡易舞台
 │           （C の関数は存在確認で分け、無ければ false・0 で進める）
 └ C（CL04）: ①街アトラスの拡張（61枠の比較） → ②accents の mode と5案・placements → ③reactions の busy/applyPoliceExtra と警察2案 → ④bonus-view の札
B ④: C の②③の commit 後（CL-O が知らせる）に、extended96 の舞台へ C の部品を取り込み、3寸法の e2e と資源の測定
CL05: A/B/C の後。実 App の明示接続（§6.4）
```
- A の①（CSS）が C の④の e2e より先。C の単体試験は CSS に頼らない（クラス名と `hidden` を見る）。
- B と C は `street.js`・`street-accents.js` を分けて持つので同時に進められる。B は accents の中を書き換えない。C は street の中を書き換えない（必要な値は `frameInfo` と戻り値で渡す）。

### 6.4 CL05 の明示接続（通常起動は変えない）

```js
// 試験専用（例 tests/e2e/fixtures/extended96.html から読む module）。index.html・app.js は変えない
import { App } from '/src/app.js';
import { createStage } from '/src/scene/stage.js';
import { createResultCardPorts } from '/src/presentation/result-card-ports.js';
const app = new App(document.getElementById('test-root'), {   // id を 'app' にしない（自動起動を避ける。app.js:2170）
  stageFactory: (container, options) => createStage(container, {...options, presentationSet:'extended96'}),
  resultCardPorts: ({result, host, scope}) => createResultCardPorts({result, host, scope}),
});
globalThis.__kamereoru = app; await app.boot();
```
- `importmap`（`three`）と `game.css` は `index.html` と同じに書く。CG02 の試験用の代用品（`tests/ui/*-app.test.mjs` の renderer/stage）は使わない。
- 通常起動を変えていないことの確かめ：`git diff "$CG_BASE" -- src/app.js index.html src/presentation/catalog.js src/i18n`（CG_BASEはCG02補足を含むCL開始時の固定SHA） が空、既存の `tests/ui/game-extras-app.test.mjs`（legacy80 で step 0回）と `tests/e2e/presentation.e2e.mjs`（80/20）が変えずに通る、通常の `index.html` で `__kamereoru.stage.presentationStats().mode==='legacy80'`。

## 7. 試験と測定の一覧

先に失敗させる試験（RED）を書いてから製品を直す。工程の途中は対象試験だけを実行する（`node --test <ファイル>`、ブラウザは `--test-concurrency=1`）。画像は scratchpad ではなく各工程の証拠の置き場（`docs/acceptance/` 以下、CL-O が決める）へ。

### 7.1 CL02（A）

| 種類 | 内容 |
| --- | --- |
| RED→GREEN 単体 | ports：factory の中で acquire しない／初回 onChange が mount より先に来ても mount で `snapshot()` を描く／パネルは初回 `panels` に2つ／定義してはいけない6項目が無い（D01）。カード：405通りではみ出し0・3段目0件、`locale` 引数だけで文言が決まる、pending/missing/failed/確認中/旧版の文、順位・名前を描かない。撮影：中断で例外、`w×h×4≦691200`、描画器を自分で作らない |
| e2e（実 App＋ports、§6.4） | 最初の600ms に E090 を開けて借りられる／撮影で取り上げられ、ready 後に今の model で借り直す（描画器は同時1）／公式訂正と言語変更で開いた E075・E090 が今の値／`share()` はタップの中で直接（代用の navigator で同期に1回）／取消・失敗・unavailable の案内と明示操作／保存画面の `img` と閉じた時の URL 解除／再試行で自動共有しない |
| 画像 | 3寸法の結果画面（最初の表示・スクロール後）、主カード（ja・de・ru・th・vi × 0/1/20/50棟、6状態）、E075（通過・到達・未到達・色欠損・50棟）、E090（正面・回した後）、グラフの印・38px フィルム。倍率2 |
| 測定 | 結果画面の同時保持バイト（atlas＋画面 canvas＋主人公＋パネル canvas＋保存 img）を「準備中」「ready」「E090 開」「保存画面開」で記録し 16,777,216 以下。結果アトラス10区画の前後差。PNG の大きさ |

### 7.2 CL03（B）

| 種類 | 内容 |
| --- | --- |
| RED→GREEN 単体 | mode：controller があっても `legacy80` なら step 0回、extended96 で1フレーム1回、終了演出フレームで0回、早期 return でも1回。step の入力：`t===presentation.t`、`frameIntervalMs`（初回/停止/非表示/不正=0）、`bestDistance`（不正=null）、`reducedMotion` が boolean。DOM 簡易舞台も1回・`drawable:false`。舌：本物の `createChameleon` と `createActorReactions` で成功中の顎・視線・停止を混ぜた1000周期の後に顎・口・頭・目・`jewel.visible` が舌なしと一致、二重 dispose、ダイヤの形と材質の破棄1回、`head.children` が元へ、ホームの管の頂点が今と同じ（同じ extension・unroll の格子で `Float32Array` 一致） |
| e2e（extended96） | 3寸法・倍率1と2で5段階の各時点の画像、保持の中央でダイヤ 12px 以上、§2.3 の5条件（警察1人・頭 −0.92rad を含む）、途中で「動きを減らす」へ変更して1フレームで収納、停止中の `shapeUpdates` 増加0、`matchMedia` の購読が dispose で外れる |
| 測定 | 舌の表示中＋小芝居＋警察の道具で `stage.stats()` の calls/geometries/textures の増分が 12/16/4 以下（既存 `presentation.e2e.mjs:151-216` と同じ方法） |

### 7.3 CL04（C）

| 種類 | 内容 |
| --- | --- |
| RED→GREEN 単体 | accents extended96：旧 director を呼ばない、cameo が null なら何も描かない、取得前に描かない、5案の各時点の絵の名前・枚数（3以下）、静止コマ、静止旗（`phase:'static'`）、自己ベスト25棟で x=249.0。placements：帯に入らない寸法で false。reactions：`busy()` が `stats()` と一致、applyPoliceExtra の取消で dx=0、停止中に二重に足さない、交互の番が変わらない。bonus-view：batch 無しの eval で札を通知の行に点数なしで表示、guide/warning で隠す、`show(batch)` の後も札が残る、`precisionBadge:null` で消える |
| e2e（実 controller を明示接続） | t=2000〜3400 の札（batch 無し eval）、初通過前、E020/E067/E068/E069/E056 の開始・中間・終わりを3寸法、壁の所で絵が欠けない（§2.3 の不一致0）、期限切れの静止旗、警察 1→0／1→2 の取消で補正0、足跡が棟の切替で残らない |
| 測定 | 既存61枠の画素差（作り直し前と拡張後）、街アトラスの展開後・圧縮後バイト、静的装飾・粒子・小芝居の枚数の最大 |

### 7.4 CL05

実 App の明示接続（§6.4）で A/B/C を通しで：1プレイの中で舌・小芝居・警察・札、終了→結果カード→共有→保存→もう一度。既存15言語×3寸法の結果画面の配置画像（新文言の翻訳は両者実装後のChatGPT担当として未完了を記録）。通常起動の不変（§6.4 の確かめ）。CL-R の提出前レビュー。

### 7.5 iPhone 実機でしか確かめられない項目（自動ブラウザで合格にしない）

X の投稿画面への PNG 1枚の添付（Web Share の files）、`img` の長押しで写真に保存、canvas の長押しで保存できないこと、`Intl.Segmenter` の改行、段階1の細い輪郭とダイヤの見え方（倍率3）、E090 の横なぞりと縦スクロールの両立（`touch-action:pan-y`）、結果画面の同時保持メモリ（Safari の canvas 上限）、30秒の描画時間（95百分位 33.4ms 以下・中央値悪化10%以内）、効果音が増えていないこと。

## 8. 決めきれなかった所・判断が要る所

| 番号 | 内容 | この票の仮の決め | 判断する人 |
| --- | --- | --- | --- |
| Q01 | 画面カードの主人公画像（N01） | 確定・実装済み。snapshot.portraitImageを借用し、内部result.resultPortraitを直接読まない | ChatGPT対応済み、CL-Aが消費 |
| Q02 | 新しい文言キー（§3.12） | 時期確定。控えで実装を進め、両者の実装完了後にChatGPTが15言語をまとめて対応 | 後続ChatGPT。Claudeの開始待ちにしない |
| Q03 | 警察1人以上の時の札（D09） | 確定。既存警告優先を維持し、Appが通知値をnullにする。抑止分の再取得や期限延長なし | ChatGPT対応済み |
| Q04 | 演出オフと簡易DOMの札（D15） | 確定。drawable:falseでもstepを1回。演出オフはAppが札をnullにする。簡易DOMだけなら札を維持 | App対応済み、CL-B/Cが描画 |
| Q05 | getLayoutKeyと画面回転 | 確定・実装済み。getLayoutKeyは構図版の定数でよいが、Appが画面幅/高さを合成する。回転/寸法変更で旧Fileを即無効化し、主人公は再利用してPNGを再準備 | ChatGPT対応済み |
| Q06 | mountによる既存操作の配置 | 確定。既存.result-actionsと中のボタンを同じノードのまま移動することを認める。ボタンの複製/置換や既存click処理の二重登録をしない。追加の保存/本文/再作成ボタンだけmountが所有 | CL-Aの配置、Appの既存操作処理はChatGPT |
| Q07 | E067 は 402×874 で出ない見込み、E069 は屋根の高い棟で出ない（条件付き表示）。新しい絵の「端8px」を、画面外から流れ込む世界の絵にも当てるか | 置く時の判定は画面内8px、流れて出入りするのは可 | 本人 |
| Q08 | 中間旗・足跡が警察1人目の足元と画面で重なることがある（比較面ではない） | 可とし、画像で判定 | 本人 |
| Q09 | 警察1人で頭が振り向いている時に舌が出る見た目（§2.3） | 測る。悪ければ「頭の振り向きが 0.3rad 以下の時だけ描く」は描画側でできないので、処理側の開始条件の変更として依頼する | 本人・処理側 |
| Q10 | 結果アトラスを作り直すか、今の画像を並べ直すか（§3.11） | 10区画の差を見て A が選び、票に書く | A（記録） |
| Q11 | 結果の写真（2体目の主人公）を最初の画面に入れない並び（§3.5）。402×874 で写真の上端が約870px と境目に近い | `order` で成績の後ろへ。画像で確かめる | 本人 |

未確認（この票では確かめていない）：本編の資源の現行 head での数値（§2.1）、2つのアトラス作成スクリプトのこの環境での実行結果、WebGL の深度バッファの分のメモリ、`Intl.Segmenter`・Web Share・長押し保存の iPhone での動き、§3.5・§5 の画面上の位置の見込み（カメラの投影から計算した値で、実画像では未確認）。
