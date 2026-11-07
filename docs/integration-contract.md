# 既存の実験場・サーバーとの接続契約（カメレオる）

2026年11月7日に読み取りだけで確認した結果と、それを踏まえたカメレオるの接続方法を記録します。計画書 P5 の1つ目の作業と、受入試験 SCOPE-05「他ゲームのデータや契約を無断変更しない。未調査を接続済みとしない」に対応します。この確認では、Supabase の本番データベースにも実験場のリポジトリにも、何も書き込んでいません。

## 確認したもの

実験場のリポジトリ `chameleonjp-lab/chameleonjp_lab` は、コミット `70bfea7fbf856dbc139f2ef90b2a641db646d693` を読みました。計画書が参照したカタログと同じコミットです。言語の定義は、サイノメ `chameleonjp-lab/sainome` のコミット `82055351bf8c8b0bae3fa3e00172325eff1d0237` の `js/language-options.js` と照合しました。

Supabase は、接続中の組織にあるプロジェクト `chameleonJP-Lab`（参照名 `mlpnjgezrnhdxsxolyzj`、PostgreSQL 17）を、表と関数の一覧・件数の集計・列名の読み取りで確かめました。

| 確かめたこと | 結果 |
| --- | --- |
| 実験場カタログ `catalog/games.json` | 38件。カメレオるの項目はない |
| `public.games` のゲーム登録 | 62件（有効45件）。`game_slug` や `title` に「kamere」「カメレオ」を含む行はない |
| `private` と `public` のカメレオる用の関数 | 0件 |
| 既存の受付方式 | `submission_mode` は `shared` と `verified` の2種類 |
| 他のゲームの作り | Akerun・トマトクなどは、`private` に専用の表を置き、専用の Edge Function から使う。匿名の役割（anon）は表を読めない |
| 既存の Edge Function | `tomatoku-competition`、`sainome-ranking`、`akerun-competition`、`slime-trial-submit`。いずれも JWT の検証なしで公開している |

カメレオるの「識別値（`game_slug`）」は、まだどこにも登録されていません。実験場の共通基準（`docs/chameleonjp-lab/11_ranking_integration_standard.md` ほか）が求めるマニフェストやゲーム登録は、計画書 P9 のとおり「実験場への新規登録は個別の依頼で扱う」ため、この変更では作りません。

## 共通基準とカメレオるの仕様が違う点

実験場の共通の受付（`start_game_play_v1`、`submit_score_idempotent_v1` など）は、名前ごとの1つの整数スコアを受け取る作りです。カメレオるの仕様は、次の点でこれと合いません。そのため、共通の表や関数を流用せず、カメレオる専用の表と関数を用意しました。

1. 順位は「通過棟数」を先に比べ、同じ棟数なら「平均一致度の小数2桁」で比べます。1つの整数に詰めることはできますが、自己ベストの選び直しや訂正の記録まで共通の表で表すことはできません。
2. 終了結果は、サーバーで出題と操作履歴から再計算して確かめます。共通の受付は、端末が送った値をそのまま記録します。
3. 名前は任意で、同じ名前の記録は別の人でも1つの枠にまとめます（仕様 NAME-02）。2026年10月31日の共通仕様は「同名の別人を統合しない」としているため、ここは仕様の採用内容が違います。カメレオるの要件仕様書を優先します（仕様 0章「他ゲームの共通仕様を、カメレオるで明示採用した内容へ無断で上書きしない」）。
4. 確認待ち・拒否・再審査・訂正を、送信元の端末だけが見られるようにします。

## カメレオるの接続方法

ブラウザは Edge Function `kamereoru` だけを呼びます。Edge Function は Supabase が自動で設定するデータベース接続（`SUPABASE_DB_URL`）で、`private` スキーマの `kamereoru_` で始まる関数を呼びます。表は行ごとのアクセス制限を有効にし、公開クライアントの役割（anon・authenticated）には表も関数も渡しません。これは他のゲームと同じ形です。

| 入口 | 役割 | 主な照合 |
| --- | --- | --- |
| `POST start` | 名前ありの開始受付 | 同じ要求番号・同じ送信元の秘密には同じ内容を返す |
| `POST launch` | プレイ回数（本編を実際に始めた時） | `launchId` ごとに1回。名前ありは開始受付と秘密を照合 |
| `POST abandon` | 予約だけで中止 | 回数に入れない |
| `POST chunk` / `POST complete` | 終了結果の分割送信と完全受付 | 1開始1結果。片の位置・総数・長さ・指紋を固定 |
| `POST status` / `POST review` | 記録の状況照会・再審査の申請 | 送信元の秘密の照合値で確かめる |
| `GET ranking` / `POST rank` | 順位表のページ・登録名の順位 | 公開してよい項目（名前・棟数・平均一致度・順位）だけ |

関数とエラーの約束は `supabase/migrations/20261107120000_kamereoru_v1.sql`、入口の入力検査は `supabase/functions/_shared/kamereoru/handlers.ts` にあります。開始回数の数え方は計画書 P5 の「開始回数の数え方」に合わせています。

## まだ決まっていないこと

| 項目 | 状態 | 決める工程 |
| --- | --- | --- |
| 本番への適用 | 未適用。適用は利用者の承認を得て、独立した作業として行う | P9（`docs/release/release-and-rollback.md`） |
| 実験場トップ・詳細ランキングへの掲載 | 未登録。`game_slug`、マニフェスト、`public.games` の行が必要 | 個別の依頼 |
| 正式URL・共有URL | 未定。架空の本番URLは置いていない | 公開工程 |
| Edge Function の配備設定 | `--no-verify-jwt`、`KAMEREORU_IP_SALT`、`KAMEREORU_ALLOWED_ORIGIN` を設定する案 | P9 |

公開前には、この表の確認をもう一度行い、確認日とコミットを書き換えます。
