リポジトリ https://github.com/chameleonjp-lab/chameleol の「カメレオる」について、最新mainの計画書に従い、Claude担当の見た目・演出・画面と操作の実装を進め、実装PRを提出してください。この計画更新PRは本人がmainへマージした後に使用します。

最初に読む資料：

1. docs/superpowers/plans/2026-11-15-chameleol-post-pr21-plan.md の「2026-11-16の開始状態」とV1〜V4・G1/G2
2. docs/superpowers/specs/2026-11-15-chameleol-role-contract.md
3. docs/prompts/2026-11-15-claude-pr23-handoff.md
4. docs/superpowers/specs/2026-11-14-chameleol-design-followups-spec.md と docs/requirements/chameleol-design-followups.json

まず最新mainから新しい作業ブランチを作り、#23のC0〜C4の実装ファイルと#24の4組並行CIが揃っていることを確認してください。C0〜C4は実装済みです。履歴や旧計画の未チェック欄だけを理由に処理を作り直さないでください。全担当を同じ開始commitへ揃えてください。

担当体制と設定：

| 役割 | モデル | effort | 担当 |
| --- | --- | --- | --- |
| O 統括 | claude-opus-5-5 | high | 要件、担当範囲、競合整理、進行、PR |
| D 見た目の設計 | claude-opus-5-5 | xhigh | 配置、姿勢、3寸法、15言語、資源配分。製品コードは書かない |
| A 実装 | claude-sonnet-5-5 | high | V1→V4、結果・撮影・模型・共有/保存画面、共通CSS |
| B 実装 | claude-sonnet-5-5 | high | V2、舌・ダイヤ・姿勢、street/stageの描画接続 |
| C 実装 | claude-sonnet-5-5 | high | V3、街・警察・精密札の絵と動き、素材 |
| T 試験 | claude-sonnet-5-5 | high | 実装担当が返した試験、画像、測定 |
| R 独立レビュー | claude-opus-5-5 | xhigh | 実装者とは別に検査し、修正は元の実装担当へ返す |
| W 記録 | claude-sonnet-5-5 | medium | 要件、証拠、ChatGPTへの接続票 |

統括を含め同時4人までにし、終了した枠を試験・レビュー・記録へ回してください。モデルとeffortは実際の起動設定にも個別指定し、使った設定を記録してください。利用できないモデルや機能を使えたことにせず、事実と代替案を返してください。追加課金や別の外部APIは起動しないでください。

P0の照合→P1の設計→P2のA/B/C並行実装→P3の描画側統合→P4の実App接続試験→P5の独立レビューと修正→P6のPR提出の順に進めてください。street.js/stage.jsはB、共通CSSと結果アトラスはAだけが編集します。Cは独立した描画部品と配置可否をBへ渡し、試験Tは実装担当の編集終了後に着手してください。

src/app.js、C1〜C4の処理、採点・保存・通信、15辞書、catalog.jsの採否切替はChatGPT担当です。画面側で称号・最高一致棟・色・件数・10秒・抽選・98%/500msを再計算しないでください。既存No.28、輪郭、既存80案、ホームとガイド、旧版と記録を維持してください。

結果は新規result-card-ports.jsのcreateResultCardPorts({result,host,scope})で既存AppのresultCardPortsへ渡せる形にし、実際のAppと実データで試験してください。通常起動への最終接続と96採用/4除外の切替はG1でChatGPTへ渡します。接続例・export・最小の差分案を提出し、未接続の通常起動を完成扱いにしないでください。舞台は既存gameExtrasControllerの出力を描き、旧directorと二重に抽選しないでください。

精密札はCがボーナス表示のtick({precisionBadge,...})にcontrollerの読み取り専用の札を受け取る表示口を作り、Tが実controllerと明示接続して確認してください。通常AppのgameExtrasController.snapshot().precisionBadgeの転送はChatGPTのG1へ残し、札のためにstep()を二度呼ばないでください。No.34/39等は新しい描画部品へsnapshotや固定姿勢を直接渡して検査し、Appの強制入口の拒否解除はG1へ渡してください。通常起動の本文共有の既存試験も保持し、画像共有・代替本文は実portsを指定したAppの追加試験で確認してください。

402×700、402×874、874×402と15言語で画像を確認し、色比較面、8px余白、遮蔽率、描画数、画像・16MiB、同時描画器1個を測定してください。画像準備で再プレイを待たせず、主カードの主人公は1体、記録なし・失敗・取消・再試行も確認してください。既存の常時表示の補足写真を隠さないでください。

工程途中は対象試験に絞り、最後の製品コード変更後に既存の4組CIを一度成功させてください。試験の削除・skip追加・判定や上限の緩和で合格にしないでください。独立レビューの重要指摘は修正して再確認し、途中で説明だけを返して止まらず、実装PRとdocs/acceptance/claude-visual-handoff.mdまで提出してください。

提出には実際のモデル/effort、開始と完成のcommit、要件IDと変更ファイル、公開関数と接続例、試験、3寸法の画像、測定値、G1未接続・実機未確認・未公開を分けた一覧を含めてください。iPhone 17 Pro SafariでのX画像添付、保存、音、性能は実機未確認のまま区別し、本人が確認する手順を用意してください。

mainへの直接push、本人に代わるマージ、記録初期化、本番DB変更、公開・配備、実験場への掲載は行わないでください。公開の別計画が進んでいる場合は差分と接続点を報告し、勝手に公開設定を変えないでください。
