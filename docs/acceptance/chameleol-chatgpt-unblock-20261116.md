# PR #26：Claudeの実装開始に必要なChatGPT対応

2026-11-16。基準はPR #26の`90473ee5c4367d784c8a4579e302b37a652964ab`（CG02準備とCL01設計票を含む）。本書は[全体計画](../superpowers/plans/2026-11-16-chameleol-master-plan.md)のIF01〜11 **v1.2**を具体化する。要件と担当は維持し、翻訳の実施時期だけ本人の追加指示に従って後ろへ移す。

## 今回完了させる範囲

| 項目 | ChatGPTの対応 | Claudeが使うもの |
| --- | --- | --- |
| N01 / Q01：画面カードの主人公画像 | controllerのsnapshotへ`portraitImage`を追加。PNGの描画に渡した画像を借用できる。別画像・canvas・描画器は増やさない | `snapshot.portraitImage`。`result.resultPortrait`の内部を直接読まない |
| N03 / Q03 / Q04：精密札の表示条件 | Appはガイド・警告・警察1人以上・`session.meta.effects===false`で通知用`precisionBadge`をnullにする。警察中は既存の警告優先を維持 | 渡された有効な札だけを既存通知行へ描く。抑止した分の再取得・期限延長はしない |
| Q05：画面回転と共有画像 | Appが画面幅・高さと`ports.getLayoutKey()`の値を合成。変化時に旧File/保存URLを直ちに無効化しPNGを準備し直す | `getLayoutKey()`は`'card-1200x630-v1'`等、描画構図の版だけでよい。画面寸法を隠す上書きにはならない |
| Q06：結果画面の操作配置 | 既存の`.result-actions`と中のボタンを、同じノードのままmountが配置し直す方式を認める。Appの既存ボタン処理を維持 | ノードを移動し、複製・置換・既存ボタンへの二重click登録をしない。追加の保存/本文/再作成ボタンはmountが所有しscopeで解除 |
| N02 / Q02：翻訳 | **両者の実装完了後にChatGPTが15言語をまとめて対応する。今回は辞書を変更しない** | キーと仮表示の対応をCL01 §3.12へ記録。既存キー、英語の控え、札の`◎ 98%`で明示接続の開発・検査を進める |

## IF03 / IF06：画像を借りる契約

```js
const snapshot = controller.snapshot();
// snapshot = {model, miniature, state, prepared, revision, portraitImage}
if (snapshot.portraitImage) {
  drawResultCard(screenCanvas, {
    model: snapshot.model,
    portrait: snapshot.portraitImage,
    locale: snapshot.model.locale,
  });
}
```

`portraitImage`は現在の`model.hero`と署名が一致する画像、またはnull。撮影前、別の主人公への更新待ち、controllerのdispose後はnull。`onChange`のsnapshotにも同じ項目がある。画面側は画像を変更・disposeせず、次の通知で現在の値を読み直す。言語/画面寸法/確認状態だけの更新では同じ主人公画像を再利用する。画像の最終解放は既存の`releaseResultCardResources`が所有する。

初回onChangeがmountより先である順序、mountでの初回snapshot読取、開いたE075/E090の追従、撮影優先のrenderer leaseは従来どおり。画面用canvasはCL01の合算16MiBに含める。借用した画像を二重計上・二重所有しない。

## IF02 / IF05：表示を止めても処理を二重にしない

extended96ではWebGL・簡易DOM・演出オフのいずれも舞台内でstepを1フレーム1回。簡易DOMと演出オフは`drawable:false`・配置不可とし、評価区間と一度だけの取得処理は続ける。**簡易DOMであるだけでは札を抑止しない**。演出オフならAppが通知値をnullにする。ガイド・警告・警察中の抑止は開始時刻や取得済み状態を戻さず、警告が終わっても元の1400ms内だけ有効である。

通常起動はlegacy80、catalogは80/20のまま。Claudeは実App試験のwrapperだけextended96と実portsを明示する。通常接続、全16案の採用切替、検証入口と通常共有試験の切替はCL06受領後のCG03でまとめて行う。

## 翻訳を行う時期と完了条件

本人の追加指示により、CG03の接続実装とCL02〜CL06の実装が完了して文言が固まった後、CG05の前段でChatGPTが15辞書へ追加し、キー・変数・欠落・表示幅を確認する。CL01 §3.12の15キーは今回の予約一覧であり、実装で増減した文言を最後に再抽出する。Claudeは15辞書を編集せず、控えの文言・使用箇所を受渡し票へ記録する。CL05は仮表示で部品を検査できるが、15言語全体の合格とは記載しない。翻訳と15言語の再検査が終わるまでG5合格・本番公開にしない。

## 残る見た目の確認（Q07〜Q11）

Q07は配置開始時の画面内8pxと比較面の保護を守り、世界の絵がスクロールで出入りすること自体は許す。置けない場合の非表示は契約どおりで、表示回数を増やす再抽選はしない。Q08の警察の足元との重なり、Q09の振り向き中の舌、Q11の結果写真の位置はCL工程の3寸法画像で確認し、寸法の見積だけで合格にしない。Q10のアトラスの並べ直し/再生成はClaudeが既存画素と資源上限を測って選ぶ。未測定の不具合を仮定して発生条件を追加しない。提出後に不具合が分かった場合の修正はChatGPTが担当する。

## 検証記録

開始時の`npm test`は574件中543成功・失敗0、既存のSQL専用31件skip。追加した6試験を含む対象20件で、未対応の画像口・画面回転時の旧File・演出オフ/警察中の札について5件の失敗を確認し、製品修正後20/20成功・skip0。簡易DOM相当の`drawable:false`でも札を渡せること、画像の借用/解放、同じ構図での回転、構図版変更、画面離脱後のresize購読解除、ゲーム状態/履歴不変を含む。

最終`npm test`は580件中549成功・失敗0、既存SQL専用31件skip。build102ファイル、相対リンク32件、空白検査も成功。別文脈のCG-RレビューはCritical/Importantなし、対象20試験を独立に成功。設計票の古い契約版参照1件も修正済み。最終CIは[共通受渡し票](chameleol-handoff-ledger.md)から案内するPR本文で最新headと照合する。

## 次の担当

Claudeは本補足を含むPR #26の最新headからCL02〜CL06の予定された描画を進める。ChatGPTの製品変更は`src/app.js`と`src/presentation/result-card-controller.js`、対応試験だけで、Claudeのstage・street・bonus-view・結果ports・CSS・画像は編集しない。両者の実装後の翻訳、通常接続、全体検査、実機候補はChatGPT。PR後の失敗・レビュー修正・コンフリクトはファイルの元担当に関係なくChatGPTが直接解消する。
