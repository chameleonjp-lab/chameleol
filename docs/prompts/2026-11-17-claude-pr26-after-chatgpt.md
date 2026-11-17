# Claudeへの申し送りと、そのまま貼れる再開依頼文

2026-11-17（日本時間）。本人の依頼でChatGPTが作成。Claudeへ実送信はしていない。

## 申し送り

PR [#26](https://github.com/chameleonjp-lab/chameleol/pull/26)の共有ブランチは`work/chatgpt-cg00-cg02-20261116`。
ChatGPTの今回の製品修正・試験の基準は`455c1495a12fe2f7dda08b1f6f6e7925a8a9e569`。以後の検査・文書commitも含む最新headとCIはPR本文とブランチで確認する。古い`84eeb5c`やCL-B/CL-Cの作業コピーへ戻さない。

| 項目 | 今回の状態 |
| --- | --- |
| 計画→敵対的検証 | [計画](../superpowers/plans/2026-11-17-chameleol-chatgpt-pr26-followup-plan.md)。実装前の独立レビュー6件をすべて反映 |
| 精密札と検証入口 | 未定義翻訳キー参照を数字の仮表示へ戻す。検証用予熱を16ms以下へ変え、実controllerが遅いフレーム抑止へ入らないことを確認 |
| 提出済みの旗・水 | 旗の着地点x253、水を柱から離し、渦を歩道へ。予約・抽選・得点・保存は不変 |
| 試験 | 実placements→保存claim→E020、16msの複数cameo、最初grace49棟、3寸法の実中間旗と旗だけの画素差、旧最大＋舌の負荷、簡易DOMの状態待ちを追加/補強 |
| 検証状態 | 最新の単体/ブラウザ/画像/実機は[修正と検証記録](../reviews/2026-11-17-chameleol-chatgpt-followup-review.md)、[最新測定](../acceptance/pr26/chatgpt-followup/measurements.md)、PR本文を参照。自動ブラウザを実機合格へ読み替えない |
| 通常接続と翻訳 | legacy80・catalog80/20を維持。CG03、15言語、G5は未完了 |

今回ChatGPTが引き継いだ製品ファイルは`src/app.js`、`src/presentation/bonus-view.js`、`src/presentation/street-accents.js`。提出済みの不具合をF14に従って修正したもので、予定されたClaudeの担当全体を移す依頼ではない。新しい精密札の翻訳はまだ開始しない。

R01/R02/R03/R05/R06/R08/R10/H01の今回の対応と、R09の設計値との差は上の記録へまとめた。部品を強制表示した画像と、実controllerから始まった演出の画像を分けて扱う。

R07/Q07（鳥）とR11/Q09（舌と胴）は未解決。鳥の高さ56px→40px、重み変更・再抽選、警察1人で舌を止める、4px条件の免除、口元の例外を承認済みにしない。第一候補は、既存の条件・保護値を保つ見た目の再設計。比較案・実測・費用を整理できるが、契約を変えなければ解決できない場合は変更箇所と影響を明示する。G2/CG03/G5の合格を先取りしない。

---

## コピー用プロンプト

カメレオるPR #26のClaude側の作業を、下記の最新状態から再開してください。CL02や提出済みCL03/CL04を作り直す依頼ではありません。ChatGPTの修正を保持し、担当を変えず、残る見た目の判断資料とCL05/CL06を進めてください。

リポジトリ：https://github.com/chameleonjp-lab/chameleol
共有ドラフトPR：https://github.com/chameleonjp-lab/chameleol/pull/26
共有ブランチ：work/chatgpt-cg00-cg02-20261116
今回のChatGPT修正基準：455c1495a12fe2f7dda08b1f6f6e7925a8a9e569

最初に最新ブランチとPRを取得し、上記基準とその後の検査/文書commitを含むことを確認してください。古い作業コピーでapp.js、bonus-view.js、street-accents.js、結果の保存/共有/解放修正や試験を上書きしないでください。共有headが進んでいればその変更を保ち、新しいPR、force push、mainへの直接push、代理マージ、公開、本番DB変更は行いません。

最初に読む資料：

docs/superpowers/specs/2026-11-16-chameleol-final-requirements.md
docs/superpowers/plans/2026-11-16-chameleol-master-plan.md
docs/superpowers/plans/2026-11-16-chameleol-claude-plan.md
docs/superpowers/plans/2026-11-17-chameleol-chatgpt-pr26-followup-plan.md
docs/reviews/2026-11-17-chameleol-cl03-cl04-presubmit-review.md
docs/reviews/2026-11-17-chameleol-chatgpt-followup-review.md
docs/acceptance/pr26/chatgpt-followup/measurements.md
docs/acceptance/chameleol-handoff-ledger.md
docs/acceptance/pr26/integration-checklist.md

今回ChatGPTが直した内容を理解してください。精密札は未定義キーを呼ばず仮表示「◎ 98%」。検証入口の3秒予熱は16ms以下。旗はx253で縦画面の主人公の反応後にも配置でき、水と渦は柱から離しています。実保存claim前後のE020、実placements、最初graceの49棟走査、実中間旗delivery→static、旗の実インスタンスだけを隠す画素比較、旧最大prop群＋舌の資源検査を追加しています。通常起動はlegacy80、catalog80/20のままです。

今回進める内容は次の3点です。

1. R07/Q07（鳥がほぼ出ない）とR11/Q09（警察1人の最大振り向き・収縮で舌と胴が4pxを満たさない）の見た目の再設計案と比較の証拠を整理してください。条件や閾値を緩めず、まず姿勢・経路・位置を変える案を検討します。舌が出る間の頭の向きを前方へ寄せる案を第一候補としますが、取消/収納で姿勢が戻ること、既存反応を壊さないことも示します。4px免除、口元例外、鳥56px→40px、抽選の変更、警察1人で開始しない契約変更は承認済みではありません。提出済みの不具合の製品修正はF14に従ってChatGPTが担当するので、同じ対象へ同時に書かないでください。契約変更が必要なら、その箇所と影響を資料へ明記します。
2. CL05の予定された全体検査を進めてください。通常Appを切り替えず試験wrapperでextended96・実ports・実controllerを明示接続し、requestAnimationFrameを動かした1プレイで舌/街/警察/札→終了→結果→保存/共有取消→再プレイを通します。舞台の1フレーム1step、旧抽選との二重起動なし、402×700/402×874/874×402、演出オフ・簡易DOM・4ガイド・20/40/50棟・停止/非表示/復帰・描画喪失・解放を確認してください。R07/R11未解決のためG2全体合格へは進めません。既存の強制画像を実プレイの可視率や実機の証拠へ使わないでください。
3. CL06として受渡し票を更新してください。工程別の完了/未完了、変更ファイルと書込停止範囲、実モデル/effort、F/IF対応、export/呼出例、試験コマンドと成功/失敗/未実施、画像・資源測定、未解決事項、ChatGPTのCG03へ渡す残件を記録し、同じPRへ追加します。提出時は対象への書込を止め、PR後のCI失敗・不具合・レビュー修正・コンフリクトをChatGPTへ移します。関係しない予定作業は続けてください。

体制は既存計画を維持します。CL-Oと設計CL-Dはclaude-opus-5-5（high/xhigh）、実装CL-A/B/Cと検査CL-Tはclaude-sonnet-5-5/high、独立CL-Rはclaude-opus-5-5/xhigh、記録Wはclaude-sonnet-5-5/medium。全体を含め同時4人以内、同じファイルの同時編集なし。実際に設定できたモデル/effortを記録し、利用できない指定の実行を装ったり、追加課金・外部有料API・Codex Cloudジョブを独断で起動したりしないでください。

採点・保存・通信・共有制御・catalog・通常App接続はChatGPTが担当します。新しい15言語の翻訳は双方の実装完了後にChatGPTがまとめて対応するため、辞書を編集せずキーと使用箇所を記録してください。通常接続CG03・96/4への切替・G5全体合格・公開の完了を先取りせず、今回の残工程と受渡しまで進めてください。
