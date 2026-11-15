# カメレオる：PR #21後の担当分担と受け渡し仕様

2026-11-15初版、2026-11-16引継ぎ追記（日本時間）。#23の処理実装と#24のCIを組み合わせる計画改訂を反映する。Claudeの描画実装、通常起動への最終接続、実機合格、公開の報告ではない。

## 1. 今回の決定と参照元

本人の最新指示に従い、**Claudeはビジュアル・見た目・画面と操作の実装、ChatGPTは仕様を成立させる処理の実装**を担当する。旧依頼文の「Claude側が全工程を実装する」という分担は本書で置き換える。Claudeをこの文書作成時に起動したり、依頼を送信したりしたという意味ではない。

機能の内容は[改訂3の要件](2026-11-14-chameleol-design-followups-spec.md)を引き継ぎ、[PR #21の最終レビュー](../../reviews/2026-11-14-chameleol-design-followups-implementation-review.md)で決まった修正を取り込む。本書は担当と接続口を具体化し、古い計画・依頼文と担当が食い違う場合に優先する。新しい遊び方や配点は追加しない。

基準はPR [#21](https://github.com/chameleonjp-lab/chameleol/pull/21)を取り込んだmain `e6d2e14f65b117e2ea288196f68c38364837cdf5`。実装を始める時は最新mainとの差を確認する。後続工程は[今回の計画書](../plans/2026-11-15-chameleol-post-pr21-plan.md)で管理する。

### 2026-11-16の実装体制と責任の境界

[計画書の実行体制](../plans/2026-11-15-chameleol-post-pr21-plan.md#2026-11-16の開始状態)に、組織図・Opus 5.5／Sonnet 5.5・effort・同時4人の上限・編集ファイル・P0〜P6を追加した。モデル名と設定は役割ごとに指定し、未対応の設定を実行できたと記録しない。

#23は2026-11-16 07:01（日本時間）に#22の作業ブランチへマージされており、#24後のmain `f4206a4`には未反映だった。今回の引継ぎPRで既存の処理をmainへ提出し、#24のCIは保持する。機能の再実装や新しい採点は行わない。

Claude内で`street.js/stage.js`を編集する担当はB、共通CSSと結果のアトラスはA、街の素材と警察の描画部品はCに固定する。共有部分を同時に編集しない。`src/app.js`と仕様処理は引き続きChatGPT担当とする。

Claudeは`result-card-ports.js`の`createResultCardPorts({result,host,scope})`を提供し、`new App(root,{resultCardPorts})`の試験で実データとの接続を確認する。通常の`new App(root)`へ渡す最終の変更と`catalog.js`の96/4切替はG1でChatGPTが行う。ClaudeのPRはその接続例・未接続箇所も含めて引き渡す。Appの処理を変更しないために、固定値の画面を完成として出すことは認めない。

精密札は現在AppからHUDへ転送されていない。Claude Cがボーナス表示の`tick({precisionBadge,...})`に読み取り専用の札を受け取る表示口を追加し、Tが実controllerと明示接続して確認する。G1でChatGPTが舞台更新後の`gameExtrasController.snapshot().precisionBadge`を既存通知へ渡す。`step()`は舞台の1回だけにし、新しい時計・札の条件・得点・効果音を表示側へ増やさない。

No.34/39等の描画はClaude段階では新しい部品へsnapshotや固定姿勢を直接渡して確認する。Appの強制入口の拒否解除、96/4の正式切替、通常起動の本文共有試験の押す先変更はG1でChatGPTが担当する。Claudeは実portsを指定したAppの追加試験で画像共有と代替本文を検査し、通常起動の既存試験を保持する。

## 2. 守る条件

全50棟、既存の採点・順位・出題・履歴・署名summary・送信内容・識別値を維持する。規則v1〜v4、DB_VERSION=1、既存ストアと未送信結果を維持する。表示専用の処理から得点を書き換えない。

採用は元80件＋後続16件＝96件。E045・E051・E088・E097の4件は除外する。DES-01〜08、EXT-01〜04、RES-01〜08、FOLLOW-01〜08も引き継ぐ。主な対象はiPhone 17 Pro Safari。自動画像は402×700、402×874、874×402で作り、自動ブラウザと実機の結果を分ける。

Node.js 20以上、Three.js 0.170.0、既存の15言語を維持する。新しい実行時依存は必須にしない。mainへの直接push・本人に代わるマージ・記録初期化・本番データベース変更・無断公開・実験場への掲載は行わない。追加課金やCodex Cloudの実装ジョブは起動しない。

## 3. ファイルの担当

| 内容 | ChatGPTが実装する部分 | Claudeが実装する部分 |
| --- | --- | --- |
| 結果の値 | 27称号の判定、ベスト棟・実色の選択、ボーナス件数、公式訂正と欠損の扱い | 渡された値・文言をカードへ配置する |
| 結果画像・共有 | 画像の世代管理、事前生成の制御、共有可否、連打・取消・失敗、一時URLの管理 | 既存No.28の静止撮影、カード描画、保存画面と共有ボタンの見た目 |
| 舌とダイヤ | 移動時計、10秒境界、優先順位、抑止・停止・再開・取消の判定 | 舌の形・巻き戻り、姿勢、ダイヤの接地・追従、比較面と画面端の余白 |
| 街・警察・精密札 | 抽選・回数・予約・取得、発生条件、98%が500ms続いた判定 | 踏切・水・ロボット・鳥・旗・聞き込み・足跡・札の絵と動き |
| 既存の結果パネル | 解析の値・中断・履歴の保護、再プレイの動作 | グラフの印・フィルム幅・読みやすさ・縦横配置 |

ChatGPTは `src/app.js`、`src/presentation/result-evidence.js`、新規の判定・制御モジュール、`src/ui/share-card.js`、`src/presentation/catalog.js`、保存・通信の接続、翻訳キーと意味を管理する。Claudeは `src/scene/street.js`、舌の描画、新規カード・主人公表示、`result-evidence-view.js`、`street-accents.js`、`actor-reactions.js`、`src/ui/presentation.css`、必要な素材制作スクリプトを管理する。

`src/app.js` はClaudeへ渡さず、ChatGPTが画面部品を接続する。`catalog.js` の判定と `street-accents.js` の描画を分ける。`result-view.js`、`scene/stage.js`、15辞書、アトラス定義のように両者へ影響するファイルは、変更区間と担当を受け渡し票に書き、一時点では一人だけが編集する。判定と画面が同居している既存ファイルは、必要な部分だけを新しいモジュールへ移す。無関係な全面改修はしない。

Claudeは画面内で称号・得点・回数・時刻の条件を作り直さない。ChatGPTは仮の四角や試験用の画面を完成したビジュアルとして提出しない。見た目に修正が必要な時は、画像と条件をClaudeへ返す。

## 4. 結果のデータと画面の接続口

以下の処理側は**#23で実装済みの契約**で、今回の引継ぎPRに含める。描画側の`createResultPortrait`、`drawResultCard`等はClaudeがこれから実装する。実際の関数・ports・Appオプションは[実装後の接続票](../../prompts/2026-11-15-claude-pr23-handoff.md)を照合し、処理を作り直さない。

```js
rankForPassed(passed) // -> { rankKey, from, to } | null
selectBestVisual({ summary, rules, visualSamples })
// -> { building, hsv, average, instantMatch } | null
buildResultCardModel({ displaySummary, rules, evidence, locale, revision, verificationState })
// -> ResultCardModel（読み取り専用）
buildResultMiniatureModel({ displaySummary, arrivedBuilding, targets, evidence })
// -> ResultMiniatureModel（読み取り専用。result-miniature-data.js）
```

`evidence` は既存 `resolveResultEvidence(result)` の戻り値（`status: pending|ready|missing|failed`、`data`、`reason`、`revision`）。`ResultCardModel` は `{revision, locale, passed, rankKey, totalScore, bonusCount, countState, hero, verificationState}`。不正な通過数・矛盾する50棟は `passed:null, rankKey:null` とし「確認中」を出す。`countState` は `known|missing`、`hero.status` は `pending|matched|missing`。`hero` は選んだ `building`、実際の `hsv`、`outlineBuilding`、棟平均 `average` と瞬間値 `instantMatch` を別々に持つ。欠損の値を0に置き換えない。

旧DES-03の「結果モデルは到達棟」とRES-04の「輪郭は選ばれた棟」には食い違いがある。本計画の判断として、カードとE090は具体的なRES-04を優先し、実色と同じ最高一致棟を `outlineBuilding` にする。例：ベストが5棟目・到達が40棟目なら輪郭は5棟目の段階。missingでは1を使う。これは本人が新たに指定した内容とは区別し、到達棟は地図等の進行表示に引き続き使う。

称号は[正式な27区分](2026-11-14-chameleol-design-followups-spec.md#res-02正式な称号表)を使い、0・1・50棟を特別扱いする。`displaySummary = applyVerifiedScore(result.summary, result.verifiedScore)` のコピーだけから今回の称号・総点・件数を作る。元summaryを書き換えない。`buildResultData` のv1固定の検査や丸めた棟平均を、新カードのベスト棟判定へ流用しない。版の文字列が無い時は最新版を推測しない。

ベスト棟は有効な通過済みtupleの `matchSum/evalMs` をBigIntの交差積で比べ、同率は早い棟。**ベスト棟を先に決め、その棟の実色が無い時は記録なし**とする。色のある次点の棟へ差し替えない。実色は既存 `data.visualSamples` の当該1件だけを使う。`pending` では解析中、0棟・旧結果・欠損・解析失敗では既存初期色＋「一致度の記録なし」。壁色や平均から色を創作しない。

ボーナスは5行のcount合計と、重複しないaward ID数が一致することを確認する。精密5/10点は択一で1件、E044は0件。現行の完全成功例は156件・7280点を別に検査する。対応版の0件と旧版・壊れた形式の記録なしを分ける。既存 `buildBonusResult` へ壊れたtotalsをそのまま渡さない。

Claudeは `createResultPortrait({hero, signal, rendererLease}) -> Promise<{image, dispose}>` と `drawResultCard(canvas, {model, portrait, locale}) -> void` を実装する。PNGは1200×630、結果画面と同じ描画関数を使う。画面には称号・スコア・通過棟数・件数を読み上げ可能な文字でも置く。カードの主人公は1体。既存の補足写真・立ち姿等（No.71/80/93/99/100）は主操作より下の常時表示領域へ残し、畳んだり隠したりしない。主カードの隣へ2体目を並べない。任意パネルは追加資料のE075/E090等に使う。

ChatGPTは `createResultCardController({result, locale, layoutKey, ports})` を実装し、`snapshot()`、`refresh({locale, layoutKey})`、`retry()`、`share()`、`dispose()` を公開する。`ports` は上の撮影・描画関数、`encodePng(canvas,{signal})`、`shareImpl(payload)`、`onChange(snapshot)`、`getPublicUrl()`。`share()` は利用者のタップからのみ呼ぶ。`retry()` は同じ条件でもrevisionを増やして古い失敗・生成を無効にし、撮影またはPNG作成を再試行する。成功済みの同じ主人公画像は再利用し、失敗した画像は再利用しない。再試行で自動共有はしない。`snapshot` は `{model, miniature, state, prepared, revision}`、`state` は `pending|ready|sharing|unavailable|failed`。`prepared` は `{file,blob,revision}` またはnull。画面部品はこの状態からボタンと説明を表示する。

E075の `ResultMiniatureModel` は `{available,reason,cells}`。有効な場合、`cells` は全50棟の `{building,state,wallHsv,bodyHsv}` で、stateは `passed|arrived|unreached`。ChatGPTが `result.arrivedBuilding` と表示成績から確定し、50棟クリアには未通過の到達棟を追加しない。wallHsvは既存targetsのみ、通過棟のbodyHsvは当該実色のみ、到達棟は `finalColors.bodyHsv` のみを使う。色が欠ける時はnullを渡し、Claudeは白と欠損説明で描く。棟数・到達情報が不正ならavailable:false。targetsが無いだけなら棟の進行は表示でき、壁色だけnullにする。模型内で通過・到達の条件や体色の補完を再実装しない。

`result-card-controller.js` がカード世代を持つ。解析の世代だけでは足りない。公式訂正、`result.netState`、言語、結果、レイアウトが変わったら同期で旧Fileを無効にし、前の生成を中断する。既存 `renderResultScore` のverifiedScoreだけの早期returnより前に、状態変更も通知する。遅い撮影やPNG完成は世代と対象結果が一致する時だけ採用する。

同じ主人公画像は `lastResult` のメモリに一つ保持し、15言語の切替で撮り直さない。ホーム・本編・新結果へ移る時に既存 `releaseResultEvidence` と同じ経路で解放する。任意パネルの描画器と撮影用描画器は同時1個。ChatGPTが `result-renderer-owner.js` で取得・解放順を管理し、Claudeがその取得口だけから描画器を借りる。E090使用中の訂正は一度解放し、カード撮影を優先してからE090を新モデルで開き直す。

`mountResultPanels({host,t,state,panels})` の `panels` にE075/E090を最初から登録する。後からの `addPanel` に頼らない。パネルは一つだけ開き、`render` は解放関数または `{dispose}` を返す。E090は横8px以上で回転し、縦はページのスクロールへ渡す。主カードは回転しない。

## 5. 画像共有の約束

ChatGPTは `sharePreparedResult({prepared,currentRevision,text,url,navigator}) -> Promise<'shared'|'cancelled'|'unavailable'|'failed'>` を `src/ui/share-card.js` に実装する。PNGはタップ前に作る。タップ内では準備済みFileを取り、`canShare({files})` と同じ全payloadの `canShare(payload)` を確認して `share(payload)` を呼ぶ。タップ後に撮影・フォント待ち・画像生成を挟まない。空・nullのURLはpayloadから省く。

非対応・失敗時に本文だけのX画面を自動では開かない。「画像を保存」「本文でXを開く」を明示操作で用意し、取消や共有先なしのAbortErrorも通常復帰にする。「画像を保存」はPNGのimg表示・長押し案内・downloadを用意する。準備失敗で主人公が無い時はFileを作らず、作り直す操作を出す。初期色＋記録なしが完成したカードは共有できる。

共有中の重複呼出は止める。Promiseの完了と画面への帰還でbusyを整理し、代替操作は使えるようにする。ただし未完了のOS共有要求を二重に発行しないよう、画面のbusyと未完了要求の識別子は別々に持つ。共有完了をXへの投稿成功とは表示しない。カード・本文へ名前、内部ID、seed、履歴、照会情報、未確定順位を入れない。ホームの本文共有は維持する。

正式URLをこの文書から固定し直さない。実行中の `runtime.publicUrl` を使い、候補の配布設定とcanonicalが一致することをG2で確認する。旧記録にはPagesとSitesの両方があり、2026-11-15の現行本番は未照合。URLの決定のために実装全体を止めない。

## 6. ゲーム中の判定と描画の接続口

ChatGPTは既存の `extrasPort` を再利用する。実際の入口は `claimCameoStart(state)`、`loadDirector()`、`restore()`、`claimPrecisionBadge()`、`ready`、`fresh`、`initialState`、`restored`、`disabled`。ストア内部の `{playId,tabId,generation}` をClaudeへ再実装させない。新規count:0の保存は既にapp側が行うため、描画側で二度取得しない。

ChatGPTは `createGameExtrasController({playId,rules,extrasPort,seed})` を `game-extras-controller.js` に実装する。`step(input)`、`event(event)`、`snapshot()`、`dispose()` を持ち、`snapshot()` は `{travelTongue,cameo,policeExtra,precisionBadge}` を返す。各項目はnull、または `{id,startedAt,elapsedMs,phase,building}` と機能固有の描画データ。舌は `phaseProgress` と `jewelVisible`、小芝居は `durationMs`、警察は `kind:'inquiry'|'footprints'`、札は `kind:'nearPerfect'` を加える。idは表示の重複防止用で採点や送信へ混ぜない。

`step` の入力は `{t,building,phase,running,moving,hidden,drawable,guideActive,warningActive,policeStage,actorBusy,reducedMotion,placements,evaluationSegments}`。`t` はゲーム時計ms。`actorBusy` は `{hero:boolean,police:boolean}` とし、既存反応の状態を分けて渡す。舌はhero、聞き込み/足跡はpoliceの占有を判定し、一つの真偽値で両方を止めない。`placements` は描画側が返す `{railway,water,robot,bird,midpoint,policeSettled}` の可否。絵を置けない理由から配点や出題を変えない。`evaluationSegments` はChatGPTが本編の入力・評価区間から作る `{building,from,to,matchUnits,unitsPerPercent,evaluationEnd}` の順序付き配列で、フレーム数から達成を推測しない。Claudeはこの配列を作らない。

Claudeは `street.js` の既存フレーム内で描画に必要な配置可否・既存反応中の状態を渡し、controllerの出力を描くだけにする。独立した時計・抽選・98%判定・保存を追加しない。ChatGPTがappでcontrollerを生成し舞台へ渡す。controllerは描画側がdisposeしても二重解放に耐え、画面離脱後の非同期取得で表示を復活させない。

| 項目 | 処理側の約束 | 見た目側の約束 |
| --- | --- | --- |
| 舌 | 移動10,000msごと、150/250/350/450/200msの5段階。抑止機会は消費。停止・非表示は時点保持、離脱・終了・描画喪失・動きを減らすへの変更は収納取消 | 同じ舌の曲線から85%位置と接線を取得。ダイヤは専用の不透明な1形状・1描画とし、舌の所有物として解放。旧計画の「借用して2描画」は採らない |
| 舌の競合 | 終了→離脱/停止→ガイド/警告/既存反応→周期の順。10,000msと50,000msの自然な通過も検査 | 前補正解除→基本歩行→既存反応→追加姿勢。胴の範囲＋4pxへ重ねず、壁の遮蔽1.5%以下・画面端8pxを警察1人の振り向き時も測る |
| 小芝居 | 既存分と合計6回、15秒間隔、開始前の保存取得。E056用1回と110000〜126500msを予約。機体最大1500ms、最遅終了128000ms | 同時1組3枚、鳥・荷物・ひもも数える。期限切れは静止旗。自己ベスト25棟の旗と位置を分ける |
| 抽選 | 既存90＋追加36の合計126を140の区間で抽選し、出ない確率10%を維持。不適合配置は回数を消費しない | E069は空の領域が足りない寸法で条件付き非表示。背景配置の代替案を出せるが、比較面へ移して無理に表示しない |
| 警察 | 猶予開始、1人・立ち位置到着・ガイドなし・既存動作なしでE034→次機会E039、各1回。既存交互表示の番は進めない | 足・影・道具・光も追従。取消で補正0。実際の追跡位置・警戒を変えない |
| 精密札 | 実値98%以上が連続500ms、同playIdで1回。499/500msと97.999/98.000%を分ける。追加点0 | 既存ボーナス表示へ統合し、別の札で警告やガイドを隠さない |

## 7. 資源と受け渡し

街7枠、静的装飾24、小芝居1組3枚、環境粒子8、成功リング1、追加描画呼出12・形16・画像4、圧縮画像1.5MiB・展開後16MiBを新旧合計で守る。表示保存は32KiB・直近32playId以内を維持する。

結果画面の16MiBは、同時保持する読み込み済み画像・画面接続canvas・主人公画像の `幅×高さ×4` の合計で数える。初期配分はアトラス1920×1520＝11,673,600B、カード1200×630＝3,024,000B、主人公691,200B以下、任意パネル1,254,400B以下、合計16,643,200B。一時PNGのimg表示は同じ絵を重複保持せず、canvasからの表示切替などで上限を守る。撮影中の描画器は別に同時1個で管理し、撮影後すぐ解放する。

各受け渡し票に「基準commit・対象要件・変更ファイル・公開関数・固定入力と期待値・対象試験結果・画像・残る制約」を書く。Claudeの部品は実データで接続してから完了とする。APIモックだけの成功、画像のない見た目合格、実機でないX添付合格を認めない。
