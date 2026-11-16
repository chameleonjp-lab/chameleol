リポジトリ https://github.com/chameleonjp-lab/chameleol の「カメレオる」で、最新mainからClaude担当の実装を進め、PRと受渡し票を提出してください。この依頼は計画更新PR #25を本人がマージした後に使用します。

最初に次を全文読み、全体要件→①の組織・分担・契約→③の手順の順に従ってください。

1. docs/superpowers/specs/2026-11-16-chameleol-final-requirements.md
2. docs/superpowers/plans/2026-11-16-chameleol-master-plan.md
3. docs/superpowers/plans/2026-11-16-chameleol-claude-plan.md と docs/superpowers/plans/2026-11-16-chameleol-chatgpt-plan.md
4. docs/prompts/2026-11-15-claude-pr23-handoff.md

#23のC0〜C4は実装済みです。処理を再実装せず、①契約v1.1とChatGPTのCG00/CG01の確定票とCG02の準備commitを確認してください。未確定の入力や存在しないAPIを推測して作らず、独立して進められる見た目の設計・部品を進めてください。

統括はclaude-opus-5-5 / effort high、見た目の設計と提出前の独立レビューはclaude-opus-5-5 / xhigh。製品コードと試験はclaude-sonnet-5-5 / high、証拠整理だけmedium。全体統括を含め同時4人まで。モデル/effortは実際の起動設定に指定し、使えた設定を記録してください。使えない設定を偽らず、追加課金や別のAPIを起動しないでください。

AはCL02の結果と共通CSS・結果アトラス、BはCL03の舌とstreet/stage、CはCL04の街・警察・通知と街アトラスだけを編集し、同じファイルを同時編集しないでください。App・採点・保存・共有制御・辞書・catalog採否・通常接続はChatGPT担当です。最高一致棟や色、称号、件数、舌の時計、抽選、98%/500msを画面で再判定しないでください。

①IF01〜IF11を共通契約にしてください。通常stageはlegacy80が既定で、実Appの試験だけstageFactoryからextended96を明示し、新旧抽選を二重に動かさないでください。新controllerのstepはDOM簡易表示も含め舞台で1回、通知はsnapshotだけを使います。動きを減らす設定の現在値を毎回渡し、舌の保持中の途中変更で収納される検査と変更監視の解放も行ってください。初回onChangeがmount前に来ること、最初600msのE090、開いているパネルの訂正、batch無しeval中の精密札まで実際の部品で確認してください。

CL00→CL01（CG02準備と並行可）→CG02のowner準備/札の橋渡しを含む共通baseでA/B/Cの並行実装→CL05の実App明示接続・3寸法/15言語・資源測定・提出前独立レビュー→CL06のPR提出と引渡しまで進めてください。提出前の重要指摘はSonnet担当が直し、対象試験を確認してください。通常起動の本文共有試験はそのまま保持し、通常接続・96/4とApp検証入口の切替はChatGPTへ渡してください。

PR作成者に関係なく、**提出後のCI失敗、不具合、レビュー修正、コンフリクト解消はChatGPTの管轄です。** PRを提出したら対象への書込を止め、head・ログ・再現・画像・契約版を引き渡してください。提出後の修正を自分へ戻さず、ChatGPTが表示ファイルも直接修正できるようにしてください。

docs/acceptance/chameleol-handoff-ledger.mdへF/IF番号、開始/完成commit、export/呼出例、実モデルとeffort、試験、402×700/402×874/874×402の画像、比較色・8px余白・遮蔽・描画/画像/16MiBの測定、通常接続/実機/公開の未完了を記録してください。モックやPNGだけで完成扱いにしないでください。

main直push、本人に代わるマージ、記録初期化、本番DB変更、無断公開、実験場掲載は行わないでください。
