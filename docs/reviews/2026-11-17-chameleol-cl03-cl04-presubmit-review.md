# PR #26：CL03・CL04 の提出前レビュー（CL-R）

2026-11-17。担当 CL-R（提出前の独立レビュー。設計・実装には関わっていない）。対象は共有ブランチ `work/chatgpt-cg00-cg02-20261116` の head `dffca69`、比較元は CL02 受入修正後の `84eeb5c`。正本は全体要件 F01〜F14、契約 IF01〜IF11 v1.2、CG02 補足、設計票 §2・§4〜§8。CL02 はやり直していない。製品コード・試験コードは変えていない。

**この文書の状態：第3版（途中）。** 先に確かめた所までを書き、まだ確かめていない観点は §5 に「未検証」として並べる。確かめたら追記する。

**合否（暫定）：修正後に提出。** 製品コードの契約違反は今のところ見つけていない。重要な指摘は試験の検出力（R01・R02・R05）と、縦画面で事実上見えない案（R06 E056・R07 E069）と E067 の絵の重なり（R08）。§5 の未検証が残っている間は「提出可」にしない。

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
| 既存61枠の画素 | 84eeb5c の `atlas.webp`（1024×1024）と dffca69 の `atlas.webp`（1024×1536）を CL-R が PIL で展開し、0〜60番の128px の枠ごとに RGBA を比べて差0。`scripts/street-atlas-v1-base.webp` は元の画像とバイト一致。新しい画像は無損失（VP8L）。shader の行の計算 `11-floor(cell/8)`・`/vec2(8,12)` は画像の上から数えた行と合う |
| アトラスの無損失化（意見） | 妥当。非可逆で作り直すと既存61枠の画素が変わる（測定記録：最大255・平均3.8）。圧縮後は3画像合計 632,946B（上限 1,572,864B）、展開後は大きさで決まり 6,291,456B で非可逆でも同じ。画像は1枚のままで描画呼出・形も増えない。増えるのは読込とデコードの時間だけで、iPhone での時間は §4 |
| 絵の品質 | 新しい19枠（`cl04/street-atlas-new-cells.png`）に文字・仮の四角は無く、線の色・太さ・`eye()` の顔が既存の街の絵柄と合う。警察2案の姿勢（`cl04/police-extras-poses.png`）は聞き込み（似顔絵を上げる）と足跡（前かがみで光を足元へ）が読み取れる。札（`cl04/badge-*.png`）は通知の位置に「◎ 98%」だけで点数なし、地区名と重ならない |
| 舌とダイヤの見え方 | `cl03/*-hold*.png`：3寸法とも保持中のダイヤが宝石の形に見える。尻尾の宝石は同時に出ていない。収縮（retract）で巻き戻る形も自然 |

## 2. 指摘

| ID | 重さ | 根拠 | 影響 | 修正先 | 判定した修正と確かめる試験 |
| --- | --- | --- | --- | --- | --- |
| R01 | 重要 | `tests/e2e/extended-stage.e2e.mjs:41-48` が controller の戻り値を `tp.override` で差し替え、街5案（:100-128）と警察2案（:141-150）、最大負荷（:172）の絵をすべて合成の枠で出している。実 controller と accents の組合せは単体（`tests/presentation/street-extras.test.mjs:367-446`）にあるが、そこでも `placements` は全部 true の固定値 | 「実舞台の placements → 実 controller が新しい案を始める → 同じフレームに舞台が描く」がブラウザで一度も通っていない。placements の形や時刻の食い違いがあっても試験は通る | CL-B（試験の追加。製品コードは変えない） | 追加の e2e：override なし、16ms 刻み、舞台を `createStage(host,{presentationSet:'extended96',gameExtrasController})` で作り、controller の `extrasPort.initialState.rngState` を最初の機会で E020 が選ばれる値にする。402×700 で `snapshot().cameo.id===20` になったフレームに `presentationStats().storySprites>=1`、その前のフレームは0。E056 は 874×402 で `pass 25` の後に delivery→static を実 controller で通す |
| R02 | 重要 | `extended-stage.e2e.mjs:200-226`「a null cameo draws nothing」は 100ms 刻みの同期ループ（`page.evaluate` の中で一度も `await` しない）。① controller の取得（`claimCameoStart`）は `await` の後でしか cameo を有効にしない（`cameo-reservations.js:27-32`）ので、ループ中は cameo が一度も出ない。② 100ms は 50<ms<1000 なので、30フレーム（約3秒）で controller が新しい背景を止める（`game-extras-controller.js:29-31`）。旧 director も同じ条件で止まる（`catalog.js:46`）。試験は `offered` を assert しない。CL-R の実測（同じ流れを scratchpad で再現、402×874、t=1000〜80000）：4フレームごとに `await` を入れても、100ms では出たのは1案（14）・描画10フレームだけ。16ms では3案（14・36・12）・描画277フレーム、出ていない時の描画0 | 「controller が出した時だけ描く」を確かめる力が無い。旧描画への逆戻りも最初の約3秒しか検出できない | CL-B（試験） | 刻みを16ms にし、数フレームごとに `await` で取得を進める（固定時間の待ちではなく Promise の解決を待つ）。`offered.length>=2`・`shownWithOffer>0`・`shownWithoutOffer===0` を assert。検出力は、accents の extended96 で旧 director を一時的に動かした版で失敗することで確かめる |
| R03 | 軽微 | `tests/e2e/travel-tongue.e2e.mjs:446` の `setTimeout(resolve, 50)`（簡易DOMの札の取得待ち） | CI の遅さで不安定になりうる。チームの決まり（状態を待つ）に反する | CL-B（試験） | `page.waitForFunction` で `snapshot().precisionBadge` が来るのを待つ |
| R05 | 重要 | `extended-stage.e2e.mjs:55-59`（`settle`）と `:84-87` は棟の開始から 1500ms 進めた時点（`settle`）の `placements` を見て、置けた案だけ画像を書く。controller が機会として `placements` を読むのは grace に入る最初の1フレームだけ（`cameo-reservations.js:47`）。CL-R の実測（§6 の走査B）では、402×874 の E067 は grace 最初のフレームで 0/49棟、1500ms 後なら置ける。`cl03/402x874-E067.png` は実際のプレイでは起きない場面。`cl03/*-E056-static.png` は「静止旗」の証拠のはずだが、402×700・402×874 では旗が画面に無く、874×402 は左端で切れている。試験は `staticDecorations<=24` だけを見て、`presentationStats().staticFlag` を確かめていない（`:122-128`）。`cl04/measurements.md` の「E056 402×700 可」は実際には開始しない（R06） | 条件付き非表示の記録と画像が実際のプレイと違い、CG-R・本人の判断（Q07）を誤らせる。静止旗が描かれない不具合があっても試験は通る | CL-B（試験と画像）、CL-C／CL-W（測定記録） | ① 置ける・置けないの判定は grace に入る最初のフレームの `placements` で行い、controller が始められる場面だけ画像にする。② 静止旗の画像は旗が画面に入る時刻（例 126500〜126700ms）で撮り、`staticFlag===true` を assert。③ 測定記録の可否表を §6 の走査B（実舞台・grace 最初のフレーム）の値へ差し替え、C の単体試験の可否は試験用カメラの値だと注記する |
| R06 | 重要 | 実舞台＋実 controller（override なし、16ms 刻み、seed 1、§6 の走査C）で 124992〜132000ms を通した。E056 の機体（delivery）が始まったのは 874×402 だけ（125632ms〜、93フレーム中92で描画）。402×874 は 125000〜126500ms の全94フレームで `placements.midpoint` が false（左端8px）。402×700 は 125000ms からの19フレームだけ true で、その全部が棟26に入った直後の主人公の反応（`actorBusy.hero`、38フレーム）と重なり、controller は開始しない。代わりの静止旗は x=250 に固定のため、主人公が通り過ぎた後の 126500ms から出て、画面に描かれたのは 402×700 で40フレーム（約0.64秒）、402×874 で15フレーム（約0.24秒）だけ | E056 は主対象の縦画面（iPhone）で事実上見えない。契約（間に合わなければ静止旗）には反しないが、要件の「25棟通過後1回」の演出が届かない（意見） | CL-C（`street-accents.js` の `midpointSpecs`・`fits(56,…)`）、確認の試験は CL-B | 旗の着地点 `fx` を主人公の進む先へ寄せる（初期値の例：250→252〜253。値は §6 の走査Cと同じ方法で決める）か、端8pxの確かめを着地時の主人公の位置から計算し直す。自己ベスト旗（x=best×10、z=−0.6）とは画面で6px以上離す。合格の目安：3寸法すべてで 125600〜126500ms（主人公の反応の後）に置けるフレームがあり、override なしの実 controller の e2e で delivery が始まり描かれる |
| R07 | 重要（本人の判断が要る） | §6 の走査B：grace 最初のフレームで E069（配達鳥）を置ける棟は 402×700 で 0/49、874×402 で 0/49、402×874 で 5/49（棟3・24・30・42・45）。屋根の線より4px上・HUD 下端＋6px より下・高さ56px以上の条件（`street-accents.js:165-174`）を満たす空がほとんど無い | 契約（置けない寸法は条件付き非表示）の範囲だが、3寸法のうち2つで一度も出ない。選ばれた機会は再抽選しないので、その回の小芝居は無くなる | CL-C（`birdSpecs`・`fits(69,…)`）。出さない判断なら本人（Q07） | どちらかを選ぶ：① 鳥の絵を小さくする（例：鳥 1.5×1.22→1.1×0.9、荷物 0.75→0.55）・最低高さ56px→40px・奥行き z=−1.2→より奥にして、3寸法とも半数以上の棟で置けるようにする。② 実質出ない案として記録し、本人に Q07 として判断を仰ぐ。どちらも §6 の走査Bと同じ方法で数を記録する |
| R08 | 重要 | 画像 `cl03/402x700-E067.png`・`402x874-E067.png`・`874x402-E067.png`：雨どいの水が街灯の柱の真後ろにあり、柱で縦に二分される。渦は街灯の台座の後ろ。街灯は路地の中央 x=k×W・z=0.45（`street.js:681-686`）、水は x=bx+10・z=0.15、渦は x=bx+10・z=0.4・y=0.55（`street-accents.js:36-45`）で、毎回同じ x に重なる | E067 の絵が3寸法とも読み取りにくい（雨どいと渦に見えない） | CL-C（`gutterSpecs`） | 水と渦を柱から外す。例：水 x=bx+10−0.3・幅 0.8→0.5、渦は設計票 §5.4 どおり歩道の上（z=0.9・y=0.25 の平置き）で x=bx+10−0.3。路地の隙間の内側2px・比較面の不一致0・遮蔽1.5%以下を既存の e2e で確かめ、柱と重ならない画像を3寸法で残す |
| R09 | 軽微（記録） | 置く判定と毎フレームの判定で、道の帯の絵だけ主人公・警察の箱に対する余白が −10px（10px までの重なりを許す。`street-accents.js:156,193`）。設計票 §5.1 は「6px 以上離す」。箱は足元（y=0.2・z=3）まで含む広い箱で、重なるのは足の下の帯だけ。画像（`cl03/402x700-E068.png`・`E020.png`）でも絵は足の線より下で、胴とは離れている。比較面の不一致0は e2e で確認済み | 胴＋4px・比較面への影響は無い（意見）。設計票の値との食い違いが記録に無い | CL-C（設計票または測定記録への注記） | コードは変えない。−10px の理由（道の帯は主人公より手前で、足元の広い箱の下端だけに重なる）を測定記録へ書く |

ChatGPT 側へ渡す事項（CL の欠陥ではない）：

| ID | 内容 |
| --- | --- |
| H01 | `App.debugPresentation`（`src/app.js:677`）は 100ms 刻みで31回 `stage.update` を呼ぶ。G4 で検証入口を extended96 にすると、この予熱だけで controller の遅いフレーム抑止（30連続）が働き、以後そのプレイでは新しい背景が始まらない。検証入口の切替時に予熱の刻みを見直す |

## 3. 未決事項（Q07〜Q11）の判定

| 番号 | CL-R の判定 | 根拠 |
| --- | --- | --- |
| Q07 | 仮決め（置く時に画面内8px、流れて出入りは可）を認める。ただし「置けない寸法で出ない」が実際にどれだけ起きるかを記録に出し、本人に見せる。E069 は R07、E056 は R06、E067 の 402×874（grace 最初のフレームで 0/49）は条件付き非表示として記録すればよい | `fits` は各案の決まった時刻だけ端8pxを見て、電車・機体（`enter`）は除く。毎フレームの判定は端を見ない（`street-accents.js:157,190-196`）。§6 の走査B |
| Q08 | 可 | `cl03/874x402-E056-flag.png`：機体と旗は警察の足の手前の道の帯で、警察の体には重ならない。`402x700-footprints.png`：足跡は警察の足元（調べている対象なので自然）。警察は比較面ではない |
| Q09 | §7 に書く（ブラウザ試験の診断値で判定） | — |
| Q10 | 本レビューの範囲外（結果アトラスは CL02 で記録済み）。街アトラスは無損失で作り直す判断を妥当とする | §1 |
| Q11 | 本レビューの範囲外（CL02） | — |

## 4. iPhone 実機でしか確かめられない事項

段階1の細い輪郭と舌・ダイヤの見え方（倍率3）、30秒の描画時間（95百分位 33.4ms 以下・中央値悪化10%以内）、街アトラス 1024×1536（無損失 WebP 約52万バイト）の初回読込とデコードの時間、効果音が増えていないこと、「動きを減らす」を OS の設定で途中に変えた時の収納。自動 Chromium（SwiftShader）の結果をこれらの合格に読み替えない。

## 5. 未検証（第1版の時点）

影響の大きい順。確かめたら §1・§2 へ移す。

3. ブラウザ試験の実行（既存の CL03/CL04 e2e が通るか、比較面・端8px・遮蔽1.5%の数値）
4. Q09：舌の根元と胴の距離（0〜1.9px）の重さ
5. F12 資源：新旧合計の描画呼出・形・画像、静的装飾24・粒子8・小芝居3枚（e2e の診断値）
6. IF10：再プレイ・ホームへ戻る・描画喪失の後に古い舌・絵・札が戻らないか

## 6. CL-R が行った確認（第2版で追加）

一時スクリプトはリポジトリの外（scratchpad の `clr/`）に置き、試験専用入口 `tests/e2e/fixtures/extended96.html` と実 App の `debugStart({atMs:1000,seed:1})` の後、App の描画ループを止めて `stage.update` を手で進めた（自動 Chromium・SwiftShader・倍率1。iPhone 実機の値ではない）。controller は App が作った本物で、戻り値の差し替えはしない。

| 走査 | 方法 | 結果 |
| --- | --- | --- |
| A 画像の目視 | cl03 の舌5段階（hold・retract ほか）、E020・E067・E068・E056-flag・E056-static を拡大して見た | 舌とダイヤは3寸法とも保持中にダイヤと分かる（402×874 で約18px）。尻尾の宝石は出ていない。E020（電車と遮断機）・E068（ロボット）・E056 の機体は小さい（約20〜30px）が絵柄は既存の街に合い、文字や仮の四角は無い。E067 は R08。E056-static は R05 |
| B 機会のフレームの可否 | 棟2〜50 それぞれ、直前 800ms を eval で16ms 刻みに進め、grace に入る最初のフレームの `placements` を記録（警察0人） | 402×700：踏切 49/49、雨どい 48/49、ロボット 49/49、鳥 0/49。402×874：49/49、**0/49**、49/49、5/49。874×402：49/49、48/49、49/49、0/49。主人公の反応中（`actorBusy.hero`）は各4/49 |
| C 中間旗 | 118000ms から16ms 刻み、124990ms に `pass 25`、132000ms まで。controller の cameo と `presentationStats()` を毎フレーム記録 | R06 のとおり。874×402 は delivery 93フレーム中92で絵あり、その後の静止旗は25フレーム描画 |
| D cameo の出し方 | R02 の試験と同じ流れ（402×874、t=1000〜80000）を 100ms と 16ms で、4フレームごとに `await` | R02 のとおり |
| （参考）棟の中の全時刻 | grace の 1400ms 全体を 50ms 刻み | 402×874 の雨どいは 49/50 になる。controller は最初のフレームしか読まないので、この値を可否として記録しない |
