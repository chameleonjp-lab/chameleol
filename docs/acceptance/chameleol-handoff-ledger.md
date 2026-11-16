# カメレオる：共有PR受渡し票

本票は2026-11-16のCG00→CG02先行実装を記録する。正本は[全体要件](../superpowers/specs/2026-11-16-chameleol-final-requirements.md)、[全体計画](../superpowers/plans/2026-11-16-chameleol-master-plan.md)の契約v1.2。過去の記録を初期化しない（本票は今回新規）。

## 共有ブランチ・現在地

| 項目 | 値 |
| --- | --- |
| 開始main | `52a6be5aed194baf55e3ba4d77d286b90bab72bd`（#25取込済み） |
| 開始時の開いているPR | 0件。#26は未使用（GitHub API 404を確認） |
| 作業ブランチ | `work/chatgpt-cg00-cg02-20261116` |
| 共有PR番号・URL | [#26（ドラフト）](https://github.com/chameleonjp-lab/chameleol/pull/26) |
| CG02準備commit／Claude開始点 | `7d551ed624cde7b61ff2ef33cf434945706b7919` |
| 今回のCG02補足の開始head | `90473ee5c4367d784c8a4579e302b37a652964ab`（CL01設計追加済み）。補足後は製品変更を含む。最新head/CIはPR本文とブランチ履歴を正とする |
| 現在の担当 | ChatGPT：CG02補足の製品/文書/試験を完了してCIを確認し、Claudeの予定されたCL02〜06へ引渡す。通常接続と翻訳は後続ChatGPT |
| 状態 | CG00/CG01/CG02とCL01不足へのCG02補足を実装。通常起動legacy80、catalog80/20を維持。過去の独立レビュー結果と今回の結果を区別して下記へ記録 |

## CG02補足：今回の引渡し

[対応範囲・確定回答・API例・翻訳の後送り](chameleol-chatgpt-unblock-20261116.md)を参照。N01/N03とQ01/Q03〜06を解消。N02/Q02は本人の指示で両者実装完了後のCG05前段へ移し、今は辞書を変更しない。CL01設計票・全体要件・3計画・コピー依頼文へ反映した。Claudeは最新headを取得し、この補足を共通baseへ含めてCL02〜CL06へ進める。

今回のChatGPT製品編集はsrc/app.js、src/presentation/result-card-controller.jsと対応試験。予定されたClaudeの描画/CSS/素材は編集していない。実装・試験は統括セッションが行い、最終独立レビューだけ別文脈を使う。モデルのホスト実測ができたとは記載しない。下のCG00〜CG02の実行体制とCIは先行準備時の履歴であり、今回の実績へ流用しない。

開始時npm testは543成功/失敗0・既存SQL専用31件skip。対象20試験で5件のREDを確認し、製品修正後20/20 GREEN・skip0。最終npm testは580件中549成功/失敗0・既存SQL専用31件skip。standalone buildは102ファイル成功、相対リンク32件/差分の空白検査も成功。

CG-Rの別文脈（gpt-6-astra/xhighを明示指定）で補足の全13ファイルを独立レビューし、Critical/Importantなし。対象20試験と空白検査も独立に成功。Minorの契約版参照1件は設計票6行目をv1.2へ統一して反映した。独立レビューが全体npm/buildを再実行したとは扱わない。最新headのGitHub CIはPR本文を正とし、開始だけを成功と記載しない。翻訳、Claudeの実描画、通常接続、全体合格、iPhone実機、公開は未完了である。

## 先行準備時の実行体制と書込ロック（履歴）

| 役割 | 要求model / effort | 実際の指定・確認可能性 | 今回の編集対象 |
| --- | --- | --- | --- |
| CG-O | gpt-6.1-sol / high | この会話の統括セッション。ホストは実model/effortの照合APIを提供しておらず、要求値を実測したとは記載しない | 3計画、受渡し票、依頼文、GitHub操作 |
| CG-S | gpt-6.1-sol / high | collaboration toolに明示指定して起動成功 | game-extras-controller等の処理、app.js、CG01互換試験 |
| CG-R | gpt-6-astra / xhigh | collaboration toolに明示指定して起動成功（独立した新規文脈） | 読取のみ、製品編集なし |
| CG-T | gpt-6.1-sol / high | collaboration toolに明示指定して起動成功 | CG02 UI試験、検証/CI。製品編集なし |

統括を含め最大4人。同じファイルの同時編集なし。外部の有料API・追加課金・Codex Cloud実装ジョブは起動していない。専用clone/専用ブランチで作業し、mainへの書込なし。

## CG00：基準確認（F01〜F14）

- 指定4資料を全文確認。#23のC0〜C4はmainに存在し再実装しない。規則v1〜v4、署名summary、DB_VERSION=1、未送信結果の形式は変更しない。
- 描画ports/舌/街5案/警察/札の描画、実機、公開は未完了。今回の対象外であり、試験用代用品を製品画面へ入れない。
- 既存CIはchecks（単体/SQL/QuickJS）＋browser 1〜4＋必須test/standalone build。workflowを変更・弱体化しない。
- 初回`npm test`は依存欠損とsandboxの`spawnSync git EPERM`で65/72、7失敗。製品不具合の再現とは扱わない。依存を整え、追加試験を除いた既存追跡済みファイルで再確認：561件中530成功・失敗0・SQL専用31件skip（15.0秒、Node v24.22.1）。SQLはPRのNode22/PostgreSQL16のCIで別途検証する。

## CG01：互換調整（F01/F03〜F06/F12、IF02/09）

- 旧directorの条件を一項目ずつ照合。`game-extras-controller.js`へ優先/地区/自己ベスト/遅い間隔の開始抑止・取消を集約し、`cameo-reservations.js`は同一grace内の棟変更で二重抽選しない。抽選器は追加しない。
- 新規互換試験は旧描画器とも同じ入力で照合。最初の6件で欠落をRED確認、境界を追加して9件中7失敗を確認後、9/9 GREEN。既存のcontroller/cameo/評価区間/警察/札の対象試験24/24 GREEN。
- APIは全体計画IF09のまま。frameIntervalMsの無効値/初回/停止/非表示、29/30連続、999/1000、bestDistanceの0〜50/欠損/不正、優先イベントのちょうど期限を確認。

## CG02：Appの先行準備（F07〜F12、IF01/03/04/05/06/07/10）

- ports取得直後、controllerの最初のonChange/mountより先に既存`createResultRendererOwner`を準備する。初期表示の600ms待機中にもmodel leaseを取得でき、後のportrait優先で解放される。所有者自体の再実装は不要だった。
- 舞台更新の後に`gameExtrasController.snapshot().precisionBadge`を既存`bonusPresentation.tick({precisionBadge,...})`へ渡す。新しいstep/時計/閾値/加点/効果音は追加しない。旧bonus描画は追加引数を無視し、実描画口はCL04で追加する。
- Appの舞台optionは`presentationSet:'legacy80'`。controllerの存在だけでは新機能を有効にしない。試験専用wrapperはextended96で実controllerをstepし、batchのないeval中のt=2000〜3400の札と期限切れを確認。簡易DOMのstep実装はCL03の対象。
- CG02 RED：owner欠損/札未転送/legacy80明示不足の3件。GREEN：result owner/controller、関連UIを含む39/39、skip0。synthetic instantSuccessの実App→controllerイベント1回を未修正コピーでRED確認後にGREEN。ゲームstate/history/saveSeqの不変も検査。
- 統括の横断対象試験：controller/cameo/評価/警察/札/result owner/controller/UIの57/57、skip0（レビューの補強試験とinstantSuccessを含む最終確認）。`git diff --check`成功。代用品は試験内のみで、製品へ仮描画を組み込んでいない。

対象検証の例：

```sh
node --test tests/presentation/game-extras-compat.test.mjs tests/presentation/game-extras-controller.test.mjs tests/presentation/cameo-reservations.test.mjs tests/presentation/evaluation-segments.test.mjs tests/presentation/police-extras.test.mjs tests/presentation/precision-badge.test.mjs tests/presentation/result-card-controller.test.mjs tests/presentation/result-renderer-owner.test.mjs tests/ui/game-extras-app.test.mjs tests/ui/result-card-app.test.mjs tests/ui/bonus-app.test.mjs tests/ui/extras-port.test.mjs
```

この環境では子プロセス試験にnetwork許可付きsandboxを使用。コードの制約・試験期待値は緩和していない。

## CG-R独立レビュー

`gpt-6-astra / xhigh`を明示指定した別文脈で4資料・全差分を読取確認。製品P0〜P2指摘なし、独立対象試験34/34、差分の空白検査成功。P3は試験の2点（23棟目の800ms境界が中間予約に隠れる、自己ベスト通過とgraceが同時のclaim前抑止）を指摘。対象試験を補強し、全横断対象57/57・skip0を確認した。実描画・資源・4組CI・iPhoneはこの単体試験から合格扱いにしない。

## 判断記録

- IF01/05: Appは舞台の既定オプションに`presentationSet:'legacy80'`を渡す。明示試験はstageFactory wrapperが`extended96`を指定。札の橋渡しは舞台更新後のcontroller.snapshot()の読取だけで、新たなstepを呼ばない。legacy80舞台はstepしないため札はnull。新しいApp modeオプションや舞台のmode getterは追加しない。
- 自己ベスト通過の抑止は保存claim前に行う。旧描画器は同フレームで抽選後に表示を消していたが、新処理では未表示の回数を消費しない（表示抑止と600ms境界は維持）。
- CG01→CG02→CL02〜05は同じ契約v1.1と準備commitを使う。先行PR後も予定されたCL機能追加の担当は維持する。失敗修正だけ対象ファイルをChatGPTへ一時移管する。

## 共有PRのCI

対象製品commit：`7d551ed624cde7b61ff2ef33cf434945706b7919`。
[CI run 43783681349](https://github.com/chameleonjp-lab/chameleol/actions/runs/43783681349)。

- checks成功：`npm test` 574件中543成功・失敗0・SQL専用31 skip。別工程`npm run test:sql`は32/32成功・skip0で、ローカル未実行のSQL項目も検証。QuickJSは16照合成功。
- ブラウザ1/4＝27/27、2/4＝30/30、3/4＝136/136、4/4＝16/16、計209/209成功・skip0。最終testは全4組の成功を確認し、standalone build/成果物保存まで成功。6ジョブすべてsuccessを確認した。
- workflowの変更・手動の全件追加実行は行わず、PR既存の4組並行CIを確認する。受渡し文書だけの後続commitにも既存CIが自動で走るため、その最新headも完了まで確認し、PR本文に最新head/CI結果を追記する（本票は製品commitの成功を記録）。

製品commitのCI成果物：`chameleol-standalone-6e2e8df6bde3b59c84009a3793df53be8a201d08`、[artifact 14188923848](https://github.com/chameleonjp-lab/chameleol/actions/runs/43783681349/artifacts/14188923848)。CIのcheckoutはPR merge ref `6e2e8df6bde3b59c84009a3793df53be8a201d08`、assetVersionは`0.1.0-3024f33aeb`。これはレビュー用ビルドであり、配布/公開済みではない。head SHAとmerge refを混同しない。

## 提出・同じPRへの受渡し

- 2026-11-16 01:00 UTC、ChatGPTがドラフトPR #26を作成。準備commitは`7d551ed624cde7b61ff2ef33cf434945706b7919`。これは最新の製品変更commitであり、後続の本票/依頼文の文書commitでも保持する。文書を含む最新headは[共有ブランチ](https://github.com/chameleonjp-lab/chameleol/commits/work/chatgpt-cg00-cg02-20261116)で照合できる。
- コピー用[Claude依頼文](../prompts/2026-11-16-claude-shared-pr26-handoff.md)を作成。**Claudeへ実送信していない。** 新規PRは作らず、この同じブランチの最新head（準備commitを含む）へ追加する。
- ChatGPTは製品ファイルへの書込を止め、予定されたCL-A/B/Cの範囲を解放する。この段階ではCIと文書だけChatGPTが所有していた。今回のCG02補足は上記のとおりApp/controllerをChatGPTが変更したため、Claudeは補足を含む最新head/開始点とロックを確認して着手する。CI等の修正が必要になれば、対象ファイルだけChatGPTへ一時移管して直接修正する。
- 受入対象はCG00〜CG02の接続準備。CL02〜CL05の実描画・実App検査、G2全体の部品受入はまだ完了していない。全体統合までドラフトを維持する。

呼出例（描画はClaudeが実装する）：

```js
// IF04: ports取得後、controller/mount前にAppが所有者を準備済み。
const lease = await result.resultRendererOwner.acquire('model', {signal, onRevoke});
// CL-Aは取消/閉鎖時にlease.release()、撮影優先時は現在modelで再取得。
// IF05: stepの追加呼出なし。CL-Cはこの表示引数を消費する。
bonusPresentation.tick({precisionBadge: gameExtrasController.snapshot().precisionBadge, ...clockAndGuards});
```

入力はIF09の観測値と既存playView/event、出力は`{travelTongue,cameo,policeExtra,precisionBadge}`。所有者のexportは既存`createResultRendererOwner`、Appオプションは既存resultCardPorts/stageFactory。変更ファイルは3計画、本票、app.js、game-extras-controller.js、cameo-reservations.js、互換試験、UI2試験、依頼文。3寸法画像/画素/描画数/16MiBとiPhone測定は未実施で、CL工程/CG05/06へ残す。

## 未完了・次の担当

Claudeの予定されたCL00〜CL06（同じPR・同じブランチへの追加）、CG03以降の通常接続・96/4切替・統合・独立レビュー・全体検証、iPhoneのX添付/保存/音/性能、候補URL/版の照合、公開判断。全体合格・実機合格・公開済みを今回の先行実装から推定しない。
