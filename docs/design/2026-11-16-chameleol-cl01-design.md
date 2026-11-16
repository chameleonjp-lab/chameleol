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
