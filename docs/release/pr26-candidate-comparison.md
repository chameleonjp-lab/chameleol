# PR #26：現行本番と配布候補の比較

2026-11-17。[現在の実装・検証状況](../acceptance/pr26/completion-task4/evidence.md)を先に確認する。本票は現行本番の取得結果と、文書作成時点で候補作成時に守る条件を記録する。候補作成・最終CIの後続結果はPR本文・Checks・最新配布物の同梱記録を正とする。文書作成時点では新候補の公開は行っていない。

## 版の照合

| 項目 | 現行本番（公開HTTPとSites version 5で照合） | PR #26候補 |
| --- | --- | --- |
| URL | https://chameleonjp-kamereoru.chameleonjp.chatgpt.site/ | オンライン候補URLは未用意。左の本番URLを候補扱いしない |
| commit | `9c4a6ebad65414e4f659537d28f4bc3a93a1f55c` | 最終ビルドの `release.json.commit` で確定。文書作成時点の製品検査基準は `6ae869694ba64e3ab5634814f243228b3e29e377`、検査headは `63d7835812a5890260daf9d415b27904706cacf0` |
| assetVersion | `0.1.0-f25f4a9ee1` | 未確定。最終ビルドの `release.json.assetVersion` で確定 |
| 新規単独プレイの規則 | `kamereoru-rules-v2` | 現行コードの単独設定では `kamereoru-rules-v4`。v4選択はPR #26より前の実装 |
| 対応規則 | 本番の新規単独プレイはv2 | v1〜v4を保持。ランキング優先v3、単独既定v4 |
| 接続先 | API指定なし | `KAMEREORU_STANDALONE=1`、API指定なしを維持する |
| 保存形式 | `kamereoru-run-v1` / `kamereoru-result-v1` | 同じ形式、DB_VERSION=1を維持 |
| 版別フォルダ | 現行1版＋旧4版 | 左の全5版と新候補を保持する |

本番の入口 `index.html` のSHA-256は `90b501317de75a631c055900a72d05bbc69a62ca51198a55a033d70c054adad2`。公開版の5版、合計324資源の指紋を照合した。ゲームが本番でどう動くかをiPhoneで実測した記録ではない。

## 今回の変更と累積の差

PR #26の開始main `52a6be5aed194baf55e3ba4d77d286b90bab72bd` から翻訳実装 `4668329` までの `src/rules`、`src/storage`、`src/net`、`supabase`、`package.json`、`package-lock.json` に変更はない。新しい見た目・通常接続・共有画面・翻訳を加えても、今回のPRで採点規則や保存形式、送信処理は変更していない。

ただし、現行本番は開始mainより古い。現行本番のsrcと `4668329` の比較では同一30・変更43・追加35・削除0ファイルであり、過去のPRによる `net/outbox`、`net/start`、規則、保存の差も含む。本番から候補への全差分を「見た目だけ」「通信処理がすべて同一」とは記載しない。単独v2からv4への選択と5種類のボーナスも、この累積差として確認する。

PR #26自体は、輪郭・舌・街・警察・精密札、27称号・結果画像と任意パネル、PNG共有・保存を通常経路へ接続し、96採用/4除外と15言語をそろえる。全体の検査結果と限界は[現在状況](../acceptance/pr26/completion-task4/evidence.md)を参照する。

## 候補へ必ず残す5版

| assetVersion | commit | 規則 |
| --- | --- | --- |
| `0.1.0-f25f4a9ee1` | `9c4a6ebad65414e4f659537d28f4bc3a93a1f55c` | v2 |
| `0.1.0-0a170c0573` | `05637cb1372870348b5f5e5bd9f6d971c92f26ed` | v1 |
| `0.1.0-11b6b4435c` | `6b47fa0c2f44ede7667992fe5245e3fd320a6af9` | v1 |
| `0.1.0-3f76c8df26` | `2c70efc5dca2488f4464c65564c0cc0761de6dad` | v1 |
| `0.1.0-6de2bc05c7` | `009d19a49f28d3e3de058584bb5dbe799af935f9` | v1 |

候補作成は取得・照合済みの本番一式を `--keep` に渡す。既存データを消さず、候補の `release.json.keptVersions` と各旧フォルダの指紋を確認する。最終commitを推測して版名を書かず、ビルド後に入口の `kamereoru-commit` / `kamereoru-asset-version` と `release.json` を照合する。公開先が違う候補は共有URLも確認する。本番用のcanonical URLが埋め込まれているだけでは、候補がそのURLで配信された証拠にならない。

## 戻し方の限界

[現行の切り戻し手順](release-and-rollback.md)に従い、版別フォルダを残す。旧本番v2の入口には、未知の規則の途中保存から保存時assetVersionの入口を案内する処理があるが、実サイトでv4の途中保存→v2入口へ戻す→新候補の版別入口で再開、という操作は未実演である。未送信結果の保護・再送も含め、完全な切り戻し成功とはしない。

新しい開始の見た目を戻す場合も、v4を読める現行の保存・未送信保護処理を残した版を先に準備して確認することを推奨する。旧バイナリへ入口だけ戻す案とは分けて判断する。今回、公開入口・データベース・実験場は変更していない。
