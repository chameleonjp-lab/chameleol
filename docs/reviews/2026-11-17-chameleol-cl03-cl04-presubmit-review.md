# PR #26：CL03・CL04 の提出前レビュー（CL-R）

2026-11-17。担当 CL-R（提出前の独立レビュー。設計・実装には関わっていない）。対象は共有ブランチ `work/chatgpt-cg00-cg02-20261116` の head `dffca69`、比較元は CL02 受入修正後の `84eeb5c`。正本は全体要件 F01〜F14、契約 IF01〜IF11 v1.2、CG02 補足、設計票 §2・§4〜§8。CL02 はやり直していない。製品コード・試験コードは変えていない。

**この文書の状態：第1版（途中）。** 先に確かめた所までを書き、まだ確かめていない観点は §5 に「未検証」として並べる。確かめたら追記する。

**合否（暫定）：修正後に提出。** 製品コードの契約違反は今のところ見つけていない。重要な指摘は試験の検出力（R01・R02）と記録の食い違い（R05）。§5 の未検証が残っている間は「提出可」にしない。

書き方：「事実」はコード・実行結果・画像で自分が確かめたこと。「意見」は CL-R の判断。

## 1. 確かめて問題が無かった点（事実）

| 観点 | 確かめた内容（ファイル:行は dffca69） |
| --- | --- |
| IF01 通常起動 | `resolvePresentationMode`（`src/scene/stage.js:12-14`）は `presentationSet==='extended96'` かつ `gameExtrasController.step` が関数の時だけ extended96。App は `presentationSet:'legacy80'` を渡したまま（`src/app.js:998`）。`git diff aac3d8e dffca69 -- src/app.js index.html src/presentation/catalog.js src/i18n` は空。`84eeb5c..dffca69` で処理側（game-extras-controller・cameo-reservations・police-extras・precision-badge・travel-tongue-motion・evaluation-segments）、src/rules・storage・net・ui、.github の変更は0 |
| 既存試験 | `git diff 84eeb5c dffca69 --name-status -- tests` は追加（A）だけで、既存の試験ファイルの変更は0 |
| 単体試験 | `tests/scene/*.test.mjs` と bonus-view・bonus-badge・police-extras-view・street-extras・actor-reactions・game-extras-controller・game-extras-compat・cameo-reservations・police-extras・catalog・stats・`tests/ui/game-extras-app`・`bonus-app` の計203件を CL-R が実行し、203成功・失敗0・skip0（Node 22.23.4） |
| IF02 1フレーム1回 | 立体の舞台：通常フレームは `stepExtended` の中で1回（`street.js:1264-1280`、`update` の `else` 枝）。開始演出と「終了演出中で演出フレームでない」呼出しは `stepIdle` で1回・`drawable:false`（`:1254-1257,1288-1289`）。終了演出の内部フレーム（`cutsceneFrame` あり）は step しない。`args.presentation` が無い呼出し（練習）は step しない。簡易DOMは `update` の最後で1回・`drawable:false`・配置なし（`stage.js:133`） |
| IF02 値の作り方 | `t` は `presentation.t`（App の `args.t`＝ガイドの sceneT は使わない）。`reducedMotion` は作成時に1回作った `matchMedia` の `matches===true` を毎回読む。`frameIntervalMs` は進行中・非表示でない・安全な整数の時だけ前回との差、初回・停止・非表示・逆行・不正は0（`stage.js:55-58`）。`bestDistance` は 0〜50 の整数か null。`priority` は作らない。`actorBusy` は `reactions.tick` の後に `reactions.busy()` を読む。`placements.policeSettled` は `policeStage===1` と警察1人目の到着（`street.js:1077`）から |
| IF09 抑止を描き直さない | extended96 の accents は旧 director を作らない（`street-accents.js:84`）。`higherPriority` による取消は legacy80 だけ（`:345-352`）。抽選・回数・間隔・期限は持たず、`cameo.elapsedMs` だけで絵を決める |
| 舞台から controller へ重ねて転送しない | `presentationEvent` は reactions/accents の `event` だけを呼ぶ（`street.js:1362-1366`）。controller の `event` は App だけが呼ぶ（`app.js:1043,1170`） |
| cameo:null で旧描画へ戻らない | `applyExtra` は毎フレーム `cameo`・`story` を空にしてから controller の値だけを入れる（`street-accents.js:202-210`）。extended96 の `forceEffect` は旧9案を拒む（`:358`） |
| 描画喪失 | `webglcontextlost` で舌を取消し、以後 `drawable:false`。購読は scope で外す（`street.js:808-814`） |
| F03 舌の時計 | 姿勢は `travelTonguePose(frame)`（`travel-tongue.js:58-130`）が `phase`・`phaseProgress` だけから決める純粋な関数。時計・乱数なし。段階の長さ 150/250/350/450/200ms は表示の換算だけ |
| F03 ダイヤ | 専用の八面体1形状・頂点色の不透明材質1つ・輪郭なし、舌の mesh の子。位置は形を作る同じ中心線の 85% の点と接線（`writePoint(0.85)`）。舌の表示中は尻尾の宝石を `false` に置き、戻す時は自分の書いた値のままの時だけ前の値へ |
| F03 姿勢の復元 | 台帳（`tongue-rig.js:19-66`）は「今の値が自分の書いた値の時だけ前の値へ」戻す。毎フレーム `prepareBase()` が基本歩行の前に戻す。同じ枠では形を書き直さない。1000周期・既存反応・停止を混ぜた試験が本物の主人公で舌なしの姿勢と一致（`tests/scene/travel-tongue.test.mjs`） |
| F03 取消 | 終了演出の開始（`street.js:1437`）、開始演出と終了演出中の呼出し（`stepIdle`、`:1254`）、描画喪失（`:808`）、「動きを減らす」への変更（`:804`）で同じフレームに取消。変更監視は scope で外す。`dispose` は2回目に何もしない |
| ホームの舌 | 形の計算は `tongue-rig.js` へ同じ式のまま移動。ホームは同じ extension・unroll なら形を書き直さないだけ。時間制御（showcase-motion）は変更なし。旧形状の頂点との一致試験あり（`tests/scene/fixtures/showcase-tongue-baseline.mjs`） |
| F05 警察の補正 | `dx` は `updatePolice` が root の位置を毎フレーム `playerX+ferretRel` へ置き直した後に足す（`street.js:1073,1274-1278`）ので、停止中も累積しない。停止中の `reactions.tick` は姿勢を保持して戻らず（`actor-reactions.js:77`）、`applyPoliceExtra` は姿勢を書かず同じ `dx` を返す。`ferretRel`（実際の追跡位置）と警戒は変えない。似顔絵・双眼鏡の交互の番（`alternate`）に触らない |
| F05 足跡 | `policeExtra.building===current` の間だけ描き、棟が変わると鍵を捨てる（`street-accents.js:209`）。終了で消す |
| F06 札 | `tick` は引数に `precisionBadge` の項目がある時だけ札を置き換える（`bonus-view.js:30`）。`show(batch)` の中の `tick` は項目を持たないので札を消さない。`guide/warning` で隠す。98%・500ms・期限・加点・効果音を持たない。文言は `t('presentation.nearPerfect')`、キーが無ければ `◎ 98%`（App の `t` は欠けたキーをそのまま返す。`i18n.js:35-38`） |
| 除外4件 | E045・E051・E088・E097 を扱う追加は無い（差分に出る数字は絵の座標だけ） |
| CG02 の代用品 | 製品の差分に試験用 renderer/stage・fixture の読み込みは無い |

## 2. 指摘

| ID | 重さ | 根拠 | 影響 | 修正先 | 判定した修正と確かめる試験 |
| --- | --- | --- | --- | --- | --- |
| R01 | 重要 | `tests/e2e/extended-stage.e2e.mjs:41-48` が controller の戻り値を `tp.override` で差し替え、街5案（:100-128）と警察2案（:141-150）、最大負荷（:172）の絵をすべて合成の枠で出している。実 controller と accents の組合せは単体（`tests/presentation/street-extras.test.mjs:367-446`）にあるが、そこでも `placements` は全部 true の固定値 | 「実舞台の placements → 実 controller が新しい案を始める → 同じフレームに舞台が描く」がブラウザで一度も通っていない。placements の形や時刻の食い違いがあっても試験は通る | CL-B（試験の追加。製品コードは変えない） | 追加の e2e：override なし、16ms 刻み、舞台を `createStage(host,{presentationSet:'extended96',gameExtrasController})` で作り、controller の `extrasPort.initialState.rngState` を最初の機会で E020 が選ばれる値にする。402×700 で `snapshot().cameo.id===20` になったフレームに `presentationStats().storySprites>=1`、その前のフレームは0。E056 は 874×402 で `pass 25` の後に delivery→static を実 controller で通す |
| R02 | 重要 | `extended-stage.e2e.mjs:200-226`「a null cameo draws nothing」は 100ms 刻み。`frameIntervalMs=100` は 50<ms<1000 なので、controller は30連続で新しい背景を無効にする（`game-extras-controller.js:29-31`）。試験は `offered` を assert していない。旧 director も同じ30連続で止まる（`catalog.js:46`） | 「出された時だけ描く」を確かめる力が無い。旧描画への逆戻りも最初の約3秒しか検出できない（意見。実行での確認は §5） | CL-B（試験） | 刻みを16ms（50ms 以下）にし、`offered.length>0`・`shownWithOffer>0`・`shownWithoutOffer===0` を assert。試験の検出力は、accents の extended96 で director を一時的に作った版で失敗することで確かめる |
| R03 | 軽微 | `tests/e2e/travel-tongue.e2e.mjs:446` の `setTimeout(resolve, 50)`（簡易DOMの札の取得待ち） | CI の遅さで不安定になりうる。チームの決まり（状態を待つ）に反する | CL-B（試験） | `page.waitForFunction` で `snapshot().precisionBadge` が来るのを待つ |
| R05 | 重要（記録） | `docs/acceptance/pr26/cl04/measurements.md` は「E067 402×874 不可」「E056 402×700 可」。一方、実舞台の e2e は置けた案だけ画像を書く（`extended-stage.e2e.mjs:103,111`）が、`cl03/402x874-E067.png` は有り、`402x700-E056-flag.png` は無い。測定記録は C の試験用カメラ（`tests/presentation/street-fixture.mjs`）の値で、実舞台と食い違う | 条件付き非表示の記録が実際の舞台と違う。CG-R・本人の判断（Q07）を誤らせる | CL-W／CL-C（記録の訂正） | 実舞台の e2e の診断出力（`placements ... facts`）を3寸法で記録へ写し、C の単体試験の期待値が試験用カメラだけの値であることを書く。実行による確認は §5 |

ChatGPT 側へ渡す事項（CL の欠陥ではない）：

| ID | 内容 |
| --- | --- |
| H01 | `App.debugPresentation`（`src/app.js:677`）は 100ms 刻みで31回 `stage.update` を呼ぶ。G4 で検証入口を extended96 にすると、この予熱だけで controller の遅いフレーム抑止（30連続）が働き、以後そのプレイでは新しい背景が始まらない。検証入口の切替時に予熱の刻みを見直す |

## 3. 未決事項（Q07〜Q11）の判定

第1版では判定を保留する（画像と実測を見てから書く。§5）。

## 4. iPhone 実機でしか確かめられない事項

段階1の細い輪郭と舌・ダイヤの見え方（倍率3）、30秒の描画時間（95百分位 33.4ms 以下・中央値悪化10%以内）、街アトラス 1024×1536（無損失 WebP 約52万バイト）の初回読込とデコードの時間、効果音が増えていないこと、「動きを減らす」を OS の設定で途中に変えた時の収納。自動 Chromium（SwiftShader）の結果をこれらの合格に読み替えない。

## 5. 未検証（第1版の時点）

影響の大きい順。確かめたら §1・§2 へ移す。

1. 画像（`docs/acceptance/pr26/cl03/`・`cl04/`）の目視：舌とダイヤの見分け、絵の品質、旗・足跡と警察の重なり（Q08）、道の帯の絵と主人公の足の重なり
2. 道の帯の絵の当たり判定の余白：`street-accents.js:156,193` は主人公・警察の箱に対し道の帯の絵だけ −10px（10px まで重なってよい）。設計票 §5.1 は 6px 以上離す。比較面の不一致0の試験は通るが、見た目の影響は未確認
3. ブラウザ試験の実行（R01・R02・R05 の実行での裏付け、比較面・端8px・遮蔽1.5%の数値）
4. Q09：舌の根元と胴の距離（0〜1.9px）の重さ
5. F12 資源：新旧合計の描画呼出・形・画像、静的装飾24・粒子8・小芝居3枚、圧縮1.5MiB・展開16MiB。既存61枠の画素一致と、無損失化（114,676→516,128バイト）の判断
6. IF10：再プレイ・ホームへ戻る・描画喪失の後に古い舌・絵・札が戻らないか
7. E069（3寸法とも建物8で不可）・E056（縦2寸法で機体が出ない見込み）の扱いが契約どおりか
