# ホームの連続色変化・巻きベロ：実装検証

2026-11-14（日本時間）。対象は[仕様](../superpowers/specs/2026-11-14-chameleol-home-idle-spec.md)と[計画](../superpowers/plans/2026-11-14-chameleol-home-idle-plan.md)。基準main: `e3a74eb8f843eb2d608c9435ae9cb15e28c6b60a`。実装・テストの対象コミット: `a040856`（この後の文書・画像コミットと合わせて、計画PR #17に基づく別の実装PRに記録）。

## 実装範囲

ホーム専用の数値進行・舌形状・描画ライフサイクルを分離した。共有の時計2関数は動作を変えず `presentation-clock.js` へ切り出し、`stage.js` の既存公開名も維持する。本編・練習の採点、出題、規則版、保存形式、送信形式、既存80演出・除外20件、アプリの画面切替は変更しない。Node.js 20以上・Three.js 0.170.0を維持し、実行時依存は増やしていない。

## 要件と証拠

| 要件 | 実装先 | 検証 |
| --- | --- | --- |
| HOME-01 緑から連続変化 | showcase-motion.js / showcase.js | motionの起点・ブラウザの実材質と画素 |
| HOME-02 24色・500ms・12秒 | showcase-motion.js | 全24境界・中間・折返し・100周 |
| HOME-03 対象材質のみ変更 | showcase.js / 既存setColor | 実モデルの色・ピンク・輪郭・宝石 |
| HOME-04 独立乱数・予約間隔 | showcase-motion.js | 初回・次回・乱数回数・時間飛び |
| HOME-05 900ms・巻きと伸縮 | showcase-motion.js / showcase-tongue.js | 段階境界・連続曲線・画面画像 |
| HOME-06 基準姿勢から小動作 | showcase-tongue.js | 1000回反復・reset |
| HOME-07 表示時間のみ進行 | showcase.js / presentation-clock.js | visibility通知のみ・重複停止理由 |
| HOME-08 画面離脱時の片付け | showcase.js | 遅延callback・監視解除・20往復 |
| HOME-09 動きを減らす | showcase-motion.js / showcase.js | 起動時・動的切替・再予約 |
| HOME-10 最大姿勢と8px余白 | showcase.js | 3画面寸法の画像と境界、実機未確認 |
| HOME-11 一つの描画予約・形状再利用 | showcase.js / showcase-tongue.js | 固定配列・共有形状・資源数・二重dispose |
| HOME-12 描画不可・途中失敗 | showcase.js / showcase-tongue.js | 作成失敗・context lost/restored・操作継続 |

## Review Focus

| 条件 | 確認方法 |
| --- | --- |
| 非表示中の描画が0回 | lifecycleでイベントだけを発火し復帰時の経過を確認 |
| 舌動作中の画面・設定変更 | lifecycle / home-idle E2Eで収納と旧表示停止を確認 |
| 姿勢の累積ずれ | tongueで反復と基準姿勢の復元、E2Eで再表示を確認 |
| 横向き・小さい枠の最大長 | 保守的なカメラ範囲と3寸法の実描画を確認 |
| 借用材質・途中作成失敗 | tongue / lifecycleで所有資源の解放回数を確認 |

## 自動検証結果

実行環境: Node.js v24.22.1、Playwright 1.63.0、Chromium。変更前の `npm test` は394件中363成功・31スキップ・失敗0。スキップを成功として数えない。

- `npm test`: 429件中398成功、31スキップ、失敗0。31件は使い捨てPostgreSQLを必要とする別実行のSQL試験であり、CIで別に実行する。
- `npm run build`: 成功。検証版 `assetVersion: 0.1.0-29db25128e`、86ファイル。公開はしていない。
- 追加のscene単体試験: motion 12件、tongue 8件、lifecycle 15件。既存時計4件も成功。
- 独立レビュー: 色と時間制御、舌形状、ライフサイクルをそれぞれ確認。舌方向へ目を向ける回転符号の誤りを修正し、向きベクトルの回帰試験が失敗から成功に変わることを確認。修正後の再確認に未解消指摘なし。
- 追加のカメラ検査: 実枠300×190と320×170・160×210で、61姿勢×71向きの全頂点と輪郭の投影が8px余白内に収まることを独立確認。

- `node --test tests/e2e/home-idle.e2e.mjs`: 9成功・失敗0・skip0。最後に比較前の体色変化を明示する検査を強化し、その1件も再実行して成功。
- `node --test --test-concurrency=1 tests/e2e/game.e2e.mjs tests/e2e/guidance.e2e.mjs tests/e2e/saved-run.e2e.mjs tests/e2e/presentation.e2e.mjs`: 123成功・失敗0・skip0。計画H4.4のホーム試験を別プロセスに分け、同じ指定対象をすべて実行した。
- presentation内の「result settles by 600 active milliseconds」、`pause_hidden_resume`、`leave_before_best_sound`、`leave_game_unsubscribes_and_discards_scheduled_callbacks` はすべて成功。
- `node --test --test-name-pattern=GAME-17 tests/e2e/play.e2e.mjs`: 選択した1件成功・失敗0。名前に一致しない他の試験は実行済みに数えない。
- ホーム初回動作は乱数0.5で2500ms。20往復の各新ホームは幾何10・画像2・drawCalls40、描画予約1、canvas1で一定。舌を初めて描く時だけ共有幾何がGPUへ1個追加され11になり、以降は一定。旧ホームのrenderCountは増えず、予約0、顎と口の基準姿勢も一致。
- 全画面における舌のピンク画素数は予備59・伸長66・最大148・収縮63・収納3・待機0。画素とモデルの両方で巻きと収納を確認した。
- PR更新後のGitHub Actionsも確認対象。実行結果はPRのChecksに記録される。本書のローカル結果と区別する。

## 画像

変更前: [402×700](home-idle/before-402x700.png)、[402×874](home-idle/before-402x874.png)、[874×402](home-idle/before-874x402.png)。

変更後の全画面: [402×700](home-idle/after-402x700.png)、[402×874](home-idle/after-402x874.png)、[874×402](home-idle/after-874x402.png)。模型の大きさ・輪郭・ボタンの読みやすさを比較し、既存枠のまま操作と分離できていることを確認。最小の輪郭余白は32 CSS px（基準8px）。

最終形状値: 長さ方向32・円周6分割（231頂点）、舌半径0.05、巻き半径0.12、巻き数1.25。最大中心線長0.96、輪郭を含む保守的な最大張出し1.09501（仕様の1.10以内）。先端は最大長でほどけ、収縮時に巻き直す。形状・位置・法線・添字配列は再利用する。

巻いた先端から伸長・最大長への接続、ピンクの維持、口への収納と輪郭を目視確認した。画像は自動Chromiumであり、iPhone実機の証拠ではない。

- 色: [0ms](home-idle/402x700-color-0.png)、[250ms](home-idle/402x700-color-250.png)、[500ms](home-idle/402x700-color-500.png)、[12000ms](home-idle/402x700-color-12000.png)。
- 巻きベロ: [予備](home-idle/402x700-anticipate.png)、[伸長](home-idle/402x700-extend.png)、[最大](home-idle/402x700-hold.png)、[収縮](home-idle/402x700-retract.png)、[収納](home-idle/402x700-settle.png)、[待機](home-idle/402x700-idle.png)。
- 別寸法の最大長: [402×874](home-idle/402x874-hold.png)、[874×402](home-idle/874x402-hold.png)。

## 確認の限界と判断

全体の独立レビューでも実装・テスト設計の未解消指摘はない。自動試験のvisibility/contextイベントはアプリの制御を確認するもので、実機GPUの復旧を保証しない。描画器の資源数が一定であることと明示的な解放試験は確認したが、ブラウザ・ドライバー全体のメモリ測定とは区別する。実機での表示・性能判断は保留する。

## 実機・配布・公開

- iPhone 17 Pro Safariの実機は利用できず、縦横、アドレスバー伸縮、30秒表示、10回再表示、別アプリ復帰、設定切替、発熱・かくつきは未確認。
- iPhoneだけで開ける実装候補URLは未用意。旧公開版やlocalhostを修正版の確認先として案内しない。
- サイト作成・本番公開・マージ・本番DB接続は行っていない。CIのビルド成果物も公開とは区別する。
- [実機手順](../device-test-procedure.md)に記録欄を追加。既存成績を消す操作は不要。
