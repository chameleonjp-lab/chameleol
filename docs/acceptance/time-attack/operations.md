# 同系色タイムアタック：本番運用と公開時の確認

この文書は [実装計画](../../superpowers/plans/2026-11-21-chameleol-time-attack-plan.md) T9 の公開・復旧手順です。破壊的な操作や料金が生じ得る定期実行の追加は、明確な事前承認なしに行わない。

## 既存基盤と新規構成
- 既存Supabase: `mlpnjgezrnhdxsxolyzj`、ゲーム `chameleol`
- TA内部モード `chameleol_time_attack`、専用経路 `time-attack-*`
- 正式ゲームURL: https://chameleonjp-lab.github.io/chameleol/
- 実験場詳細: https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack
- 受付は既存の `kamereoru` を更新し、認証トークンの既存設定を引き継ぐ。
- 新設SQLは実際に適用した版 `20261121054659_kamereoru_time_attack_v1_20261121` を使用。旧名称 `20261121090000_time_attack_v1` を別マイグレーションとして再適用しない。
- `private.kamereoru_ta_config.accepting=false` を維持し、段階的に有効化する。

## 公開時の厳格な順序
1. game/labのPRが最新mainと衝突せず、単体・SQL・5組ブラウザ・15言語・実験場検査のすべてが緑であることを確認する。
2. DBの10表、権限、`kamereoru_ta_stats`、`kamereoru_ta_ranking_page`、現在の通常 `kamereoru_stats` を読取照合する。
3. Edge の `time-attack-stats` / `time-attack-ranking` を公開URLから確認し、通常の `stats` / `ranking` も同じ応答仕様であることを確認する。実機またはWebブラウザで、接続元とCORSを確認する。
4. 未処理ジョブ回収の設定は `supabase/operations/time-attack-worker.sql` を参照。秘密はソースに書かず、VaultおよびEdge環境変数に入れる。毎分実行に伴う費用・権限を確認し、事前承認後に有効化する。
5. ゲーム本体 PR #51 を本人がマージ。バージョン付きの公開資源、履歴の旧版再開、キャッシュ更新を確認する。正式URLと既存の本番受付先の組み合わせではタイムアタックを有効とする。停止時は `KAMEREORU_TA_ENABLED=0` を明示する。
6. 1回だけのテスト（別集計の匿名開始／名前あり30棟完走／再送／途中終了／自己ベスト）を行い、確認した試験記録を管理上の規則に沿って扱う。
7. 実験場 PR #57 を本人がマージ。3タブ、TA専用統計、205名超の続き、15言語、同順位を確認する。
8. 完成版のゲームと実験場が同じEdge版・`modeId`・称号表を使用していることを確認する。iPhone17 Pro Safariで縦横、タッチ、画面非表示/再開、X遷移を確認する。

## 問題発生時
- 新しいTA受付だけ停止: `update private.kamereoru_ta_config set accepting=false where id=1;` ただし実行前に対象/影響を確認する。
- TAのホームボタンを無効にし、既存通常モードの導線を維持する。
- 既に受付済みのTAの送信・確認・順位閲覧は継続する。TA表や履歴、通常のデータを消してはならない。
- Edge v7の導入により通常モードに問題が起きた場合は、v6への切戻し前にTAの送信待ちを確認する。v6はTAを受付けないため、TA未送信を取り残す切戻しは避ける。
- 公開手順の途中の状態と復旧時の確認をPR #51・#57に記録する。

## 毎分ジョブの費用と秘密

毎分の処理は、検証待ちや再試行できる記録がある場合だけ受信処理を呼ぶ。通常の結果確定はゲームからの送信を契機とする。

Vaultで生成する256ビットの署名鍵はデータベースに置く。HTTPの待ち行列には、検証処理の呼び出しにだけ使える短時間の署名を載せる。データベースの接続権限がある役割は `pg_net` の待ち行列を読み得るため、署名鍵やプロジェクトの管理キーをHTTPに渡さない。

公開ビルドでは、読み取りだけ公開する段階で `KAMEREORU_TA_AVAILABLE=1` と `KAMEREORU_TA_ENABLED=0` を指定する。開始ボタンを有効にする公開で `KAMEREORU_TA_ENABLED=1` を指定する。公開前に `node scripts/check-ranking-release.mjs --time-attack <ランキング受付URL>` で両モードの読み取りを確認する。

新規受付を初めて有効にすると、タイムアタックの匿名開始通知も受けられるようになる。以後、新規の名前あり予約を止めても、オフラインの端末から遅れて届いた匿名開始通知を受け付ける。開始の再送には最初と同じ開始番号を使う。
