# カメレオる：PR #21後の後続対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本人指定のClaude／ChatGPT分担を維持する。

**Goal:** PR #21で入った部品を引き継ぎ、残る修正・演出・27称号の結果カード・画像共有を、Claudeの画面実装とChatGPTの仕様処理に分けて完成させる。

**Architecture:** ChatGPTが判定・表示用データ・時計・保存取得・共有状態を実装し、Claudeは読み取り専用の値を受けて画面と動きを実装する。app.jsで接続し、仕様の条件を画面内へ二重実装しない。

**Tech Stack:** JavaScript ES modules、Node.js 20以上、Three.js 0.170.0、既存IndexedDB、Canvas 2D、node:test、既存Playwright。

**Spec:** [今回の分担・接続仕様](../specs/2026-11-15-chameleol-role-contract.md)、[既存改訂3の要件](../specs/2026-11-14-chameleol-design-followups-spec.md)、[PR #21の実装レビュー](../../reviews/2026-11-14-chameleol-design-followups-implementation-review.md)。Claudeへは[画面実装専用の依頼文](../../prompts/2026-11-15-claude-visual-followups.md)を渡す。

2026-11-15（日本時間）。基準mainは `e6d2e14f65b117e2ea288196f68c38364837cdf5`。本書は実装前の計画であり、以下の実装用チェック欄は未実施。本PRでは文書だけを変更する。

計画の独立レビューと修正は[レビュー記録](../../reviews/2026-11-15-chameleol-post-pr21-plan-review.md)に記載する。

## Global Constraints

- 全50棟、既存の採点・順位・出題・履歴・署名summary・送信内容・識別値を維持する。
- 規則v1〜v4、DB_VERSION=1、既存ストアと未送信結果を維持する。表示専用の処理から得点を書き換えない。
- 採用は元80件＋後続16件＝96件。E045・E051・E088・E097の4件は除外する。
- Node.js 20以上、Three.js 0.170.0、既存の15言語を維持する。新しい実行時依存は必須にしない。
- 自動画像は402×700、402×874、874×402で作り、自動ブラウザと実機の結果を分ける。
- 街7枠、静的装飾24、小芝居1組3枚、環境粒子8、成功リング1、追加描画呼出12・形16・画像4、圧縮画像1.5MiB・展開後16MiBを新旧合計で守る。
- 表示保存は32KiB・直近32playId以内を維持する。追加課金やCodex Cloudの実装ジョブは起動しない。
- mainへの直接push・本人に代わるマージ・記録初期化・本番データベース変更・無断公開・実験場への掲載は行わない。

## Review Focus

| 条件 | 期待する動作と担当工程 |
| --- | --- |
| 解析中の再プレイ・画面離脱と遅い完了 | C1/C3：即座に本編へ移り、古い解析・画像を採用しない |
| 得点が変わらない確認状態の変更・言語切替 | C3/V4：古いFileを使わず、15言語の切替で主人公を撮り直さない |
| 旧版・不正な棟数・ベスト棟だけ実色欠損・壊れたボーナス | C2：確認中／記録なしを出し、次点や壁色から埋めない |
| 取得が遅い・複数タブ・中間配達の期限をまたぐ | C4/V3：取得成功前には描かず、成績・再開・入力を止めない |
| 短い縦画面・横画面・警察1人の振り向き・画像保存表示 | V2/V4/G1：比較面・操作領域・8px余白・16MiBを守る |

## 1. PR #21後に確認した状態

PR #21は2026-11-15 21:28（日本時間）にマージ済み。PR本文は「T0のみ」の古い記述だが、変更ファイル・24コミット・最終コードとレビューを優先する。PR最終head `9766690b736eec5437b9ff0d2cdb4edadec1d984` の[CI](https://github.com/chameleonjp-lab/chameleol/actions/runs/43698506540)はsuccessを確認した。本計画作成時に製品試験を再実行した意味ではない。

| 旧工程 | 基準mainの事実 | 後続で行うこと |
| --- | --- | --- |
| T0 | README等は#21開始前の状態まで更新。現在は再び古い | C0で追記し、履歴を残す |
| T1 輪郭 | `chameleon-outline.js` と舞台への接続が入り、最終レビューは合格 | 作り直さず、V2/V4で回帰と結果モデルへの適用 |
| T2 舌・ダイヤ | 専用ファイルはまだ無い。moving/warningActiveの入口はある | C4＋V2 |
| T3 静止解析 | 実色・3コマ・二色・警戒・回復・最長成功の処理と画面がある | C1＋V1でT3-01〜07を解消 |
| T4 背景5案 | 予約処理・追加素材と描画は未実装 | C4＋V3 |
| T5 警察2案 | 聞き込み・足跡の追加は未実装 | C4＋V3 |
| T6 精密札 | 保存取得口はあるが98%/500msの判定・札は未実装 | C4＋V3 |
| T7 結果カード | カード・称号・PNG・ファイル共有の専用実装はまだ無い | C2/C3＋V4 |
| T8 表示用保存 | 保存部品と `App.createExtrasPort` は入り、最終レビューは合格 | 再実装せずC4/V3で実際の利用を確認。古い証拠の「app未接続」を補足 |
| T9 統合 | 新16案の全実装・最終統合・実機確認は未完了 | G1/G2 |

`createThreeStage` は現在渡された `extrasPort` を受け取って利用する実装になっておらず、既存 `createCameoDirector` はまだ保存無しの旧処理。結果の5パネルが実装済みでも `catalog.js` と試験の採否は80/20のまま。この2点を「完成済み」と扱わない。

### 引き継ぐレビュー指摘

| 指摘 | 現状と修正内容 | 担当 |
| --- | --- | --- |
| T3-01 重要 | pending中の再プレイを、外部の一時確認だけでなくリポジトリの試験へ入れる | C1 ChatGPT |
| T3-02 重要 | 真の位置に半径3・白塗り・縁#14183a 1pxの点を残し、番号の丸を別に置いて線で結ぶ | V1 Claude |
| T3-03 軽微 | 同じ棟・色・一致度が連続する時、実色区間のtoを延ばす | C1 ChatGPT |
| T3-04 軽微 | 通過する2棟で壁色相＋150の入力を使い、実色≠壁色を確認 | C1 ChatGPT |
| T3-05 軽微 | フィルム幅44→38pxにして続きが見えるようにする | V1 Claude |
| T3-06 軽微 | 終了時の色の説明を15言語で明確化。韓国語・中国語の区間記号を修正 | C1で文言、V1で配置 |
| T3-07 軽微 | 記録なし画像を追加し、V4後に3寸法の結果全体を撮る | V1/V4 Claude |

T1-05・T8-04の設計記録の修正、P01〜P28の未実装部分も今回の分担仕様へ取り込む。特にダイヤ1描画、結果画像の総メモリ、共有の別タップ、空URL、旧版欠損、配置条件と抽選比率を旧計画のまま実装しない。

## 2. 要件と残作業の対応

| 要件 | 基準main | 仕様処理 | 見た目・画面 |
| --- | --- | --- | --- |
| DES-01〜03/08 輪郭 | 実装済み、実機未確認 | C0で引継ぎ | V2/V4で既存表を利用、G1で回帰 |
| DES-04〜08 舌・競合・ホーム保護 | 未実装 | C4 | V2 |
| E020 踏切 | 未実装 | C4 | V3 |
| E034 聞き込み、E039 足跡 | 未実装 | C4 | V3 |
| E044 精密札 | 未実装 | C4 | V3 |
| E056 中間旗 | 未実装 | C4 | V3 |
| E067 雨どい、E068 ロボット、E069 配達鳥 | 未実装 | C4 | V3 |
| E072 最後の3コマ、E076 二色 | 実装済み、修正と全体確認が残る | C1 | V1/V4 |
| E075 街の模型、E090 指で回す | 未実装 | C2/C3の値と所有権 | V4 |
| E084 警戒グラフ、E086 回復、E087 最長成功 | 実装済み、レビュー修正が残る | C1 | V1/V4 |
| E094、RES-01〜08 | 実色解析の部品のみ | C2/C3 | V4 |
| EXT-01〜04 | 解析・保存は一部実装 | C1/C3/C4 | V2/V3/V4、G1 |
| FOLLOW-01/04/08 | 古い一覧・互換試験・採否の統合が残る | C0/G1 | G1の画像 |
| FOLLOW-02/03/05/06/07 | 候補・実機・正式値・原画・本番照合が残る | G2 | G2の実機・見た目判断 |

## 3. 実装順と編集するファイル

C0の後にC1→C2→C3、C4を進める。Claudeは契約が確定した部分からV1→V2→V3→V4を進める。V1はC1の文言、V2/V3はC4、V4はC2/C3に依存する。C3とV1のように編集ファイルが分かれる作業は同時に進めてよい。部品完成→接続→実データ確認を各工程で区別する。

| 担当 | 主に新規作成するファイル | 既存で編集する主なファイル |
| --- | --- | --- |
| ChatGPT C1 | なし | `src/presentation/result-evidence.js`、`tests/e2e/result-evidence.e2e.mjs`、15辞書 |
| ChatGPT C2 | `src/presentation/result-card-data.js`、`result-miniature-data.js`、対応する `tests/presentation/result-card-data.test.mjs`、`result-miniature-data.test.mjs` | `src/presentation/result-data.js` は互換修正が必要な部分だけ |
| ChatGPT C3 | `src/presentation/result-card-controller.js`、`result-renderer-owner.js`、`src/ui/share-card.js` と各単体試験 | `src/app.js`、`src/ui/share.js` の既存ホーム経路は保持 |
| ChatGPT C4 | `src/presentation/game-extras-controller.js`、`cameo-reservations.js`、`precision-badge.js`、`police-extras.js`、`src/scene/travel-tongue-motion.js` と各単体試験 | `src/app.js`、`catalog.js`。保存ファイルは必要な互換修正だけ |
| Claude V1 | 必要な画像証拠 | `result-evidence-view.js`、`presentation.css`、対応する画面・配置試験 |
| Claude V2 | `src/scene/tongue-rig.js`、`travel-tongue.js`、描画試験 | `showcase-tongue.js`、`scene/street.js`、`scene/stage.js` |
| Claude V3 | 追加素材と描画試験 | `street-accents.js`、`actor-reactions.js`、`scene/characters.js`、`hud-view.js`、`bonus-view.js`、`scripts/render-street-atlas.mjs` とアトラス |
| Claude V4 | `result-card-view.js`、`result-portrait.js`、`result-model.js`、`result-miniature.js` と描画試験 | `result-view.js`、`presentation.css`、`scripts/render-result-atlas.mjs` とアトラス定義 |
| ChatGPT G1/G2 | 統合試験・受け渡し票・検証記録 | README、採否表、端末・調整・公開資料 |

新しい単体試験は `tests/<分類>/*.test.mjs`、画面試験は `tests/e2e/*.e2e.mjs` に置き、既存npmコマンドで拾える階層にする。共有ファイルは工程の先頭で担当を固定し、別ブランチの同時編集を避ける。

## C0：基準と引継ぎを確定する（ChatGPT）

**Files:** README、`docs/acceptance/design-followups-evidence.md`、既存tuning/release資料、`docs/requirements/chameleol-design-followups.json`。

**Interfaces:** 入力は最新main・#21の最終コード・レビュー。出力は実装状態、機能ごとの担当、基準commit、公開状態の一覧。

- [ ] 最新mainと開いているPRを確認し、本書基準との差分だけを反映する。T1・T3・T8と#14/#16/#18を再実装しない。
- [ ] READMEと証拠に「PR #21後」の節を追加する。古い失敗・未完了記録は時点付きで残し、末尾の再確認結果へ案内する。
- [ ] 対応表は当初の16案・27称号を保持し、新しい計画と分担への参照を追加する。予定・部品実装・接続・自動確認・実機・公開を別々に記録する。
- [ ] 実装開始時の `npm test` を一度実行し、既存の失敗とデータベース専用のskipを記録する。文書だけの本PRでは実行しない。
- [ ] 文書差分をcommitし、Claudeへ渡す固定データと編集範囲を記録する。

## C1：結果解析の指摘を解消する（ChatGPT）

**Files:** `src/presentation/result-evidence.js`、`tests/presentation/result-evidence.test.mjs`、`tests/e2e/result-evidence.e2e.mjs`、15辞書。

**Interfaces:** 既存 `captureEvidenceBase/startResultEvidence/resolveResultEvidence/releaseResultEvidence` を維持する。`visualSamples` の意味は変えず、`to` の連続区間だけを正す。

- [ ] `visual sample extends through internal query boundaries` を追加し、同じ棟・HSV・matchUnitsで隣接する区間の `to` が9500になる例を検査する。別色・別棟・無評価時間では延長しない。先に現行コードで失敗を確認する。
- [ ] `replay remains available while evidence is pending` を追加する。解析を保留したまま再プレイで新しいsessionが始まり、旧signalがaborted、旧解析の遅い完了後も新画面が維持されることを検査する。
- [ ] 通常終了の通過2棟で壁色相＋150を入力し、解析HSVが入力色と一致し壁色とは異なることを確認する。保存失敗とv1/v2途中再開の既存試験は残す。
- [ ] 最小の修正とT3-06の15言語修正を行う。`node --test tests/presentation/result-evidence.test.mjs tests/i18n/messages.test.mjs` と `node --test --test-concurrency=1 tests/e2e/result-evidence.e2e.mjs tests/e2e/saved-run.e2e.mjs` で失敗0を確認する。
- [ ] 変更と再確認をcommitし、V1へ文言とデータを渡す。T3全体はV1の重要指摘も解消してから合格とする。

## C2：27称号・代表色・件数の値を作る（ChatGPT）

**Files:** 新規 `result-card-data.js`、`result-miniature-data.js` と対応する `tests/presentation/` の単体試験、15辞書。必要時だけ既存 `result-data.js` の保護を補う。

**Interfaces:** 分担仕様§4の `rankForPassed`、`selectBestVisual`、`buildResultCardModel`、`buildResultMiniatureModel`。出力をClaudeの共通描画とE075へ渡す。

- [ ] 全0〜50の51値が27区分へ一意に対応し、旧7キーが残る試験を書く。不正数・不明版・50棟と終了理由の矛盾は確認中、今回1棟/自己ベスト50棟なら今回の称号になることを検査する。
- [ ] 丸めると同率だが実値が異なる例、真の同率、v1〜v4の単位差、0評価時間、ベスト棟だけ実色欠損を検査する。最後の例は次点に差し替えずmissing。ベスト5棟目・到達40棟目ではカード/E090のoutlineBuildingは5、missingでは1を検査する。
- [ ] 対応版0件、旧版missing、壊れたtotals、重複ID、precisionの5/10点択一、156件と7280点を別に検査する。元summaryをfreezeして前後同一も検査する。
- [ ] E075の50棟を読み取り専用のcellsへ変換する試験を追加する。8棟通過/9棟到達ならpassedが8・arrivedが1・unreachedが41、50棟クリアならpassedが50。targets欠損ではwallHsv:null、到達棟の実色欠損ではbodyHsv:null、不正な到達棟ではavailable:falseを検査する。
- [ ] 対象単体で失敗を確認してから処理を実装する。必要な検証を通した後にだけ既存 `buildBonusResult` を使う。
- [ ] `node --test tests/presentation/result-card-data.test.mjs tests/presentation/result-miniature-data.test.mjs tests/presentation/bonus-result.test.mjs tests/net/bonus-status.test.mjs tests/i18n/messages.test.mjs` の失敗0を確認しcommitする。全27称号と長文・欠損、模型の50棟の固定入力をV4へ渡す。

## C3：画像の世代・共有・描画器の所有を作る（ChatGPT）

**Files:** 新規 `result-card-controller.js`、`result-renderer-owner.js`、`src/ui/share-card.js`、同名の単体試験。`src/app.js` の接続はChatGPTが編集する。

**Interfaces:** 分担仕様§4/5のcontroller・ports・snapshot・`sharePreparedResult`。描画portsはV4で実部品に交換する。試験用の代用品は完成画面とはしない。

- [ ] 公式訂正、同得点のpending→official、言語、対象結果、レイアウトの変更で旧Fileが即無効になる試験を追加する。古いPromise完了、新結果、画面離脱、二重disposeを含める。
- [ ] ファイル対応あり/なし、`canShare`二段確認、空/null URL、AbortError、失敗、連打、未完了共有からの帰還を検査する。`share()` 呼出から `shareImpl` まで画像生成をawaitしないことを検査する。
- [ ] 解析pendingと主人公準備失敗はFileなし、完成したmissingカードはFileありを検査する。15言語切替で主人公撮影1回、E090中の訂正でカードが優先、同時描画器1個も検査する。
- [ ] 初回の主人公撮影失敗とPNG失敗から `retry()` し、言語・結果が同じでも新しいrevisionで成功できること、旧失敗の遅い完了で上書きされないこと、自動共有0回を検査する。
- [ ] 失敗確認後にcontrollerと共有処理を実装する。result.netState変更も既存スコアの早期returnの前に通知し、署名summaryと送信は変更しない。
- [ ] `node --test tests/presentation/result-card-controller.test.mjs tests/presentation/result-renderer-owner.test.mjs tests/ui/share-card.test.mjs tests/ui/app.test.mjs` の失敗0を確認しcommitする。URL解放と保存用imgの操作契約をV4へ渡す。

## C4：ゲーム中の発生条件を完成させる（ChatGPT）

**Files:** 分担仕様§6の新規controllerと `travel-tongue-motion.js`、`cameo-reservations.js`、`precision-badge.js`、`police-extras.js`、各 `tests/scene/` または `tests/presentation/` の単体試験。`src/app.js` と `catalog.js`。

**Interfaces:** `createGameExtrasController` の `step/event/snapshot/dispose`、既存extrasPort。描画側へ渡す固定データもこの工程で確定する。

- [ ] 舌の9999/10000/20000ms、5段階、同時刻重複、停止・非表示・静止ガイド、動くガイドの消費、逆行・非有限・大きい飛び・再読込0msを検査する。自然進行の10,000/50,000msも含め、割込みで後からまとめて出さないことを確認する。
- [ ] 小芝居の6回/15秒、初期count:0の二重取得なし、110000〜126500ms予約、期限をまたぐ遅い取得、機体最大1500ms/最遅128000ms、5回後の保存復帰、欠損・古いタブ・離脱後の取得を検査する。遅延でも本編を待たせない。
- [ ] 重み126/抽選幅140、出ない10%、不適合配置では消費しないことを検査する。E034→E039各1回、既存の交互表示の番を進めないことと取消を検査する。
- [ ] actorBusyはhero/policeを分け、主人公だけ反応中なら舌だけを抑止、警察だけ反応中なら聞き込み/足跡だけを抑止する試験を追加する。他の危険・ガイド条件は別に適用する。
- [ ] 精密札の97.999/98.000%、499/500ms、4000〜4500msの評価を4501msの次描画で拾う条件、追加得点0、同playId1回、世代拒否を検査する。評価区間の配列はapp側で作り、表示フレームから数えない。
- [ ] 各対象で失敗を確認してから実装し、機能単位でcommitする。`node --test tests/scene/travel-tongue-motion.test.mjs tests/presentation/game-extras-controller.test.mjs tests/presentation/cameo-reservations.test.mjs tests/presentation/police-extras.test.mjs tests/presentation/precision-badge.test.mjs tests/storage/presentation-extras.test.mjs tests/ui/extras-port.test.mjs tests/net/outbox.test.mjs` で失敗0を確認する。
- [ ] V2/V3へ渡すsnapshot、通常・危険・ガイド・失敗復帰の固定入力、利用する既存保存口を受け渡し票へ記録する。実画面の未接続は残項目とする。

## V1：既存パネルの見え方を直す（Claude）

**Files:** `src/presentation/result-evidence-view.js`、`src/ui/presentation.css`、`tests/presentation/result-evidence-view.test.mjs`、画像証拠。

**Interfaces:** C1の値と既存 `mountResultPanels`。解析処理は再実装しない。

- [ ] グラフの各印に真値の半径3・白塗り・縁#14183a 1pxの点、半径7/文字10の番号丸、点から14px上の配置と1pxの線を追加する。重なる丸は14pxずつずらし、上端を超える時は右へ移す。点のx/yは時刻と警戒から動かさない。
- [ ] 真値の点が一致すること、近い3印の番号が重ならないことを先に試験にし、失敗を確認してから直す。
- [ ] フィルム幅38px、終了時文言の配置、「記録なし」状態を直し、3寸法の画像を残す。古い切り出しだけで短い縦画面の合格としない。
- [ ] `node --test tests/presentation/result-evidence-view.test.mjs` と対象画面試験を通しcommitする。T3-02を再確認し、C1と合わせた合格を記録する。

## V2：舌とダイヤを描く（Claude）

**Files:** `tongue-rig.js`、`travel-tongue.js`、既存 `showcase-tongue.js/street.js/stage.js`。新規 `tests/scene/travel-tongue.test.mjs`、`tests/e2e/travel-tongue.e2e.mjs`。

**Interfaces:** C4のsnapshotを受ける。新規rigは `apply(frame)`、`writePoint(fraction,outPosition,outTangent)`、`getLocalEnvelope(outBox)`、`reset()`、`dispose()`。ホーム側の公開名と時間制御は維持する。

- [ ] 舌の85%位置と接線に専用1描画のダイヤを乗せ、保持350msで接触が読める絵にする。尻尾の宝石は同時に出さず、取消後は既存の要求へ戻す。
- [ ] 姿勢の復元順、1000周期、停止中の形状更新0回、初回の事前準備、二重disposeを試験化して実装する。10秒の発火条件や警戒条件はC4の出力を使う。
- [ ] 3寸法・警察1人の最大振り向きで、胴＋4px非重複、壁遮蔽1.5%以下、比較面不一致0、画面端8pxを測る。条件が満たせない時は画像と代替案を返す。
- [ ] `node --test tests/scene/travel-tongue.test.mjs tests/scene/showcase-motion.test.mjs tests/scene/showcase-tongue.test.mjs tests/scene/showcase-lifecycle.test.mjs tests/presentation/actor-reactions.test.mjs` と、`node --test --test-concurrency=1 tests/e2e/travel-tongue.e2e.mjs tests/e2e/home-idle.e2e.mjs tests/e2e/guidance.e2e.mjs tests/e2e/game.e2e.mjs tests/e2e/effects37-85.e2e.mjs` を確認しcommitする。

## V3：背景・警察・精密札を描く（Claude）

**Files:** `street-accents.js`、`actor-reactions.js`、`characters.js`、`hud-view.js/bonus-view.js`、街アトラスのスクリプトと素材。新規描画・画面試験。

**Interfaces:** C4の取得済みsnapshotのみ描く。配置可否をcontrollerへ返し、保存取得や抽選を描画内へ書かない。旧 `createCameoDirector` と新controllerを二重に動かさない。

- [ ] 変更前の制作スクリプトで街アトラスを再生成し、既存画像との差を数値で残す。拡張後も既存61枠を比較し、格子座標の参照をまとめて更新する。
- [ ] 踏切の閉鎖→列車→開放、水源と渦、ロボットの塗装→足→見下ろす、鳥と荷物の上下、機体と旗、足跡を見る→迷う、聞き込みの接地を固定姿勢で確認する。
- [ ] 旧小芝居も新予約へ接続し、取得前非表示・期限切れ静止旗・棟枠再利用・停止・画面離脱を画面試験で確かめる。精密札は既存ボーナスと一つの表示にまとめる。
- [ ] `tests/e2e/extended-street.e2e.mjs`、`police-investigation.e2e.mjs`、`precision-badge.e2e.mjs` を追加し、対象単体と既存 `actor-reactions.test.mjs`、`hud.test.mjs`、`bonus.e2e.mjs`、`presentation.e2e.mjs` を確認する。警察1→0/1→2の後に補正が残らないことを検査する。
- [ ] 合計の装飾・粒子・小芝居・描画呼出・形・画像を測って3寸法の画像とcommitを渡す。E069の条件付き非表示と警察原画の不足は明記する。

## V4：主結果カード・画像・任意パネルを作る（Claude）

**Files:** `result-card-view.js`、`result-portrait.js`、`result-model.js`、`result-miniature.js`、`result-view.js`、`presentation.css`、結果アトラスのスクリプトと定義。新規描画単体と `tests/e2e/result-card.e2e.mjs`。

**Interfaces:** C2のmodel、C3のcontroller/ports。`drawResultCard` は画面・PNG共通。E075/E090は最初のpanels登録から接続する。appへの最終接続はChatGPTへ渡す。

- [ ] 結果アトラスを1920×1520へ詰め、背景5枚・立ち姿4枚・視線1枚を変更前の画素と比較する。従来の見た目を無断で削らず、参照座標を定義から使う。
- [ ] No.28を実HSV・当該棟の既存輪郭で静止撮影する。撮影とE090はC3の同時1個の所有口を使い、言語切替で再撮影しない。主カードは1体だけを大きく配置する。
- [ ] 既存No.71/80/93/99/100の補足写真・立ち姿・操作は主操作より下の常時表示に残し、折り畳みで隠さない。主カード横に主人公を並べない条件と、元80機能の既存試験を両方満たす。
- [ ] 同じ1200×630の描画元から画面とPNGを作り、称号・総点・件数・通過数がC2の値と一致することを単体と画像で確かめる。全27称号×15言語の文言を照合し、最長文・大得点・missingを3寸法で確認する。
- [ ] pending・missing・描画失敗・確認中・共有非対応をそれぞれ表示する。画像外にも読み上げ可能な文字を置き、再プレイは画像生成を待たせない。ボタンは黒地・白字の「Xでシェア」。保存用img、本文で開く、作り直すもC3の状態へ接続する。
- [ ] E075は通過/到達/未到達を分け、到達棟の色が無い時は白などの欠損表示にする。E090の横8px・縦スクロール・取消を確認し、カードとは独立させる。対象データが無い時はモデルを推測しない。
- [ ] パネルなし/E075/E090/保存用imgの同時保持量を測り16MiB以下にする。記録なしの文が細い列に入る場合は `.result-colors-unavailable` を全列へ広げる。
- [ ] 新規対象と `result-actions.e2e.mjs`、`i18n.e2e.mjs`、`bonus.e2e.mjs`、`effects37-85.e2e.mjs` を通す。本文共有の既存試験は押す先だけ代替ボタンへ変え、本文検査は残す。画像とcommitを渡す。

## G1：接続・採否・互換を確認する（ChatGPTが統合、Claudeが画面修正）

**Files:** `src/app.js`、`catalog.js`、採否の既存試験、要件対応表、`docs/acceptance/design-followups-evidence.md`、README。

**Interfaces:** Claudeの実portsを接続し、試験用の代用品を製品経路に残さない。証拠は `commit/requirementId/evidence/automated/device/published/blockedReason`。

- [ ] appで結果controller・表示・保存用imgを接続し、通常終了/保存失敗/v1〜v4途中再開/過去結果/言語変更/公式訂正/再プレイを実経路で確認する。C4のcontrollerが実舞台に入り、extrasPortが利用されることも確認する。
- [ ] 元80を維持した96採用・4除外へcatalogと試験を統合する。No.34/39の強制入口はV3時点、それ以外の80→96/20→4は全16案が入った後の統合commitで変更する。旧80件資料は当時の記録として残す。
- [ ] 意図した期待値変更はPR差分に理由を書く。除外4件の拒否、1〜100の集合、既存機能の実表示、描画上限、比較色、同入力の成績・履歴・送信本文一致の検査を弱めない。
- [ ] 最後の製品コード変更後に `npm test`、`npm run test:sql`（使い捨てDB）、`npm run check:engines`、`npm run test:e2e`、`npm run build` を一度完了する。工程途中は対象試験に絞り、文書だけの変更で全件を再実行しない。既存CIは弱めない。
- [ ] 4ガイド、20/40/50棟、危険、停止/復帰、通常練習、簡易表示、動きを減らす、3寸法の結果全体を確認する。色が壁と異なる実プレイでもカードの体色が入力色になることを検査する。
- [ ] v1〜v4の成績・識別値・未送信件数・旧版入口を使い捨てデータで照合する。画像・パネル操作で本編保存や送信が増えないことを確かめる。
- [ ] 規則側と見た目側の両方からレビューし、重要指摘の修正・再確認後に実装PRを提出する。実機・公開の状態は分けて残す。

## G2：実機確認と公開判断の材料を揃える（両者）

**Files:** `docs/device-test-procedure.md`、tuning/release資料、機能別証拠、配布差分一覧。

**Interfaces:** 候補commit・配布版・URL、端末/OS/Safari/Xアプリ版、実測値、未確認事項。実装の完了と実機合格・公開を別欄にする。

- [ ] 既存公開版を読み取りだけで照合し、Pages/Sitesの現在の版・commit・canonical・共有URLと候補との差を記録する。CIは試験・候補保存だけで自動公開しない現行設定であることも確認する。
- [ ] iPhoneで開ける候補を用意する。既存の承認済み確認用URLが使えなければ、ビルド成果物・配布差分・戻し方まで揃えた後に公開先だけ確認する。本PRで候補や本番を公開しない。
- [ ] iPhone 17 Pro Safariの縦横・短い縦画面で、入力、輪郭、舌、音量、停止/復帰、E090の縦スクロール、PNG保存を確認する。X共有画面から投稿画面へ画像1枚が添付されるところまで確かめ、投稿は本人に委ねる。
- [ ] X未導入、取消、帰還、画像保存も記録する。実機を利用できなければ該当項目を未確認とし、本人がiPhoneで行える手順と候補の状態を渡す。
- [ ] 同条件の基準版と追加版で開始直後/最終地区を各30秒測る。95百分位33.4ms以下・中央値悪化10%以内を目標とし、発熱と結果画像生成中の操作も確認する。取得できないヒープは未測定と書く。
- [ ] 警察No.02原画を接続済み資料から探し、無ければ不足資料名と照合待ち範囲を示す。仮モデルを原画一致済みとしない。線・時間・配点等は初期値と実機で決めた値を区別する。
- [ ] FOLLOW-01〜08の各証拠を埋め、公開する場合の差分・実施順・戻し方を提出する。マージ・本番反映・実験場連携はこの計画の提出とは別に扱う。

## 4. 提出物と完了の区切り

この文書PRの完了は、現行コードとの照合、分担・接続口・実装順・試験・不足の明文化、計画のレビュー修正、GitHub上のPR確認まで。ゲーム機能を完成したという報告にはしない。

後続の実装は、C/V工程の部品実装だけで終了せずG1の実接続と自動確認まで進める。G2の実機・原画・公開は、取得した証拠と不足を明示して別に管理する。外部の端末や公開判断が必要でも、独立して進められる実装を止めない。
