# PR #26：ChatGPTの受入修正・検査強化の実装計画

> 2026-11-17追記：この文書は作成時点の履歴です。現在の実装・検査・担当・残件は[最新状況](../../acceptance/pr26/completion-task4/evidence.md)を参照してください。通常接続や翻訳の未完了、旧CI待ち、Claudeへの再開指示を現在の作業指示として扱わず、実装済み部分を作り直さないでください。

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Review this plan before implementation, then request a fresh whole-change review.

**Goal:** 提出済みCL03/CL04のうち、既存契約を変えずに直せる不具合と検査の欠落を解消し、Claudeの残工程へ渡す。

**Architecture:** 通常起動はlegacy80、試験用wrapperだけextended96を維持する。Appの検証入口・提出済み描画の小さな修正と、実舞台→実controller→実描画を通す試験を追加する。抽選・時計・採点を描画側へ増やさない。

**Tech Stack:** Node.js >=20、Three.js 0.170.0、既存node:test／Playwright。必須依存を追加しない。

**Spec:** [全体要件](../specs/2026-11-16-chameleol-final-requirements.md)、[全体計画](2026-11-16-chameleol-master-plan.md)、[ChatGPT計画](2026-11-16-chameleol-chatgpt-plan.md)。今回の受入指摘は[CL-R第4版](../../reviews/2026-11-17-chameleol-cl03-cl04-presubmit-review.md)。

## 基準と担当

開始head：`ffa16869302ccc121f8b5372ad27b7dc21e26fae`。main：`52a6be5aed194baf55e3ba4d77d286b90bab72bd`。
共有PR [#26](https://github.com/chameleonjp-lab/chameleol/pull/26)、共有ブランチ `work/chatgpt-cg00-cg02-20261116`。
F14に従い、提出済みの不具合は表示ファイルもChatGPTが直接修正する。今回の編集対象はこの計画の表に限定して受渡し票へ記録し、push前に共有headを再取得する。

## 全体の制約

- 規則v1〜v4、DB_VERSION=1、署名summary・履歴・未送信結果・得点・識別値を変えない。
- 通常起動legacy80／catalog80採用20除外を維持。CG03の96/4切替はCL05/CL06の受領とG2を満たしてから行う。
- 翻訳は双方の実装後にChatGPTがまとめて行う。今回15辞書を編集せず、精密札は合意済みの数字の仮表示「◎ 98%」を使う。
- 上限は胴＋4px、壁遮蔽1.5%、端8px、追加描画12呼出・16形・4画像、静的装飾24・環境粒子8・小芝居3枚。合否の値を緩めない。
- mainへpush、代理マージ、公開、本番DB操作、追加課金、Codex Cloudジョブは行わない。

## 現状と対応の判断

| 指摘・工程 | 今回の対応 | 完了の証拠 |
| --- | --- | --- |
| CI：未定義キー `presentation.nearPerfect` | 数字の仮表示へ戻し、翻訳を前倒しせず辞書整合性を回復 | 既存辞書検査の失敗→成功、札の表示試験 |
| H01：検証入口の100ms×31回の予熱 | 3秒の予熱を16ms以下で進め、終点は元の時刻と一致 | Appの実controllerがslow抑止へ入らず、得点・履歴が不変 |
| R01/R02：実controller接続と空振り試験 | overrideなし・実placements・16ms・保存claimの完了を待って検査 | 実E020の取得前0／取得後描画、2案以上、非提供時の描画0 |
| R03：固定50ms待機 | 札のsnapshotが来た状態を待つ | 簡易DOMの札・解放試験 |
| R05：配置表と静止旗の証拠 | grace最初のフレームの可否を記録。部品単独の合成絵と実接続の証拠を分ける | 3寸法×49棟の可否表、静止旗が実際に描かれたassert付き画像 |
| R06：縦画面で中間旗が間に合わない | 既存枠125000〜126500ms内で着地点を前方へ調整。自己ベスト旗と画面で6px以上を確認 | 3寸法でoverrideなしのdelivery→static、開始時刻・描画枚数・画素保護 |
| R08：水と街灯が重なる | 水源と渦を同じ路地の柱からずらし、隙間内2pxと画素保護を維持 | 純粋pose試験、実舞台の位置・3寸法画像・比較面不一致0 |
| R09：道路の帯と足元の箱 | 既存実装の−10pxと設計6pxの差を明記。F12合格への読み替えはしない | 記録と画像。今回この値を変更しない |
| R10：旧最大＋舌の予算 | 旧最大と同じ既存prop群を確保し、舌がholdの同じフレームで計測 | 実描画増分<=12/16/4、各表示の非空assert |
| R07/Q07：鳥の可視率、R11/Q09：舌と胴 | 条件・保護値の変更を独断で採用しない。現在の不足と選択肢を申し送りへ明記 | 未解決として残す。通常接続/G2/G5を合格にしない |
| CL05/CL06→CG03→翻訳 | 担当を維持し、前提が揃うまで開始しない | 残作業・書込範囲・開始条件をClaude用依頼文へ記載 |

開始時 `npm test`：712件中680成功・1失敗・SQL専用31skip。失敗は未定義翻訳キー検査1件。
手元のChromiumは既存のsocket制限で起動不可。試験を弱めず、製品変更後の既存4組並行CIでブラウザを検証する。実行できない画像測定を測定済みとしない。

## レビューで特に確かめる条件

1. 遅延した保存claimを待つ間に新たな機会を作らず、実際に出た演出を試験がassertしていること。
2. 配置はgrace最初のフレームと1500ms後を混同せず、警察・主人公の既存反応との重なりを再現すること。
3. 25棟の自己ベスト旗と中間旗、3寸法、予約開始と126500msの境界を扱うこと。
4. 試験で力ずくに出した合成の絵を実プレイの可視率へ数えず、非表示も記録すること。
5. 保護条件や資源上限を下げる変更、翻訳の前倒し、共有headの上書きが無いこと。

## Task 1：辞書検査と検証入口を修正

**Files:** `src/presentation/bonus-view.js`、`src/app.js`、`tests/presentation/bonus-badge.test.mjs`、`tests/ui/game-extras-app.test.mjs`。H01は本物の`createExtendedStepper`でframeIntervalMsを作り、同じ本物controllerへ渡す。

**Interfaces:** `mountBonusPresentation({host,scope,t,reducedMotion})`、`App.debugPresentation({effectId})`を維持。検証入口のstage.updateは表示用入力のみでsessionへapplyしない。

- [x] 既存辞書検査のREDを記録し、未定義キーを呼ばず「◎ 98%」を表示する試験へ更新する。
- [x] 検証入口の予熱を実createExtendedStepperへ通し、後続の描画可能な評価→grace（lastEvalSuccess:false・実配置可）で同じ実controllerが新しい演出を始め、sessionのstate/history/saveSeqが変わらない試験を追加しREDを確認する。
- [x] 数字の仮表示と16ms刻み・終点一致の予熱を最小修正する。
- [x] `node --test tests/i18n/messages.test.mjs tests/presentation/bonus-badge.test.mjs tests/ui/game-extras-app.test.mjs`で失敗0を確認する。
- [x] 対応結果を記録してcommitする。

## Task 2：実舞台の接続試験と待機を直す

**Files:** `tests/e2e/extended-stage.e2e.mjs`、`tests/e2e/travel-tongue.e2e.mjs`、`tests/e2e/renderer-peak-followup.e2e.mjs`、`tests/presentation/atlas-capture.mjs`とその単体試験。

**Interfaces:** `createStage(...,{presentationSet:'extended96',gameExtrasController})`、controllerの`step`と`extrasPort.initialState`、`presentationStats()`。観測ラッパーは入力・戻り値を変更しない。

- [x] E020を最初の機会で選ぶ保存用乱数状態を決定し、実placements→claim前0→claim後のE020描画をassertする試験を追加する。
- [x] 既存null cameo試験へ`offered.length>=2`・`shownWithOffer>0`・提供中に実visibleArtworkが非空を先に加えて失敗を確認する。
- [x] 16ms刻みとclaim Promiseの完了を使い、1フレーム1step・非提供時描画0を維持して成功させる。
- [x] 固定50msをsnapshotの状態待ちへ変更する。
- [x] 旧最大propの各表示が非空であることと舌holdの同時状態をassertし、12/16/4以内を実計測する。
- [x] 対象ブラウザ試験をCIで確認する。部品描画のoverrideは残しても、実接続の証拠と明確に区別する。

## Task 3：旗と水の提出済み描画を修正

**Files:** `src/presentation/street-accents.js`、`tests/presentation/street-extras.test.mjs`、`tests/e2e/extended-stage.e2e.mjs`。

**Interfaces:** `storyPoses(id,elapsedMs,{building,fx,...})`、`accents.placements(view,frameInfo)`と描画の位置を一致させる。旗の時計・保存形式・当選条件は変更しない。

- [x] 実舞台相当のカメラで125600〜126500msに3寸法とも旗が置ける試験、bestDistance=25との6px分離、隙間内の水源・渦の試験を先に作りREDを確認する。
- [x] 旗の着地点を前方へ寄せ、水源と渦を街灯の柱からずらす。実測で決めた値と理由を記録する。
- [x] overrideなしで3寸法delivery→staticをassertし、静止旗の撮影時に`staticFlag===true`に加え、舞台を進めず実midFlagインスタンスだけを隠して再描画した画素差の非空（10画素以上）と、その外接矩形がcanvasの8px内側に収まることを必須にする。統計値だけで画面内を推定しない。
- [x] 49棟のgrace最初のフレームの配置走査、壁/胴不一致0、壁遮蔽<=1.5%を確認する。水が開始できない寸法の画像は部品例と表示する。
- [x] 対象単体とブラウザを確認し、測定表・画像を更新する。

## Task 4：全体確認・申し送り

**Files:** `.github/workflows/ci.yml`（4組の分割・試験・合否を維持し、CL03_SCREENSHOTSと画像/測定artifactの保存のみ追加）、`docs/acceptance/pr26/chatgpt-followup/`の測定と画像、`docs/acceptance/pr26/cl04/measurements.md`（旧表の条件を訂正）、本計画、`docs/reviews/2026-11-17-chameleol-chatgpt-followup-review.md`、`docs/acceptance/chameleol-handoff-ledger.md`、`docs/acceptance/pr26/integration-checklist.md`、`docs/prompts/2026-11-17-claude-pr26-after-chatgpt.md`。

**Interfaces:** 既存F/IF/G番号とR/H/Q番号を保持。修正済み・未解決・未実行・実機の状態を分ける。

- [x] 最終差分の独立レビューを受け、重要な指摘は再現試験を先に作って修正する。
- [x] 最後の製品変更後に`npm test`、`npm run build`、`git diff --check`を実行する。
- [x] 共有headを再確認して同じPRへ通常pushする。履歴の強制上書きをしない。そのSHAの既存4組並行CIを完了まで確認し、失敗はChatGPTが直す。画像/測定artifactを回収して目視し、記録更新後の最終SHAもCI確認する。
- [x] Claude用の申し送りとコピー用依頼文を作る。済んだCL03/04を作り直さず、未解決条件とCL05/06の必要な証拠、CG03/翻訳の開始条件を明記する。
- [x] 最終結果と残る条件を本人へ短く報告し、コピー可能な本文とファイルを渡す。

## 実装前の敵対的検証と反映

別文脈のCG-R（gpt-6-astra/xhighを指定）で計画と正本/実コードを照合。Critical0/Important3/Minor3。ImportantはCIの画像回収不足、H01代用舞台のframeIntervalMs欠落、staticFlag統計だけでは画面内を証明できない点。Minorは実描画の非空assert、storyPoses署名、pushとCI確認の順序。上記Task 1〜4へ全6件を反映してから実装する。

## 実施完了の範囲

Task 1〜4の今回対象を実装・検証し、独立レビュー指摘を反映。製品基準455c149のCI #80は全6ジョブ成功。画像9枚と測定JSON7件を保存し、[測定票](../../acceptance/pr26/chatgpt-followup/measurements.md)と[申し送り](../../prompts/2026-11-17-claude-pr26-after-chatgpt.md)を作成した。文書反映後の最新CIはPR本文で確認する。本計画の完了はR07/R11の解決、CL05/06、CG03、15言語、G2/G5、実機、マージ/公開の完了を意味しない。
