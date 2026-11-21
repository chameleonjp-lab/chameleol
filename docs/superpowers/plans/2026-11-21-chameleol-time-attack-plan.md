# 同系色タイムアタック 実装計画書

> For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan, or `superpowers:executing-plans` for a separate execution session. Track work with the checkboxes below. The user has requested this documentation PR; implementation and production rollout are subsequent work.

**Goal:** 同系色モードで30棟の公式タイムを競い、既存Supabase内の専用表と実験場の専用タブへ正しく反映する。  
**Architecture:** 色変換だけを既存コードから共用する。TA専用の判定・履歴・進行・保存・受信処理を加え、現在の `kamereoru` サーバーから専用表へ送る。  
**Tech Stack:** JavaScriptのモジュール、既存のThree.js/代替描画、端末内保存、SupabaseのPostgreSQLとDeno、Node.jsの試験、Playwright。  
**Spec:** [完成版要件仕様書](../specs/2026-11-21-chameleol-time-attack-spec.md)（TA-01〜TA-54、A01〜A18）。  
**Review:** [敵対的検証・反映記録](../../reviews/2026-11-21-chameleol-time-attack-review.md)。  
**更新日:** 2026年11月21日（日本時間）。この文書のチェック項目は実装作業であり、文書PRの時点では未実施。

## 1. Global Constraints — 全工程で守る値

| 項目 | 固定する契約 |
| --- | --- |
| 作品とモード | 作品 `chameleol`、通常 `main`、TA `chameleol_time_attack`。既存の `kamereoru` 識別子は変更しない |
| TAの版 | `kamereoru-time-attack-rules-v1` / `kamereoru-time-attack-course-v1` / `kamereoru-time-attack-history-v1` / `kamereoru-time-attack-result-v1` |
| 判定 | 30棟、明度は15棟目から、色と必要な明度が同時に95%以上で連続500ms。条件外れ・停止で保持0 |
| 時計 | 操作可能時間だけが公式 `elapsedMs`。停止を除く履歴 `t` は操作＋移動。移動29回×2000ms。完走時 `t = elapsedMs + 58000` |
| 記録 | 元のmsで15000以上を確認後、公式csを切上げ。タイム昇順、同csは同順位1,1,3。同順位行は `official_at,play_id` 順 |
| 称号 | 基準15000ms、最上位3500cs以下。以後10秒区切り、最後59500超〜60000cs。58称号。10分超は有効完走・称号なし |
| 出題 | H中心0/12000/24000±1500・100刻み、S5000〜10000・250刻み。V1〜14は10000、15以降5000〜10000・250刻みで前目標との差1000以上。次色は前目標との一致90%未満 |
| 保存・公開 | 同じSupabaseプロジェクト `mlpnjgezrnhdxsxolyzj`。専用の `private.kamereoru_ta_*`。既存通常・殿堂入り・他ゲームの表や件数を変更しない |
| 開始・送信 | 準備予約0回、実際の開始1回、匿名も1回。名前ありかつ正式予約・開始・検証済み30棟だけを公開。専用の平坦な `time-attack-*` 経路を使う |
| 画面と互換 | はじめる直下の同系色ボタン。実験場3同階層タブ。15言語。既存の通常保存/ルールV1〜V5/殿堂入りを維持。通常の50棟を30棟へ変更しない |

数値や名称を変える場合は、仕様書・この計画・試験・版情報をまとめて更新する。実装担当の判断で「似た条件」に置き換えない。

## 2. 調査基点と責任範囲

| 対象 | 固定して読んだ版・場所 | 今回わかったこと |
| --- | --- | --- |
| ゲーム | `chameleonjp-lab/chameleol` / `6a2a4a5f59a53618fefcdebbbfc193396775e790` | 通常の棟進行は5秒固定、進行保存はmain枠。専用処理が必要 |
| 実験場 | `chameleonjp-lab/chameleonjp_lab` / `9a5b5fedd03b61b52ed619c54183bf400025f9ae` | ゲームの `release.json` から `rankingApi` を解決し、通常と殿堂入りを取得している |
| Supabase | `chameleonJP-Lab`、PostgreSQL 17、読取時 `ACTIVE_HEALTHY` | 通常用 `private.kamereoru_*`、殿堂入り関連表を確認。TA表なし。適用履歴の最新関連項目は `hall_of_fame_separate_ranking` |
| 自動確認 | ゲーム `.github/workflows/ci.yml`、両repoの `package.json` | ゲームはNode 22、使い捨てPostgreSQL 16、5組のブラウザ処理と統合 `test`。実験場はNode 24とChromium/WebKit |

実装開始時に最新mainとの変更差と本番の構造を再確認する。Supabaseに適用済みの変更は、リポジトリのSQLファイル名と時刻が一致しないものもあるため、履歴の名前だけで二重適用しない。今回の資料PRはゲーム側に1件作り、実装ではゲーム側・実験場側の変更をそれぞれのPRに分けて依存関係を記載する。

## 3. Review Focus — 実装レビューの重点

| 失敗の種類 | 所有する工程 | 必須の反例 |
| --- | --- | --- |
| 時計・保持・移動の誤り | T1,T4,T5 | 499→停止→1ms、同時刻に条件外れ、1999ms移動、移動中停止、30棟後の余分な移動 |
| 集計・保存の混在と二重処理 | T2,T3,T4 | 10並行再送、旧版の通常経路、通常の途中保存あり、同じIDの違う本文 |
| 完走の捏造・検証の食い違い | T1,T3,T8 | 14999ms、短い履歴を自動延長、移動省略、改変結果、古い検証担当の遅い確定 |
| 自己ベスト・順位・称号の不一致 | T2,T6,T7 | 同csで元msが違う2記録、名前変更、205名の続き、10分超、前回ベストの称号 |
| モード追加による通常機能の後退 | T0,T5,T7,T8,T9 | 通常50棟/旧保存/殿堂入り、15言語、公開物への新JS入れ忘れ、TAだけの切戻し |

## 4. 実装順と並行してよい範囲

T0で基点と接続契約を固定し、T1の判定とT2の保存を進める。T3で受信を接続した後、T4の端末保存・開始処理を実装する。T5の画面とT6の結果は、T1/T4の契約が確定した段階で並行できる。T7の実験場はT3/T6の公開応答と称号が確定してから接続する。T8で全体を確認し、T9で段階公開する。

| 工程 | 成果物 | 前提 |
| --- | --- | --- |
| T0 | 接続・版・形式の固定と変更前の記録 | この仕様の確認 |
| T1 | 専用ルール、色候補、履歴、時間・称号関数 | T0 |
| T2 | 専用10表、自己ベスト参照、順位版、権限 | T0の契約 |
| T3 | 専用受信・再計算・状態応答 | T1,T2 |
| T4 | 端末進行、開始成立、保存、再送 | T1,T3 |
| T5 | ホーム、操作、2秒移動、停止、描画 | T1,T4 |
| T6 | 簡単な結果、58称号、共有、翻訳 | T1,T4 |
| T7 | 実験場タブ・全順位・専用統計 | T0の形式,T3,T6 |
| T8 | 全体試験・敵対的再検証・配布候補 | T1〜T7 |
| T9 | 本番への反映・公開確認・切戻し | T8の合格記録と公開の依頼 |

## 5. 共有する具体的な契約

### 5.1 判定・進行・画面の間

新規の `src/rules/time-attack/v1/` はブラウザ・サーバーのどちらでも動く純粋な処理にする。日時、画面、保存、乱数の直接取得を中に入れず、入力として受け取る。`config.js,color.js,course.js,engine.js,history.js,time.js,titles.js,index.js,manifest.js` に責任を分ける。色変換は既存 `src/rules/v1/color.js` とその依存だけを呼ぶ。通常の `engine.js/history.js` は呼ばない。

| 接続口 | 渡す内容・返す内容 |
| --- | --- |
| `generateTimeAttackCourse(seed)` | seedから `family` と30件の整数HSVを返す。各系統候補配列の並びはHのoffset昇順→S昇順。明度候補は昇順。公平な整数抽選を使い、端数の偏りを避ける |
| `createTimeAttackState(course)` | 未開始の状態を作る。初期色は白、棟1、保持0、時間0 |
| `applyTimeAttackEvent(state,event)` | 時刻を先に進め、次に同時刻のseq順でイベントを適用する。次の境界をまたいだ無断進行は拒否し、状態と発生した境界を返す |
| `replayTimeAttack(payload)` | 全イベントを明示終端まで処理し、終了理由、30棟達成、移動回数、elapsedMs、elapsedCs、family、titleIdを再計算する |
| `formatTime(elapsedCs,locale)` / `titleForTime(elapsedCs)` | ゲーム・結果・共有の共通処理。称号IDは `ta.title.01`〜`58`、10分超はnull |
| 表示用状態 | `modeId,phase,building,clearedCount,elapsedMs,holdMs,colorMatchUnits,brightnessMatchUnits,brightnessEnabled,currentColor,targetColor,travelElapsedMs,scenePosition`。停止時・移動時の `targetColor` はnull |

状態は `prepared / active / await_travel / travel / await_ready / paused / cleared / quit` を区別する。preparedは開始後の初回表示待ちで時計0、await_travelは棟成立後の移動表示待ち、await_readyは2秒移動後の次目標表示待ちとする。この3つの待ち状態では履歴t・公式時計を増やさない。500ms成立でawait_travelへ入り、同じtのtravelイベントで移動を始める。2000msでawait_readyへ入り、同じtのreadyで次目標を公開する。pausedは停止前の状態と移動進捗を持ち、明示的な再開までready/travel/inputを実行しない。30棟目の成立は直接clearedへ進む。初回ready前の非表示はpreparedのまま待ち、履歴に偽のreadyを作らない。

表示の `scenePosition` は判定時刻÷5000から作らず、棟番号と2000ms移動の進み具合から作る。通常描画の引数を壊さない任意のTA表示設定として渡す。TA開始前の説明に本番目標を出さない。

### 5.2 履歴と終端

履歴は `{format,modeId,rulesVersion,generatorVersion,seed,family,events,end}`。イベントは `{seq,t,kind,...}`、seqは0から1ずつ増加、tは非減少の整数。同時刻のイベントを保持する。performance.now()の小数を保持した累積時計を使い、各deltaを個別に切り捨てない。履歴へ出す時だけ累積値を整数化する。境界で使った時間だけを累積し、停止・表示準備へ除外した余りを次の棟へ持ち越さない。安全な時刻範囲を守るため、公式操作時間の最大値は `9007199254740991 - 58000 = 9007199254682991`、対応cs最大は `900719925468300` とする。

| kind | 内容と許す状態 |
| --- | --- |
| `ready` | `{building}`。最初はseq0,t0,building1。以降は直前の移動開始t+2000で次棟を公開する境界。途中の停止はtを増やさない。移動完了前・二重・順番飛ばしを拒否 |
| `input` | `{h,s,v}`。整数H0〜35999、S/V0〜10000。activeだけ。棟1〜14のVは10000。実際に受けた値と順を保存。移動中/停止中の値変更はログへ記録せず、受信されたら不正として拒否 |
| `travel` | `{fromBuilding}`。1〜29棟目が500ms成立した正確なtに1件だけ。ここから移動時計を始める。成立前/未成立/重複/30棟目のtravelは拒否 |
| `pause` / `resume` | pauseはactive/await_travel/travel/await_readyからだけ、resumeはpausedからだけ。保持を0へ戻す。pause/resume間でtを増やさない。移動中は進捗を残す |
| `end` | `{reason:cleared\|quit}`。最後の1件。clearedは30棟目の成立時刻のみ、quitは未完走。後続イベント・終端値不一致・終端なしは登録不可 |

`ready`より前の同時刻inputは拒否、`ready`後ならその棟の入力として受理する。500ms到達と同時刻のinputは、先に前の色で成立を確定するため、新棟の入力にはしない。クライアントは棟切替でポインター/キーの押下状態を解放し、遅れて届いた旧画面の操作を落とす。

棟の保持と移動は境界の時刻へ切り詰める。例えば1棟目がt600で成立した場合、travelはt600、次readyはt2600。表示準備の遅延や停止をこの2000msへ混ぜて短縮せず、未表示の次棟へ余剰時間を積算しない。完走のendでは `end.t = elapsedMs + 58000` を必須にする。quitのendでは、実行済み移動（完了分と移動途中の実行分）の合計を使い、`end.t = elapsedMs + executedTravelMs` とする。1棟目の5秒quitなら移動0でt=5000となる。

### 5.3 専用テーブル・順位版

変更を記録して再現できる追加SQL（マイグレーション）を `supabase/migrations/20261121090000_time_attack_v1.sql` に作る。実装時に同名が既にあれば、適用済みファイルを編集せず新しい時刻のファイルを作り、計画の対応先も更新する。構造の責任は次の10表に固定する。

| `private.kamereoru_ta_` に続く名前 | 主な内容・制約 |
| --- | --- |
| `config` | 1行。新規受付の可否、対応版、履歴保存期限、順位版保存期限。通常configとは別 |
| `starts` | request_id主キー、play_id/launch_id一意。secret_hash、開始時のdisplay_name/name_key、seed、family、各版、予約時刻、予約状態。取消墓標もこの表で管理 |
| `launches` | launch_id主キー、名ありのplay_id一意参照、ranked、開始時のモード・版・系統、受信時刻。削除や結果の成否で開始回数を減らさない |
| `result_claims` | play_id主キー、result_id一意。最初に総片数・総長・全内容SHA-256を固定。同じplayへ別結果不可 |
| `uploads` | (play_id,chunk_index)主キー。片内容・長さ・指紋。再送の一致検査 |
| `results` | play_id主キー、result_id一意、受付と検証状態、終了理由、棟数、elapsed_ms、elapsed_cs、family、official_at、検証所見。正式値はサーバーのみ更新 |
| `jobs` | play_id主キー、状態、lease期限、attempts、claim_token。期限切れ担当による遅いfinalizeを拒否する |
| `audit` | 状態変更・再審査・取消・整理・管理訂正の履歴。秘密値や公開不要のログを公開しない |
| `ranking_versions` | 版番号、作成時刻、行数。最新と直近24時間の版を保持する |
| `ranking_rows` | (version,position)主キー、rank、name_key、display_name、play_id、elapsed_cs、family、title_id、official_at。順位版の不変の行 |

`private.kamereoru_ta_bests` は正式・30棟完走・名あり結果から作る参照用一覧（view）とする。名前ごとに `elapsed_cs,official_at,play_id` 昇順の先頭1件を選ぶ。順位の `rank` はelapsed_csだけで決め、同順位内の `position` はofficial_at,play_idで決める。通常のbests/clears/clear_ordinalsを参照しない。

新しい自己ベストや管理上の取消が発生した取引の中で、TA専用のロックを取り順位版を再作成する。同値や遅い記録では自己ベストを置き換えない。複数名/同名の同時確定でも古い一覧を最新にしない。古い版を読む限りは最後まで同じ並びを返し、24時間を過ぎて削除済みなら先頭の新しい版へ置換する。最新の版は24時間を超えても保持する。

すべてのTA表で行単位のアクセス制限（Row Level Security）を有効にし、公開・ログイン利用者の直接権限を取り除く。内部関数の呼出権限も限定し、`security definer` を使う場合は空の `search_path` とスキーマ名付き参照を使う。これらはTAオブジェクトに限定し、他ゲームの権限を一括変更しない。[Supabase公式の権限説明](https://supabase.com/docs/guides/database/postgres/row-level-security)と[関数の権限説明](https://supabase.com/docs/guides/database/functions)を根拠にする。

### 5.4 受信経路・状態・再送

サーバーの共通入口は公開版 `release.json.rankingApi` の値を使う。そこへ以下の平坦な経路名を足す。`/time-attack/start` は旧ルーターが末尾のstartを通常用として解釈するため使わない。通常の `launch` へmode項目だけを足して送る方法も使わない。

| HTTPと経路 | 入出力と保存関数の責任 |
| --- | --- |
| POST `time-attack-start` | requestId,launchId,secret,name,supportedRulesVersions,gameVersion。`kamereoru_ta_start` が予約。応答はmodeId,playId,seed,family,rulesVersion,generatorVersion,acceptedAt,expiresAt:null |
| POST `time-attack-abandon` | requestId,secret。`kamereoru_ta_abandon` で未開始予約を取消。startより先に届いた取消も同じsecret_hash付き墓標として残し、遅いstartを復活させない |
| POST `time-attack-launch` | launchId,modeId,ranked,版,系統、名ありはplayIdとsecret。`kamereoru_ta_launch` は一致する再送だけ受け、異なる本文は409。予約の取消・別モードを拒否 |
| POST `time-attack-chunk` | playId,resultId,secret,index,total,length,sha256,chunk。`kamereoru_ta_put_chunk` が固定された結果へ片を保存 |
| POST `time-attack-complete` | playId,resultId,secret。`kamereoru_ta_accept` が全片と開始通知を確認し、resultsとjobsを同じ取引で作る。開始通知待ちは再送可能な `launch_required` |
| POST `time-attack-status` | playIdsと各secret。`kamereoru_ta_status` が所有者の状態と公式time/titleを返す。推測したplayIdだけで読ませない |
| POST `time-attack-review` | playId,secret。rejected状態に対して1回だけ再審査を要求。端末から正式timeを訂正できない |
| GET `time-attack-ranking` | limitは1〜100、versionとafterは両方または両方なし。`kamereoru_ta_ranking_page` が版・行・nextAfter・nameCount・restartedを返す |
| POST `time-attack-rank` | 正規化するname。`kamereoru_ta_rank_of` が本人名の公開ベストと順位を返す。通常の殿堂入り除外を行わない |
| GET `time-attack-stats` | `kamereoru_ta_stats` がtotalPlaysとparticipantCountを返す。totalPlaysはlaunches件数、participantCountは正式なbestsの名数 |
| POST `time-attack-process` | サーバーの定期処理専用。256ビットの専用秘密を照合して最大5件を処理。公開キーだけの要求は401/403。応答にプレイヤーや生ログを含めない |

予約状態は `reserved / launched / abandoned`。結果状態は既存の表示処理と合わせて `verifying / official / no_rank / pending_review / rejected / under_review` とし、まだ結果を受けていなければ `not_received` を返す。officialは名あり検証済み30棟、no_rankは検証できた途中終了など順位対象外。端末の `local_only / uploading` は表示用であり、正式状態ではない。各応答にmodeIdを付け、クライアントは通常用の応答を成功として採用しない。

公開行は `{position,rank,name,elapsedCs,family,titleId,officialAt}`、集計は `{modeId,totalPlays,participantCount}`、順位ページは `{ok,modeId,version,rows,nameCount,nextAfter,restarted}`。versionは整数、afterは最後のpositionを使う。同順位のrankをカーソルへ使わない。playIdやname_keyは生の公開行へ不要なので公開しない。

履歴再計算は `kamereoru_ta_claim_jobs` → `kamereoru_ta_job_input` → `kamereoru_ta_finalize`。claim_tokenとleaseを確定時にも照合し、古い担当が再取得後の結果を上書きしない。タイムの整合は `elapsedMs + executedTravelMs <= receivedAt - acceptedAt + 5000` も補助的に検査する。executedTravelMsは再計算から得て、clearedなら58000、quitなら実行済みの分だけとする。acceptedAtはサーバーの予約時刻、receivedAtは完全な結果の最初の受理時刻とし、遅延し得るlaunchの受信時刻を使わない。検証待ち時間で判定を変えない。

送信上限は全体のUTF-8で8MiB、64片、200000イベント。端末側で検知して記録を切り詰めず、ranking対象外の理由を残す。10分を超えたことだけで不受理にしない。再送の待ち方と期限、受付停止中の既開始結果の扱いは§5.7に固定する。

### 5.5 端末保存・開始境界

TAは別の端末内データベース（IndexedDB）名 `kamereoru-time-attack` を使う。新規 `src/storage/time-attack-store.js` と `time-attack-memory-store.js` に、starts/launches/outbox/records/runs/kvをまとめ、通常DB `kamereoru` にはTAの行を一切書かない。TAの進行枠はruns/time-attack、ベストはkv/timeAttackLocalBest。旧版タブの通常flushが全件を読んでもTA行を取得できない構成にする。

同じ画面で操作するゲームを1つにし、モード切替時は前の入力/描画を止める。TA内ではownerとgenerationで古いタブの更新を拒否する。通常のruns/mainとlocalBestはそのまま残す。旧版の別タブを新しいロックで強制停止できるとは保証せず、TA行の読取/誤送信/削除を保存先分離で防ぐ。

開始は「予約 → 描画と説明の準備 → 表示可能を確認 → 開始保存を確定」の順。attemptIdとownerEpochを準備から保存完了まで引き継ぐ。保存直前に表示可/取消なし/所有者一致を確かめ、取消やhiddenが保存確定より先に処理されたら取引を中止して0回とする。保存確定が先に成立した場合は論理的な開始1回とし、直後のhiddenは開始済み停止、取消は途中終了とする。確定済みlaunchを後から削除して0回へ戻さない。

保存完了時にもattemptIdとownerEpochを照合し、古い開始処理が新しい画面を開かないようにする。最初のreadyまではpreparedで時間0、目標非表示、操作不可。表示可能で必要な再開操作が済んでから、readyを記録して目標表示・入力許可・計時を開始する。ready前に終了した場合はlaunchのみを残し、終端のない履歴をcompleteへ送らない。保存確定直後に再読み込みしても起動後に同じlaunchを再送する。

保存失敗は開始未成立として説明する。保存できないまま続ける明示操作をした場合は、同じ開始規則をメモリ内で実行し、回復できない未送信件数があることを表示する。途中から永続保存に切り替わってもlaunchIdを変えない。

終了時はまず今回結果と送信待ちをTAの同じデータベース内の取引で保存し、画面の確定時刻を凍結する。送信は専用launch→chunk→complete→status。再読み込み後はTAの途中再開を提示せず、開始通知と完成結果の再送だけ続ける。共通の「つづきから」は通常保存だけを扱う。結果に固定したdestination,modeId,requestId,launchId,playId,resultId,各版は再送で変えない。

### 5.6 マニフェストと実験場

ゲームの `ranking-manifest.json` にTA entryを加える。通常のroot-level `play_count` / `submission` は変更しない。TAは以下の値を持つ。

```json
{
  "mode_id": "chameleol_time_attack",
  "display_order": 61,
  "game_slug": "chameleol",
  "top_ranking_type": "best",
  "score_order": "asc",
  "score_unit": "秒",
  "score_scale": 100,
  "score_decimals": 2,
  "score_label": "クリアタイム",
  "first_score_label": "初回クリアタイム",
  "best_score_label": "最速タイム",
  "score_min": 1500,
  "score_max": 900719925468300,
  "ranked_results": ["cleared"],
  "play_count": {"count_at": "start", "rpc": "kamereoru/time-attack-launch", "idempotency": true},
  "submission": {"rpc": "kamereoru/time-attack-complete", "automatic": true, "idempotency": true, "timeout_ms": 8000},
  "ranking_rpc": "kamereoru/time-attack-ranking",
  "stats_rpc": "kamereoru/time-attack-stats"
}
```

これは実装予定の契約であり、現在のv1形式に最後の4項目を無断追加してよいという意味ではない。先に実験場の形式定義へ任意項目を追加し、`submission_mode=verified` の専用モードだけに許す。無指定なら従来のroot設定を使う。1文書内のmode_idを一意にし、TA経路が通常用を指さない検査を加える。

同一代表game_slugの専用モードでは、保存・受付・並び・単位をmode_id別に照合することを連携標準へ追加する。通常のpublic.games行を時間用へ変更せず、別作品行やカタログ行も追加しない。score_maxは上記の技術上限であり、60000csではない。

実験場readerは `release.json.rankingApi` と `release.json.timeAttack.available` を確認し、専用の `timeAttackStats()` / `timeAttackPage(previous)` を提供する。`previous` に取得元API・version・nextAfterを保持する。応答型、modeId、非負の安全な整数、family、titleIdを検査する。全体の接続先が変わった場合は新しい先頭へ置き換える。

タブの外部値は `tab=time-attack`、内部値は `timeAttack`、要素IDは `timeAttackTab` / `timeAttackPanel` とする。game=chameleolの場合のみ解釈し、選択をURLへ反映する。availableは受信契約と表示部品の提供有無、enabledは新規TAボタンの公開可否とし、別々に扱う。通常/殿堂入り/TAは各取得状態を独立させる。トップカードと詳細上部の既存統計は通常モードと表記し、TA統計は専用パネルに置く。

### 5.7 期限と公開停止の契約

既存コードには予約や未送信結果を日数だけで自動失効させる処理がないため、TA第1版でもその方式を引き継ぐ。TAの新規受付停止は新しい名前あり予約だけを止める。既存予約の再送、開始通知、結果送信、状態確認、順位閲覧を停止しない。経過時間が10分を超えたことを不受理理由にしない。

| 対象 | 第1版の具体値・動作 |
| --- | --- |
| 予約前/取消済み | 取消墓標はrequestIdとsecret_hashを保持。後から来た同じ予約は復活させない。別の挑戦は新しいID |
| 予約済み/開始済み/完走送信待ち | 日数だけでは失効しない。対応ルールと重複防止情報を保持し、元のIDで再送。新規受付停止後も既存分は受ける |
| 通信 | 1要求8000ms。開始予約は初回＋2回、待ちは700ms/1600ms。同じ要求IDを使う。以後は利用者の再試行で継続 |
| 送信待ち | 接続回復・起動時・手動再試行で再開。通信失敗は1,2,4,8,16,32,60秒の上限付き待機、以後60秒。非表示/オフライン中は連続送信しない。409等の確定不一致を無限再送しない |
| 検証job | lease60秒、通常処理2件/内部process5件。例外の3回目でpending_review、1〜2回目はlease後再取得。claim_tokenによる遅い確定拒否はTAで新設 |
| 再審査 | rejectedに対して本人から1回だけ要求でき、under_reviewへ進む。pending_reviewは管理確認待ちとし、本人再審査の入口にはしない |
| 詳細本文の整理 | 30日経過後、official/no_rank/再審査申請済みrejectedの詳細履歴だけ整理。pending_review/under_review/未申請rejectedは期間だけで消さない。開始台帳・集計・指紋・重複防止・監査は保持 |
| 順位版の整理 | TAの補完設計として最新＋作成から24時間以内を保持。最新は削除しない。失効版は先頭へ置換。これは通常の「最新-50より前かつ15分超」と別の専用設定 |

頻度制限は接続元を伏せた識別値ごとの10分窓で、予約30回、launch300回、chunk3000回、status600回、閲覧1200回。新規予約だけを予約枠へ加算し、同じrequestIdの再送は新規扱いしない。TAは `ta:*` 区分を使い、通常モードの枠を消費しない。status1要求は最大50件。429ではサーバーの待ち時間を守る。これらの10分窓はプレイの制限時間ではない。

片はUTF-8の128KiB以下で端末から分け、受信上限160KiB、1要求200KiBとする。JSON全体のバイト長と解読後のイベント数を別々に検査する。日本語名を含むため文字数とバイト数を混同しない。元の実装には文字数ベースの制限もあるが、TAはここでUTF-8バイトへ統一する。

complete/statusは検証2件を促進する。これに加え、Supabaseの定期実行（pg_cron）とHTTP呼出し（pg_net）で、job名 `kamereoru-ta-process-every-minute` を毎分（`* * * * *`）実行し、time-attack-processで最大5件を処理する。これにより全利用者が画面を閉じても、期限切れleaseを回収する。

専用の256ビット秘密をEdge Functionの `KAMEREORU_TA_WORKER_SECRET` とVaultの `kamereoru_ta_worker_secret` に設定し、`X-TA-Worker-Secret` ヘッダーで照合する。値をソース・公開版・ブラウザ・通常ログへ含めない。旧processの公開条件を流用しない。認可失敗や秘密未設定では処理せず、ブラウザから送れる公開キーだけでは通さない。

公開用の設定は新規 `supabase/operations/time-attack-worker.sql` と `docs/acceptance/time-attack/operations.md` に記録する。構造のマイグレーションと分け、使い捨てPostgreSQL 16の試験でpg_netが必須にならないようにする。2026年11月21日の読み取りではpg_cronとVaultは存在し、pg_netは未導入だったため、T9で導入と権限を確認する。HTTP待ち行列やVaultの秘密を公開・ログイン利用者が読めないことも確認する。[公式の定期呼出し説明](https://supabase.com/docs/guides/functions/schedule-functions)を参照する。

管理者は定期実行の成否とTAの未処理最古時刻を確認し、失敗が続けば新規開始だけを止める。新規開始を止めてもjob処理は止めない。詳細整理と順位版整理は認可した内部処理で一日一回実行し、対象はTAオブジェクトに限定する。再送契約を維持できない撤去やルール削除は、この第1版の通常の切戻し手段にしない。

## 6. 実装工程

### T0 — 現在地・接続・形式を固定する

**対象:** ゲーム `docs/integration-contract.md`, `docs/release/release-and-rollback.md`。実験場 `docs/chameleonjp-lab/11_ranking_integration_standard.md`, `docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json`。証拠は新規 `docs/acceptance/time-attack/preflight.md`。

- [ ] 両repoの最新main、未マージの関連変更、接続先release、既存SupabaseのTAオブジェクト不在/既存構造を読み取りで照合し、基点SHAと確認範囲を保存する。
- [ ] §5の時刻・結果・各経路・版・期限を実装担当と照合し、追加の公開モードを扱う形式定義と連携標準を先に作る。
- [ ] 通常/TA同一game_slug、別mode_id・別経路が通り、旧形式も通る形式試験を実験場に新設する。重複modeと通常経路へのTA指定は拒否する。
- [ ] 新規開始の公開を無効にした初期設定と、ゲーム→実験場の依存関係を記録する。通常の元の件数や順位応答は集計だけを記録し、個人の生ログを保存しない。

**確認:** 実験場 `node --test scripts/test-ranking-manifest.mjs`（新規）と `npm test`。仕様A18を所有。古いREADMEの未公開記述を本番状態の根拠にしない。

### T1 — 専用の出題・判定・履歴・時間を作る

**新規:** `src/rules/time-attack/v1/{config,color,course,engine,history,time,titles,index,manifest}.js`。  
**変更:** `scripts/sync-shared.mjs`, `scripts/cross-engine-check.mjs`, `scripts/deno-replay-check.ts`。共有生成先は `supabase/functions/_shared/kamereoru/rules/time-attack/v1/`。

- [ ] 仕様の全651候補と明度候補を生成し、条件に合う候補から選ぶ。各系統の候補不足なし、赤の折返し、固定seedの同一性を確認する。
- [ ] §5.1〜5.2の状態・イベント処理を作り、95%と500ms、15棟目、移動2000ms、停止・復帰・最終終了を実装する。
- [ ] ms→cs、共通時間表示、58称号を作り、全称号境界・10分超・安全整数境界を確認する。開始/移動/停止を含む正解履歴と不正履歴を固定データとして用意する。
- [ ] 同期対象と共有指紋へTAを加え、Node/QuickJS/Denoで同じ出題・時間・結果を返す確認を追加する。通常V1〜V5の共有コードは変更しない。

**試験ファイル:** 新規 `tests/rules/time-attack.test.mjs`, `time-attack-course.test.mjs`, `time-attack-titles.test.mjs`, `tests/replay/time-attack.test.mjs`, `tests/replay/fixtures/time-attack-*.json`。既存 `tests/repo/shared-sync.test.mjs` を拡張。

**確認:** `node --test tests/rules/time-attack*.test.mjs tests/replay/time-attack.test.mjs` → `npm run sync` → `npm run check:engines`。A02〜A06,A08,A10に対応。前の履歴形式の自動延長と同時刻圧縮を使わないことをレビューで確認する。

### T2 — 専用表・自己ベスト・順位版・権限を追加する

**新規:** §5.3のSQL、`supabase/tests/kamereoru_time_attack.sql`。既存の適用済みSQLは編集しない。  
**使う契約:** TA各版・modeId・整数time・name_key。**提供する契約:** §5.4に対応する `private.kamereoru_ta_*` 関数と公開応答の値。

- [ ] 10表とbests view、必要な一意制約・外部参照・値制約、状態変更関数を作る。正式timeの列へブラウザから値を直接入れられないようにする。
- [ ] 開始/結果の同一ID再送、相違本文409、取消墓標、完全受信とjobの同時登録、leaseとclaim_tokenの確定照合を作る。
- [ ] 同名ベスト選択と順位1,1,3、全順位スナップショット、24時間の版保持・失効時置換、専用集計を作る。順位更新を同じ取引で直列化する。
- [ ] 表と関数の権限をTAだけに設定する。anon/authenticatedの直接操作拒否、サービスからの許可経路、通常集計・殿堂入りが変化しないことをSQLで確認する。

**確認:** `npm run test:sql`。空の使い捨てDBで全マイグレーションを順に適用し、TA SQL試験を実施する。並行10開始/10完了、同名2完走、205名・同順位境界・版失効を含める。A09,A10,A12,A13,A17を所有。本番DBでは試験記録を投入しない。

### T3 — 専用受信とサーバー再計算を接続する

**新規:** `supabase/functions/_shared/kamereoru/time-attack-handlers.ts`, `time-attack-replay.ts`, `tests/server/time-attack.test.mjs`。  
**変更:** 同階層 `handlers.ts`、必要な共通配線のみ `supabase/functions/kamereoru/index.ts`、`scripts/deno-edge-smoke.mjs`, `scripts/local-api.mjs`。

- [ ] 平坦な専用経路を専用handlerへ渡し、通常ルーターと通常SQLを通さない。未知のTA経路は通常の末尾名へ戻さず拒否する。
- [ ] 正式start応答、取消・launch、片の一致検査、complete、status/rank/stats/rankingを§5.4へ合わせる。秘密照合・件数/本文サイズ・頻度制限を適用する。
- [ ] 同期したTA規則で再計算し、終端・2秒移動29回・完走の元の15000ms下限・公式cs・系統を検査する。検証jobを60秒のleaseとclaim_token付きで処理し、失敗/再取得/再審査を§5.7の状態に合わせる。
- [ ] 並行再送・片欠落/差替・別モード/別名・通常への誤送信・短い偽履歴・古い予約再送・上限・古いclaim_tokenを拒否する試験を作る。利用者通信をすべて止めて検証担当を中断し、定期処理から期限切れleaseを再取得して確定する試験を追加する。通常の受信/順位/殿堂入り試験も実行する。

**確認:** `npm run test:sql`、`npm run smoke:edge`。Deno側でも新しい経路を実際に通す。A08〜A12,A17に対応。`npm test`でDB試験がskipしたことをSQL合格と数えない。

### T4 — 端末進行・開始成立・送信待ちを分離する

**新規:** `src/game/time-attack-session.js`, `src/net/time-attack-start.js`, `src/net/time-attack-outbox.js`, `src/storage/time-attack-store.js`, `src/storage/time-attack-memory-store.js`。  
**変更:** `src/app.js`の開始/再送配線。通常のstore/outboxはTA行を扱わず、既定動作を保つ。必要な共通処理だけ純粋なヘルパーとして抽出する。

- [ ] performance.now()を基に§5.2の履歴tを作る。描画・入力・visibility・手動停止を共通の更新入口へ通し、時間加算やログ追記より前に前回確認済み更新との差を調べる。差が1000ms超なら未観測分を足さずその時点のtで自動停止する。入力も確認済み更新に含め、すでに記録したtへ巻き戻さない。同じ1002msを16.7ms×60と501ms×2で与えても結果が一致する時計試験を作る（各更新は1000ms以下とし、自動停止の試験とは分ける）。
- [ ] 予約・取消・描画準備・開始成立を分け、§5.5の保存確定を開始の境界にする。確定前/後のhiddenと取消、確定直後再読み込み、ownerEpoch変更、遅いstart応答を固定順序で検査する。
- [ ] TAの別DBに保存枠・自己ベスト・送信待ちを追加し、通常main枠を保つ。結果と送信待ちをTA内の同じ取引で保存し、同画面の排他とTA所有者判定を実装する。固定基点の旧版タブと新TAタブを同時に動かし、旧版がTA行を読取/送信/削除しないことを確認する。
- [ ] オフラインと起動後の再送を専用経路へ流す。開始→結果の順序、同じ宛先/ID保持、8秒の通信期限と再試行、容量超過や保存失敗の説明を実装する。途中TAは再読み込みで再開しない。

**試験:** 新規 `tests/game/time-attack-session.test.mjs`, `tests/storage/time-attack.test.mjs`, `tests/net/time-attack.test.mjs`。既存 `tests/storage/resume.test.mjs`, `tests/net/start.test.mjs`, `tests/net/outbox.test.mjs`を回帰確認。

**確認:** `node --test tests/game/time-attack-session.test.mjs tests/storage/time-attack.test.mjs tests/net/time-attack.test.mjs` と `npm test`。A01,A05,A06,A09,A11に対応。物理的な画面描画と端末保存を完全に同時にできるとは主張せず、開始成立という状態境界と失敗時の戻し方を固定する。

### T5 — 入口・操作画面・2秒移動を組み込む

**新規:** `src/ui/time-attack-game.js`。  
**変更:** `src/app.js`, `src/ui/controls.js`（必要な接続のみ）, `src/ui/game.css`, `src/scene/stage.js`, `src/scene/street.js`。

- [ ] はじめる直下のボタンと開始説明を追加し、TAの棟数・現在時間・500ms保持状況を表示する。通常用の警戒とボーナスをTAへ表示しない。
- [ ] 15棟目に明度操作を解放し、全入力方式でactiveだけを受け付ける。移動・停止・終了時はreleaseAll等で押下状態を解放する。
- [ ] scenePositionと2000msの移動を接続し、現在以外の目標を3D/代替描画の両方で隠す。停止中は現在目標も覆う。低い描画頻度と「動きを減らす」でも時計条件を変えない。
- [ ] 通常の未完走保存がある場合の開始・ホーム復帰、14→15棟目、29→30棟目、移動中の非表示・再開をブラウザで通す。先読みできる比較見本や隣棟が残っていないか画像で確認する。

**試験:** 新規 `tests/ui/time-attack.test.mjs`, `tests/e2e/time-attack.e2e.mjs`。必要に応じ `tests/scene/stage-mode.test.mjs`, `tests/e2e/comparison-surfaces.e2e.mjs` を拡張。

**確認:** `node --test tests/ui/time-attack.test.mjs`、`node --test --test-concurrency=1 tests/e2e/time-attack.e2e.mjs`。A01,A04〜A07,A16。402×700、402×874、874×402で画像を残す。

### T6 — 簡単な結果・称号・共有・15言語を作る

**新規:** `src/ui/time-attack-result.js`, `src/ui/time-attack-share.js`。  
**変更:** `src/i18n/messages/`の15言語、`src/app.js`の結果接続、必要な `src/ui/game.css`。

- [ ] モード・今回time・今回titleを主表示にし、自己ベスト/送信状態を補助表示する。途中終了を完走へ見せない。
- [ ] 58称号と時間単位・新画面文言を15言語へ追加する。日本語の称号IDと境界は仕様表に一致させる。10分超は30棟完走の表示にする。
- [ ] もう一度/TAランキング/X共有/ホームを接続する。共有は今回csの記録・モード名・固定ハッシュタグ・正式URLだけ。匿名完走も共有できる。
- [ ] 35.00/35.01/600.00/600.01秒、自己ベストより遅い今回結果、登録待ち・不受理・名無しで、timeと称号と共有が一致することを確認する。

**試験:** 新規 `tests/ui/time-attack-result.test.mjs`, `tests/ui/time-attack-share.test.mjs`、既存 `tests/i18n/messages.test.mjs`を拡張。A08,A11,A15,A16。

**確認:** `node --test tests/ui/time-attack-result.test.mjs tests/ui/time-attack-share.test.mjs tests/i18n/messages.test.mjs`。Xの投稿は自動確定せず、生成したintent本文とURLまでを試験する。iPhoneでの投稿画面への遷移はT8で確認する。

### T7 — 実験場に同階層タブと専用統計を追加する

**リポジトリ:** `chameleonjp-lab/chameleonjp_lab`。  
**変更:** `ranking.html`, `chameleol-ranking.js`, `i18n/ranking.js`, `index.html`の通常統計ラベル、`docs/chameleonjp-lab/02_ranking_detail_page.md`。T0のschema/標準更新と組み合わせる。

- [ ] readerにtimeAttackStats/timeAttackPageを追加し、専用経路・modeId・整数time・版と取得元を検査する。通常のrankingParticipantCountや殿堂入り除外は流用しない。
- [ ] 3同階層タブ・専用件数・順位/名前/time/自己ベスト称号/系統を表示し、tab=time-attackを扱う。0件/読込/失敗/再試行をTA内で完結させる。
- [ ] 100件ずつの続きと版失効時の置換、取得元変更、同順位の境界を実装する。名前はtextContent/bdiで表示し、HTMLとして連結しない。
- [ ] ゲーム側を正本として新規 `scripts/export-time-attack-titles.mjs` から15言語の58称号・ID・cs境界を出力し、実験場の新規 `i18n/chameleol-time-attack.js` に生成物を保存する。生成元commitと内容の指紋も記録し、手で別の称号表を作らない。翻訳読込順と `scripts/build-pages.mjs` の公開対象へ追加する。

**試験:** 既存 `scripts/test-chameleol-ranking.mjs`, `scripts/test-chameleol-browser.mjs`, `scripts/test-lab-i18n.mjs`, `scripts/test-build-pages.mjs` を拡張。新規 `scripts/test-time-attack-titles.mjs` を `package.json` のtestへ接続。

**確認:** `npm test` → `npm run build` → `npm run test:browser`。最初のブラウザ準備は `npx playwright install --with-deps chromium webkit`。205名を100+100+5で読み、101位以降とページ跨ぎの同順位を確認する。幅360/402/430/640px、874×402横向きも確認。A12〜A16。作品カードが1枚のままであることを試験する。

### T8 — 全体確認・再レビュー・配布候補をまとめる

**変更:** `scripts/build.mjs`, `src/config/runtime.js`, `ranking-manifest.json`, `scripts/check-ranking-release.mjs`, `scripts/smoke-release-ranking.mjs`, `tests/release/build.test.mjs`。  
**証拠:** 新規 `docs/acceptance/time-attack/verification.md`, `docs/acceptance/time-attack/acceptance.md`。

- [ ] releaseへ `timeAttack:{available,enabled,rulesVersion,generatorVersion,historyFormat,resultFormat}` を追加し、旧通常の版情報を残す。マニフェストのモード設定と公開物の内容を照合する。
- [ ] ゲームの `npm test`, `npm run test:sql`, `npm run check:engines`, `npm run smoke:edge`, `npm run test:e2e`, `npm run build` と、T7の実験場確認を実行する。追加e2eが既存5組のCIにも含まれることを確かめる。
- [ ] 実装から独立した担当がReview Focusの5群とA01〜A18を再検証し、Critical/Important指摘を修正する。合格した項目と未実施を区別し、同じ最終コミットで再確認する。
- [ ] iPhone 17 Pro Safariで縦横・タッチ・画面ロック・2秒移動・15棟目・完走・共有画面・TAランキングを確認する。端末を利用できない場合は代行ブラウザを実機合格と呼ばず、公開条件に残す。

**公開候補の確認:** テスト用の隔離したデータで名無し開始、名あり完走、再送、通常の殿堂入り名によるTA参加、10分超完走を通す。本番のプレー回数を試験のために増やさない。差分にはコード、SQL、同期待ちなしの共有コード、翻訳、検証証拠を含める。

### T9 — 順序を守って公開し、TAだけを戻せるようにする

**対象:** 両repoの実装PR、既存Supabase内の追加SQL/Edge Function、ゲーム公開版と実験場公開版。  
**前提:** T8の必要な確認が合格し、本番公開の依頼があること。本書の文書PRだけで本番へ書き込まない。

- [ ] 追加SQLをTA新規受付無効で適用し、専用handlerを配備する。§5.7のpg_net・秘密・毎分処理・日次整理を設定し、秘密なし拒否と、利用者通信なしの再処理を確認する。既存通常経路と新TA読取経路の応答・権限・既存集計の維持を読み取り確認する。
- [ ] ゲームの `release.json` をavailable=true,enabled=falseで公開し、実験場の対応を公開する。両側の接続先と版・modeId・タブ・読取が揃うことを確認する。
- [ ] TA新規受付とゲームのenabledをtrueにし、ボタンを有効化する。正式URLからの接続・開始/結果の再送・通常とTAの統計分離を確認し、公開版のcommitと受付版を記録する。
- [ ] 問題時はTA新規受付とボタンを無効化し、既に受けた結果の送信・状態照会・順位閲覧を維持する。追加表を削除せず、通常版・通常データを戻す作業と混ぜない。

**確認:** 実装用の `check-ranking-release` を通常/TA両方に拡張し、正式URLから読めることを調べる。ゲームと実験場の称号生成物の指紋、公開候補と本番の配布物の指紋を確認する。切戻し時も予約済みの再送契約を破らない対応版を残す。

## 7. 完了の判断

実装の完了は、必要ファイルを作ったことだけでは判断しない。A01〜A18の証拠、専用表と経路の整合、両サイトへの接続、通常の回帰、iPhone確認、公開した版の一致が揃った状態で判断する。一方、このPRの完了範囲は、仕様・敵対的レビューの反映・具体的な実装計画・PR提出までである。

公開後に新しい性能や不正記録の課題が判明した場合も、過去の開始回数や正式記録を無断で初期化しない。ルール変更は別版、記録取消や訂正は理由が残る管理経路で行う。
