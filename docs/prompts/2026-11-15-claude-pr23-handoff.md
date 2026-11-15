# Claudeへの引継ぎ：PR #23のChatGPT実装を使う

PR #22の計画に沿い、ChatGPTがC0〜C4の処理を実装した。ClaudeはV1〜V4のビジュアル・画面を担当する。この文書のコード例は接続方法の説明で、未実装の描画部品が本編へ接続済みという意味ではない。

## まず維持すること

`src/rules`、サーバーとの共有規則、署名summary、本編保存と送信内容は変更していない。表と保存の版・既存スコア・識別値を維持する。称号と配点、実色、精密札の条件を画面側で再計算しない。

既存80件の画面と強制検査を維持するため、`catalog.js` の旧採用80/除外20と旧directorはまだ切り替えていない。全16案が揃ったG1で96/4へ更新する。今回の `EXTENDED_CAMEOS` と `selectExtendedCameo` は新controller用で、旧directorと同時に抽選しない。

## 結果のデータ

| ファイル | 公開関数・入力 | 出力 |
| --- | --- | --- |
| `result-card-data.js` | `rankForPassed(passed)` | 正式な27区分のうち今回の1区分。不正値はnull |
| 同上 | `selectBestVisual({summary,rules,visualSamples})` | 最高平均の棟の実色。ベスト棟の色が無ければnull。次点へ替えない |
| 同上 | `buildResultCardModel({displaySummary,rules,evidence,locale,revision,verificationState})` | 読み取り専用の称号・総点・件数・主人公。棟平均と瞬間値は別 |
| `result-miniature-data.js` | `buildResultMiniatureModel({displaySummary,arrivedBuilding,targets,evidence})` | 全50棟のcells。passed/arrived/unreachedを処理側が確定 |

`hero.outlineBuilding` を輪郭の既存関数へ渡す。最高一致棟が5、今回の到達が40なら、カード/E090の輪郭は5棟目の段階になる。missingは初期色＋「一致度の記録なし」、輪郭は1。pendingから共有用Fileを作らない。

称号は `card.rank.<rankKey>`。全27キーと、`card.bonusCount/passed/score/noRecord/preparing/failed/confirming/shareUnavailable/save/textShare/retry/saveHint/shareClosed` を15言語に追加した。翻訳の文章量に合わせたレイアウトはClaude側で確認する。

## 結果の描画口

`App` の追加オプションは `resultCardPorts`。オブジェクト、または `({result,host,scope}) => ports` の関数を渡せる。関数なら、結果画面の再作成時に現在のhostを使える。

```js
const ports = {
  createCanvas,                 // 1200×630のCanvasを作る。省略時はdocument.createElement
  createRenderer, destroyRenderer, // 同時1個の所有者を経由して作成・解放
  createResultPortrait,         // async ({hero,signal,rendererLease}) -> {image,dispose}
  drawResultCard,               // (canvas,{model,portrait,locale})。画面/PNG共通
  encodePng,                    // async (canvas,{signal}) -> image/png Blob。省略可能
  getLayoutKey,                 // レイアウトの識別値。省略時は画面幅/高さ
  onChange,                     // snapshotを受けて表示を更新
  mount,                        // ({host,controller,scope,onTextShare}) -> {dispose}。任意
  panels,                       // E075/E090の定義を初回登録する配列
};
```

撮影後の主人公画像は691,200B以下。`image` は描画器の破棄後も使える切り抜き画像にする。撮影中に `signal` または `rendererLease.signal` が中断されたら撮影を止める。描画器を独自に新規作成せず、渡されたleaseを使う。失敗は例外を返し、主人公の無いFileを作らない。

controllerは `snapshot()/refresh({locale,layoutKey})/retry()/share()/dispose()` と、保存用の `getImageUrl()/revokeImageUrl()` を公開する。snapshotは `{model,miniature,state,prepared,revision}`。`state` はpending/ready/sharing/unavailable/failed。`getImageUrl()` は明示した保存操作から呼び、一時URLは一つだけ再利用する。保存画面を閉じる時はrevokeImageUrlを呼ぶ。

ネイティブ共有とURL管理の代用品は試験専用。実画面のボタンから `share()` を直接呼び、タップ後に画像生成を待たない。画像生成は標準で600msの得点表示の後に始まる。試験・既に表示済みの場面向けに `waitForPresentation({signal})` で待ち方を渡せる。待機中でも主成績と再プレイは使える。

Appの既存結果共有ボタンも、描画口を接続した後は同じcontrollerのshareへ流れる。「本文でXを開く」はmountへ渡す `onTextShare()` から明示操作で呼ぶ。主ボタンへ本文共有を重ねて接続しない。

同得点でも確認状態が変わればFileが無効になる。言語だけが変わる場合は主人公を撮り直さない。`App` はこの更新をverifiedScoreの早期returnより前に通知する。任意パネルはmountResultPanelsの初回panelsへ入れ、後付けaddPanelで開いたパネルを失わないようにする。

E090は `result.resultRendererOwner.acquire('model',{signal,onRevoke})` で描画器を借り、閉じる時にlease.releaseする。カード撮影が必要になると優先して解放されるので、onRevokeでパネル側の表示を片付け、新しいmodelで再取得する。所有者と画像cacheはlastResultにあり、ホーム・本編・次の結果へ移る時にAppが解放する。

## ゲーム中の受け渡し

`stageFactory(container, options)` の `options.gameExtrasController` が処理側の入口。`App` が生成・イベント通知・解放を行う。舞台は既存の描画フレーム内で一度だけstepし、戻り値を描く。

```js
const extra = options.gameExtrasController.step({
  ...args.presentation,           // tはゲーム時計。args.tのsceneTではない
  drawable: canDrawCurrentScene,
  actorBusy: {hero: !!oldHeroReaction, police: !!oldPoliceReaction},
  placements: {railway,water,robot,bird,midpoint,policeSettled,existing},
});
// extra = {travelTongue,cameo,policeExtra,precisionBadge}
```

`existing` は既存小芝居の配置可否を番号で返す任意の辞書。例えば住人の窓が無い時は `{12:false}`。新4案は各配置がtrueの時だけ候補になる。出せない候補で回数を消費しない。

`args.presentation.evaluationSegments` は、Appが本編の実際の入力履歴から作る正の評価区間。閾値や500msを描画フレーム数で数え直さない。collectorは履歴を変更せず、1回最大1000入力を読み、再開時は現在の評価区間の直近500msを復元する。

舌はsnapshotのphase/phaseProgressとelapsedMsを使う。小芝居は取得済みのid/startedAt/elapsedMs/durationMsを使う。E056の `phase:'static'` は機体なしの旗。警察は `kind:'inquiry'|'footprints'`、精密札は `kind:'nearPerfect'`。精密札は既存ボーナス通知の一行へまとめ、独立した加点や効果音を発生させない。

既存の5フィールドの保存形式には追加警察演出の履歴が無いため、途中再開では新しい聞き込み/足跡を開始しない。新規プレイでは各1回、E034→E039の順。重複を避けるための保守的な扱いで、既存の似顔絵/双眼鏡の交互表示は変えない。

## Claude側で残っていること

V1のグラフの真値の点・番号、フィルム38px、画像証拠。V2の舌・ダイヤと姿勢・余白。V3の背景5案・警察2案・精密札の絵。V4の主カード・撮影・模型・回転パネル・画像保存画面。この順序と受入条件はPR #22の計画に従う。

3寸法の画像、比較面の画素、描画呼出/形/画像/16MiBの測定は実際の描画後に行う。iPhoneのX添付・長押し保存・音・性能は実機確認として別に残す。処理の単体試験やAPIの代用品を、これらの合格に置き換えない。
