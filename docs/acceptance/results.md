# 受入試験の記録（2026-11-07）

[受入試験一覧](kamereoru-acceptance.md)の82件について、このブランチ（`claude/charming-volta-5psqc9`）で行った確認を記録します。判定規則は `kamereoru-rules-v1`、出題は `kamereoru-course-v1` です。

計画書の「途中の確認と合格を区別する」に従い、状態を4つに分けました。どれも、正式な合格を名乗るものではありません。

- **自動確認**：期待結果の全項目を、端末に依存しない自動試験で確かめたもの（判定・計算・データベースの約束など）。公開候補のコミットで再実行し、そのコミットを書き添えて初めて合格とします。
- **部分確認**：自動ブラウザ（Chromium、402×874 のタッチ端末として表示）や、手元の検証用サーバー（Edge Function と同じ処理＋使い捨ての PostgreSQL 16）で確かめたもの。iPhone 17 Pro の Safari や、Supabase の検証環境での確認が残っています。
- **未実施**：この作業環境では確かめられないもの（実機の操作感、試聴、本番の権限など）。
- **保留**：前提がそろっていないもの（原画、正式URLなど）。

試験の実行環境は、Node 22.23.4（Ubuntu 24.04）、PostgreSQL 16.15、Chromium（Playwright 1.63.0）、QuickJS（quickjs-emscripten 0.32.0）、Deno 2.1.4 です。実行方法は `npm test`、`npm run test:sql`、`npm run check:engines`、`npm run test:e2e`、`npm run smoke:edge` です（README を参照）。

## 1. 本編・色・得点

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| GAME-01 | 自動確認 | 停止なしで250秒・50棟でクリア、51棟目なし（`tests/rules/engine.test.mjs`）。自動ブラウザで最終出口を通過（`tests/e2e/game.e2e.mjs`） | 公開候補で再実行 |
| GAME-02 | 自動確認 | 判定は時刻だけで決まり、歩行・振り返り・尻尾の動きは描画だけ（`src/scene/street.js` の基準点は時刻から計算）。描画の違いで結果が変わらないことは GAME-08 で確認 | 実機で見た目の確認 |
| GAME-03 | 自動確認 | 猶予中の大きな色変更が警戒と平均に入らない（`engine.test.mjs`） | — |
| GAME-04 | 自動確認 | 評価を締めた後・出口前の途中終了は未通過（`engine.test.mjs`） | — |
| GAME-05 | 自動確認 | 249.7秒の終了は49棟、250秒ちょうどは通過が先で50棟＋クリア点（`engine.test.mjs`） | — |
| GAME-06 | 自動確認 | 初棟・通常棟・最終棟の評価時間がすべて3秒（`engine.test.mjs`） | — |
| GAME-07 | 部分確認 | 昼・夕方・夜・警察2人の接近中に、描画した画面から読んだ壁・体の色と、プレビューの色が判定の8ビット値と完全一致（`game.e2e.mjs`） | iPhone の画面で目視（P3 の完了の証拠） |
| GAME-08 | 自動確認 | 同じ履歴を1・7・16・33・250・999ミリ秒刻みで処理して同じ結果（`engine.test.mjs`）、実時間の差で進む時計（`tests/game/session.test.mjs`） | — |
| GAME-09 | 自動確認 | 1秒95%＋2秒75%で 245/3%（`engine.test.mjs`） | — |
| GAME-10 | 自動確認 | 92・81・87の3棟と4棟目での発見で3棟・86.67%（`engine.test.mjs`） | — |
| GAME-11 | 自動確認 | 警戒の持ち越しと、猶予中の固定（`engine.test.mjs`）。ゲージは猶予中も表示を続ける（`src/app.js`） | 実機で見た目の確認 |
| GAME-12 | 自動確認 | 警戒100で1回だけ発見。接触や光は終了条件にしていない（`engine.test.mjs`） | — |
| GAME-13 | 部分確認 | 段階の境目を往復しても人数が点滅しない（登退場の幅、`session.test.mjs`）。警告音は1.5秒以内に重ねない（`src/audio/mixer.js`） | 実機で見た目と音 |
| GAME-14 | 自動確認 | 84.999%は未達、85.000%は成功（`engine.test.mjs`）。結果画面に丸めの説明を表示 | — |
| GAME-15 | 自動確認 | 1〜14棟の連続と途中の失敗で、段階表どおりの加点（`engine.test.mjs`） | — |
| GAME-16 | 自動確認 | 全50棟100%で 5000＋880＋200＝6080（`engine.test.mjs`） | 正式配点の決定時に再計算 |
| GAME-17 | 部分確認 | 演出の前に結果を確定し、スキップしても結果・クリア点は同じ（`tests/e2e/play.e2e.mjs`）。送信前の再読込でも、起動時に1回だけ送られる（`tests/e2e/online.e2e.mjs`） | クリア直後の再読込は実機で確認 |
| GAME-18 | 部分確認 | 瞬間の成功は0.2秒続いた後に同じ棟で1回だけ。棟の成功（平均85%）とは別に判定（`session.test.mjs`） | 実機で音と表示 |

## 2. 操作・出題・画面

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| PLAY-01 | 自動確認 | 出題番号0〜999の1〜19棟（計19,000棟）がすべて明るさ100%。バーは未開放（`tests/rules/course.test.mjs`、`game.e2e.mjs`） | — |
| PLAY-02 | 部分確認 | タップは位置を直接選び、ドラッグは即時、指を離すと保持（`tests/ui/controls.test.mjs`） | iPhone で操作感 |
| PLAY-03 | 部分確認 | 実際のタッチを2点同時に送り、片方を離す・3本目を置く（`play.e2e.mjs`、CDP のタッチ） | iPhone で2本指 |
| PLAY-04 | 部分確認 | 円外は外周、遠くは保持、戻ると再開。バーの端と遠方（`controls.test.mjs`） | 許容距離の実機調整 |
| PLAY-05 | 部分確認 | 中断・離脱で割り当てだけ解放し値は保持（`controls.test.mjs`）、画面離脱で停止（`game.e2e.mjs`） | アプリ切替・スクロールへの誤移行を実機で |
| PLAY-06 | 部分確認 | 94.5秒でバー解放（位置不変・100%のまま）、95秒で練習を解放（`game.e2e.mjs`、`engine.test.mjs`） | 実機 |
| PLAY-07 | 部分確認 | 解放後の再挑戦で本編のバーは再ロック、練習は解放のまま（`game.e2e.mjs`） | 実機 |
| PLAY-08 | 自動確認 | 同じ番号・版で同じ50色、装飾を作り直しても色順は不変（`course.test.mjs`） | — |
| PLAY-09 | 自動確認 | 全5万棟が帯の条件内、往復一致、全候補を却下しても代替列で終了（`course.test.mjs`）。分布は `docs/tuning/course-stats.md` | 体感の難しさは実機調整 |
| PLAY-10 | 部分確認 | 現在と次の壁を表示、警察は通常は画面外。2026-11-09 から、近づいた警察は主人公の後ろ（左）の同じ歩道の並びに立つ（`src/scene/street.js`、画面の確認） | 長い表示名との重なりを実機で |
| PLAY-11 | 部分確認 | 15言語で主要画面が402px幅ではみ出さない（`tests/e2e/i18n.e2e.mjs`）。練習も本編と同じ操作部品 | 実機の高さ変化・回転・短い画面（402×700） |
| PLAY-12 | 部分確認 | 初回だけ演出と案内、2回目は省略、あそびかたから演出を再表示（`game.e2e.mjs`ほか） | 実機 |

## 3. 練習・音・言語

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| PRACT-01 | 自動確認 | 各3問・かんたん→ふつう→むずかしい・本編と同じ判定（`tests/practice/session.test.mjs`） | 難易度の実機調整 |
| PRACT-02 | 自動確認 | 直前の色・部品位置を引き継ぎ、スキップで正解色へ変えない（`session.test.mjs`） | — |
| PRACT-03 | 自動確認 | 初回成功時間を固定し、最高一致度は問題終了まで更新（`session.test.mjs`） | — |
| PRACT-04 | 部分確認 | 一致度の表示切替（`src/app.js`）。判定基準は変えない | 実機 |
| PRACT-05 | 部分確認 | 3問すべてスキップで答え合わせを経て終了、最後の色と最高値を分ける（`session.test.mjs`、`play.e2e.mjs`） | 実機 |
| PRACT-06 | 自動確認 | 完了した最新2回だけ保存、途中終了で既存を消さない（`tests/storage/resume.test.mjs`） | — |
| PRACT-07 | 部分確認 | 操作後だけ確認、練習は本編の保存・回数に触れない（`resume.test.mjs`、`src/app.js`） | 実機 |
| SOUND-01 | 未実施 | 出来事と音の対応は `docs/sound-events.md`。重複抑制・背景の引き下げを実装。2026-11-09 に曲と効果音を増やした（すべての出来事に音があり失敗しないことだけ `tests/audio/mixer.test.mjs` で確認） | 試聴（聞き分け・連発・音量のつり合い・曲の聞こえ方）。作った時点では誰も音を聞いていない |
| SOUND-02 | 部分確認 | 3音量と消音の保存、0や消音を有効な設定として残す（`src/audio/mixer.js` の `sanitizeAudioSettings`）、音声なしでも続行 | 実機のアプリ切替・試聴 |
| LANG-TEST-01 | 部分確認 | 15辞書の全キー・埋め込み値の一致（`tests/i18n/messages.test.mjs`）、15言語の主要画面の表示（`i18n.e2e.mjs`） | 翻訳の自然さ（各言語の話者による確認）、長いエラー文の実機表示 |
| LANG-TEST-02 | 部分確認 | 保存言語→ブラウザ言語→英語→日本語の順、保存できない端末でも画面内で切替（`messages.test.mjs`、`i18n.e2e.mjs`） | 実機 |
| SHARE-TEST-01 | 部分確認 | 投稿画面のURLを作るだけで自動投稿しない、確認待ちの順位を入れない、開けない時は手動コピー（`messages.test.mjs`、`i18n.e2e.mjs`） | 正式URLでの実機確認（P9） |

## 4. 順位・名前

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| RANK-TEST-01 | 自動確認 | 50棟92.35＞50棟92.34＞49棟99.00（`supabase/tests/kamereoru_ranking.sql`） | Supabase の検証環境で再実行 |
| RANK-TEST-02 | 自動確認 | 各棟の値を保ったまま最後に丸める（75.085%→75.09%、80.004/80.005→80.00）（`engine.test.mjs`） | — |
| RANK-TEST-03 | 自動確認 | 92.341と92.344は同順位、92.345は上（`engine.test.mjs`、`kamereoru_ranking.sql`） | — |
| RANK-TEST-04 | 自動確認 | 1〜29位＋30位3名＝32名、33位は対象外、個人順位は切り出す前に計算（`kamereoru_ranking.sql`、`tests/server/ranking.test.mjs`） | Supabase の検証環境で再実行 |
| RANK-TEST-05 | 自動確認 | 同率1位45名をページ途中の新着でも重複なく全員へ（`ranking.test.mjs`、`tests/ui/record-status.test.mjs`） | 同上 |
| RANK-TEST-06 | 自動確認 | 48/93.50→50/84.20→50/88.70 で最後の1プレイ（`ranking.test.mjs`） | 同上 |
| RANK-TEST-07 | 自動確認 | 0棟は候補外、同じ組の再達成で従来のベストを維持（`ranking.test.mjs`） | 同上 |
| NAME-TEST-01 | 部分確認 | 名前なしでも遊べる（`game.e2e.mjs`）、同名は1枠で本人認証ではないと表示（`src/ui/screens.js`）、別端末からの非公開照会不可（`results.test.mjs`） | 実機 |
| NAME-TEST-02 | 部分確認 | 名前は開始時にプレイへ固定し、未送信・中断プレイは開始時の名前のまま送る（`src/app.js`、`online.e2e.mjs`） | 改名を挟んだ通し試験を実機で |
| NAME-TEST-03 | 自動確認 | ＡＢＣ／ABC、ABC／abc、José／Jose、空白（`tests/names.test.mjs`、`tests/server/start.test.mjs`） | — |
| NAME-TEST-04 | 自動確認 | 家族絵文字・結合文字・各言語の20／21文字。端末とサーバーで同じ結果（`names.test.mjs`、`start.test.mjs`） | Safari と Deno の Unicode 版の違い（下記） |
| NAME-TEST-05 | 自動確認 | 内容は審査せず、改行・方向制御・制御文字・結合文字の大量入力を拒否。名前は文字列として表示（`names.test.mjs`、`src/ui/dom.js`） | — |
| NAME-TEST-06 | 部分確認 | 名前は `<bdi dir="auto">` で行内に閉じ込め、順位・棟数・一致度は左から右の固定表示（`src/ui/ranking.js`、CSS） | アラビア語名を実機で目視 |

## 5. 通信・保存・検証

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| NET-TEST-01 | 部分確認 | 初回＋再試行2回、同じ要求には同じ開始情報、別の秘密は拒否（`tests/net/start.test.mjs`、`start.test.mjs`、`online.e2e.mjs`） | Supabase の検証環境 |
| NET-TEST-02 | 部分確認 | 開始前から通信できない時は選択して対象外で遊ぶ（`online.e2e.mjs`）、受付後の切断でも結果を後送（`online.e2e.mjs`） | 実機の圏外 |
| NET-TEST-03 | 部分確認 | 対象外で始めた後の古い応答を取り付けない（`tests/net/start.test.mjs`、`start.test.mjs`） | 同上 |
| NET-TEST-04 | 部分確認 | 片が欠けている間は受け付けず、再送後に1回だけ確定（`tests/server/results.test.mjs`、`tests/net/outbox.test.mjs`） | Supabase の検証環境 |
| NET-TEST-05 | 部分確認 | 同時再送・順序逆転・応答消失で重複なし、他の記録も処理（`results.test.mjs`、`outbox.test.mjs`） | 同上 |
| NET-TEST-06 | 部分確認 | 未送信2件を残して新規プレイ、回復後にそれぞれ1回（`online.e2e.mjs`） | 同上 |
| NET-TEST-07 | 部分確認 | 受付後に順位取得だけ失敗しても記録は受付済みのまま、順位だけ再試行（`src/app.js` の `pollResult`） | 失敗を起こした通し試験 |
| SAVE-TEST-01 | 部分確認 | 判定中・猶予中・通過前後・20棟付近の保存から同じ時点を復元（`resume.test.mjs`）、再読込から「つづきから」（`play.e2e.mjs`） | 実機の強制終了 |
| SAVE-TEST-02 | 部分確認 | カウントダウン中は時計・入力が止まり、覆いを外さない。復帰だけでは進まない（`game.e2e.mjs`） | 実機のアプリ切替 |
| SAVE-TEST-03 | 部分確認 | 食い違う保存・未知の版を自動で消さずに隔離・案内（`resume.test.mjs`、`session.test.mjs`、`tests/e2e/version.e2e.mjs`） | 実機の強制終了 |
| SAVE-TEST-04 | 部分確認 | 書込拒否・空き不足で、再取得できるものだけ整理、重要な情報は残す。進行中の書込失敗は警告して続行（`resume.test.mjs`） | 実機の容量不足 |
| SAVE-TEST-05 | 部分確認 | 名前だけでは非公開の状況を読めない（`results.test.mjs`）。端末の照会情報を消すと復旧しない設計 | サイトデータ消去を実機で |
| VERIFY-TEST-01 | 自動確認 | 高頻度の操作・同時刻の変更・同値・猶予中の変更を、圧縮前後・Node・QuickJS・Deno で全項目一致（`tests/replay/replay.test.mjs`、`npm run check:engines`） | Safari のエンジンでの照合（下記） |
| VERIFY-TEST-02 | 自動確認 | 1棟の違いが後続の警戒・終了へ及ぶ場合も、初期状態から全体を再計算（`supabase/functions/_shared/kamereoru/replay.ts`、`results.test.mjs`） | — |
| VERIFY-TEST-03 | 自動確認 | 補助だけの違い→正式＋内部記録、順位値の違い→確認待ち、51棟・100%超・時刻逆行・ロック中の明るさ→拒否、合法な高記録→正式（`results.test.mjs`） | Supabase の検証環境 |
| REVIEW-TEST-01 | 自動確認 | 確認待ち複数、期限で処分しない、遅れた承認で旧ベストを下げない、全件を照会（`ranking.test.mjs`） | 同上 |
| REVIEW-TEST-02 | 自動確認 | 再審査は1記録1回・送信元のみ、名前や番号だけでは照会できない（`ranking.test.mjs`） | 同上 |
| CORRECT-TEST-01 | 自動確認 | 訂正で過去の正常記録へ戻り、変更前後・理由・日時を本人に返す（`ranking.test.mjs`）。ホームに「記録が更新されました」 | 同上 |
| DATA-TEST-01 | 自動確認 | 期限整理は正常記録の詳細だけ。確認待ち・初回再審査可能・再審査中は残し、集計・重複防止は消さない。申請と同時でも安全（`ranking.test.mjs`） | 同上 |
| SEC-TEST-01 | 部分確認 | 公開の役割から表・関数を使えない（`supabase/tests/kamereoru_access.sql`）、応答・ログに秘密を出さない（`results.test.mjs`）、秘密鍵をリポジトリに置かない（`tests/repo/source-hygiene.test.mjs`） | Supabase 上で同じ SQL を実行 |
| SEC-TEST-02 | 部分確認 | 接続元ごとの頻度制限、同じ要求の再送は数えない、同名の他人を締め出さない（`start.test.mjs`） | 上限値は実測で調整 |
| VERSION-01 | 部分確認 | 別の版の保存を消さずに残し、その版のページへ案内（`version.e2e.mjs`）。検証処理が持たない版は確認待ちで保護（`results.test.mjs`） | 実際の更新をまたいだ通し試験（P9 の切り戻し試験） |

## 6. 素材・運用・範囲

| ID | 状態 | 確かめたこと（証拠） | 残り |
| --- | --- | --- | --- |
| SCOPE-01 | 保留 | 有償素材なし、出典と使用条件を `assets/credits.md` に記録。主人公は提供されたカメレオン No.28 エディターの書き出し値 `CHAMELEON28` から作成（PR #4 のモデル） | 警察官（No.02）の原画との照合 |
| SCOPE-02 | 部分確認 | 警戒ゲージは猶予中も表示、節目は20（解放）・25（通過）・40・50（`src/app.js`）。100棟時代の節目なし | 実機 |
| SCOPE-03 | 部分確認 | 建物は4つの枠を使い回し、進んでも3回連戦しても描画物体数が同じ（`play.e2e.mjs`） | 実機のメモリ・発熱 |
| SCOPE-04 | 自動確認 | 定期通知・有料サービスなし、期限による審査処分なし（`ranking.test.mjs`、`.github/workflows/ci.yml` は配備しない） | — |
| SCOPE-05 | 部分確認 | 既存の実験場・Supabase を読み取りだけで確認し、他ゲームの表・関数に触れない（`docs/integration-contract.md`、マイグレーションの対象） | 公開前にもう一度読み取り確認 |

## 分かっている限界

iPhone の Safari（JavaScriptCore）は、この環境では動かせません。端末とサーバーの計算が一致することは、V8（Node・Chromium・Deno）とは別のエンジンである QuickJS で、色差の照合値・照合例・出題がビット単位で一致することで代わりに示しました。計算は四則演算と平方根だけで組んでいるため、IEEE 754 に従うエンジンなら同じ結果になるはずですが、Safari での照合は実機で行う必要があります。

名前の文字数（書記素）と未割り当て文字の判定は、実行環境の Unicode のデータに従います。Safari と Deno の Unicode の版が違うと、新しい絵文字や一部の文字の数え方が変わる可能性があります。最終的な判定はサーバー側で行い、端末と結果が違う時はサーバーが整理後の名前を返します（`name_not_normalized`）。

再計算で操作を再現できても、人が操作したことの証明にはなりません（仕様 VERIFY-06）。
