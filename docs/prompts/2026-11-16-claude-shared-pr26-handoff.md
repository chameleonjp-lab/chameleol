# Claude依頼文：既存PR #26の同じブランチへCL工程を追加

以下をコピーしてClaudeへ渡す。ChatGPTからClaudeへの実送信は行っていない。

```text
対象リポジトリ：https://github.com/chameleonjp-lab/chameleol
既存共有ドラフトPR：https://github.com/chameleonjp-lab/chameleol/pull/26
作業ブランチ：work/chatgpt-cg00-cg02-20261116
CG02準備commit／開始点：7d551ed624cde7b61ff2ef33cf434945706b7919
契約：全体計画IF01〜IF11 v1.2（CG02補足を含む最新headから開始）

新しいPRを作らず、上記PRの同じ作業ブランチへ、計画どおりCL00〜CL06の描画・画面を追加してください。最新のリモートheadを取得し、開始点の準備commitを含むことを確認してから着手してください。後続の受渡し文書commitも保持し、準備commitへ巻き戻したりforce pushしたりしないでください。全体統合までドラフトを維持し、mainへ直接push・代理マージしないでください。

最初に最新main、PR #26、受渡し票を確認し、以下4資料を全文読んでください。
1. docs/superpowers/specs/2026-11-16-chameleol-final-requirements.md
2. docs/superpowers/plans/2026-11-16-chameleol-master-plan.md
3. docs/superpowers/plans/2026-11-16-chameleol-chatgpt-plan.md
4. docs/superpowers/plans/2026-11-16-chameleol-claude-plan.md
共通受渡し票：docs/acceptance/chameleol-handoff-ledger.md
今回の追加回答（必読）：docs/acceptance/chameleol-chatgpt-unblock-20261116.md
CL02受入修正（再開前に読む）：docs/reviews/2026-11-17-chameleol-cl02-acceptance-review.md
統合検査表：docs/acceptance/pr26/integration-checklist.md
結果画面の追加3対応（今回の最新修正）：docs/reviews/2026-11-17-chameleol-result-followup-checks.md
保存画面の背景操作/scrollの抑止と復元、PNG失敗時の生成面解放、異常時/反復の追加検査も含む最新headを取得し、古い作業コピーで上書きしないでください。
#23の既存処理のAPI：docs/prompts/2026-11-15-claude-pr23-handoff.md

役割・要件・工程ID・ファイル分担は計画から変更しません。CL-O/CL-D/CL-A/B/C/CL-R/T/Wの指定modelとeffortを使い、実際に設定できた値を記録してください。全体統括を含め同時4人以内、同じファイルを同時編集しないでください。追加課金やCodex Cloud実装ジョブは起動しないでください。

ChatGPTのCG00〜CG02は準備済みです。C0〜C4、旧抑止の互換調整、Appのowner先行準備、精密札snapshot→bonus tickの橋渡しは再実装しないでください。CG02の試験用renderer/stageを製品の完成描画へ流用しないでください。

CL01設計票とCL02の結果画面（7242c64）は追加済みです。その後ChatGPTが独立レビューとPR後修正を行ったので、修正を含む最新headを取得し、古いCL-A作業コピーで結果ファイルを上書きしないでください。CG02補足のN01〜03/Q01〜06回答とCL02受入記録を読み、CL02を作り直さず、CL03（B：舌/street/stage）、CL04（C：街/警察/札）、CL05（実App明示接続/提出前検査）、CL06の受渡しを予定どおり進めてください。App・規則・保存・通信・共有制御・15辞書・catalog採否はClaudeの予定された製品編集対象にしません。stage/streetはB、presentation.cssはAが所有します。

特に次の接続契約を使ってください。
- AppはpresentationSet:'legacy80'を渡しています。通常起動legacy80とcatalog80/20を維持します。実App試験のstageFactory wrapperだけextended96を明示し、controllerの存在だけで新経路を有効化しないでください。
- extended96の舞台内でgameExtrasController.stepを1フレーム1回だけ呼びます。tはargs.presentation.t、prefers-reduced-motion現在値を毎回booleanで渡し、frameIntervalMs/bestDistance/placements/actorBusyをIF02/09のとおり渡してください。旧directorとの二重抽選・cameo:nullから旧描画へのfallbackは禁止です。DOM簡易舞台もdrawable:false・配置不可でstepを1回呼び、評価区間/札を落とさないでください。
- IF09の抑止はcontrollerへ集約済みです。初回/停止/非表示/不正間隔は0、50<ms<1000の30連続で新規背景を無効化、地区800ms・自己ベスト600ms・優先イベント450/600/800msを再判定しないでください。Appはsessionイベントと生成instantSuccessをcontrollerへ既に渡すため、舞台のpresentationEventからcontrollerへ重ねて転送しないでください。
- result-card-ports.jsのcreateResultCardPorts({result,host,scope})を提供してください。ports取得後、controller/mountより前にAppがresult.resultRendererOwnerを用意します。factory実行中のacquireは前提にせず、mount/初回onChange以降に借りてください。最初600msにもE090を開け、撮影優先で解放/現在modelで再取得してください。
- 初回onChangeはmountより先なのでlatestを保持し、mountでcontroller.snapshot()を読みます。画面の主人公はsnapshot.portraitImageから借用し、PNGと同じ画像を使い、内部result.resultPortraitを直接読まず、変更/解放しないでください。getLayoutKeyは構図の版を返せばよく、Appが画面幅/高さを合成して回転時の旧Fileを即無効にします。.result-actionsの既存ノードは移動だけにし、複製や既存ボタンへの二重click登録をしないでください。開いているE075/E090はmodel/miniature訂正・言語変更にも追従し、パネルは初回登録、同時1つです。
- 舞台更新後のsnapshot().precisionBadgeは既存bonus tickへ転送済みです。CL04はtickのprecisionBadge表示引数だけ消費し、batch無しevalでも有効札を既存通知1行へ点数無しで表示し、guide/warningでは抑止してください。警察1人以上も既存の警告優先で抑止し、演出オフはAppがnullを渡します。簡易DOMでも演出が有効なら札は表示できます。show(batch)で札を消さず、98%/500ms/期限の新時計・加点・音を作らないでください。
- 主カードとPNGを同じ描画元へ接続し、タップ直後share、明示保存/本文/再作成、取消・欠損・pending・旧版・資源上限を守ってください。

翻訳は本人の追加指示により、ChatGPTとClaude双方の実装完了後にChatGPTがまとめて行います。今回は15辞書を編集せず、設計票§3.12の既存キー/英語の控え/◎ 98%で進め、キー・使用箇所・控えを受渡し票に残してください。新文言の翻訳完了をCL02〜CL06の開始条件にせず、翻訳前を15言語合格にしないでください。

対象試験・3寸法・既存15言語の配置・画素/描画/資源測定とCL-Rの提出前レビューを行い、未確認を合格扱いにしないでください。工程途中は対象試験に絞り、最後の製品変更後の既存4組並行CIはChatGPTが完了を確認します。iPhoneのX添付・保存・音・性能を自動ブラウザ結果で代用しないでください。

このPRはChatGPT先行で既に開かれていますが、予定されたCL機能追加の担当は上記のままです。一方、PR後のCI失敗・不具合・レビュー修正・コンフリクト解消はChatGPTの責任で、表示ファイルもChatGPTが直接直します。修正対象だけChatGPTへ一時移管して書込を止め、同時編集を避けてください。修正と予定された追加実装を混同しないでください。

CL06では新規PRを作らず、同じPRへcommitを追加し、docs/acceptance/chameleol-handoff-ledger.mdへ最新head・担当/ロック・変更ファイル・F/IF・export/呼出例・試験/画像/測定・未完了を記録してください。書込停止を宣言してPR URL/headをChatGPTへ渡してください。以後はChatGPTが同じPRでCG03以降の通常接続・独立レビュー・全体検証・修正を行います。記録初期化、本番DB変更、無断公開は行わないでください。
```
