# 音改善・現行GitHub統合記録

取得・検証日: 2026-11-12 UTC（依頼文作成日は11月13日）。Node.js v24.22.1 / npm 11.9.0。

## 出典と取り込み

AはGitHub `chameleonjp-lab/chameleol` の `d5286bcb4405ee24fb8fa1bc17a5ec501e45d777`。新規cloneで未コミット変更なし、未マージPRなし、専用ブランチ `codex/integrate-audio-v5` を作成。AGENTS.mdなし。mainへpushしない。

BはDrive資料04を復元した公開版5 / 資源版`0.1.0-f25f4a9ee1`。資料07の309ファイルのサイズ・SHA-256が一致。記録された`9c4a6ebad65414e4f659537d28f4bc3a93a1f55c`はGitHub APIで422（No commit found for SHA）。そのコミットを取得・checkoutしたとは扱わない。

CはBに資料13をgit apply --check/applyで適用したもの。資料12の対象8ファイルとバイト単位で一致。資料12/13/14のSHAは依頼文と一致。資料15は指定IDのMarkdownを説明資料として読み、実装は12/13の実物を使用。Drive原本の更新なし。[sources.json](sources.json)に取得日時・URL・識別値、[restoration.json](restoration.json)に照合結果。

A/Bは全追跡ファイルを比較。音コア・操作の5ファイルは変更前A=B。app/streetにはBの後続修正があり、各差分を確認して適用。Aにしかないファイルを削除せず、演出80のモデル・アクション・HUD・ライフサイクル等を保持。

前提として取り込んだもの:

- RULES_V2、20〜25棟の増加50%・26〜30棟80%（減少不変）、GameSessionの規則選択、旧v1の保存/履歴/再生互換。版/保存形式/コース生成/採点/色/名前/記録の識別は維持。
- 静止ガイドの自動進行・表示位置(sceneT)、4段階再練習、15言語の壁ラベル、廃止済み進む/省略の削除。
- 停止設定の重複防止、言語保存と再開カウントダウンの競合防止、現行ホームモデル、練習時の立ち位置。
- 共有コード生成物の同期、公開buildの規則v2表示、linkedomの固定依存と対応する既存e2e更新。

音改善: 5段階の伴奏、21棟からpad/arp、31棟からcounter、41棟から+2半音。11/21/31/41の節目音、40棟の街の節目を分離。46〜50の各突入音。独立期待一覧の既存24+追加11イベント、押下/移動/通常解放/取消の区別、準備遅延/失敗と画面変更、予約音/実発音/重要音保護、停止・再開位置・破棄・消音処理。

統合レビューで追加修正:

1. 本編開始時に前の曲の予約を停止（単発SEは維持）。
2. 静止ガイドの同値再描画ではドラッグ音の累積基準を消さない。
3. 練習結果保存待ち後に画面世代と練習要求を検査し、古い結果/音で画面を奪回しない。
4. ガイド練習の停止・完了操作をcanvas前面へ配置し、途中でもガイド一覧へ戻れるボタンを追加。

[統合版8ファイルの識別値](integrated-files.json)はCの識別値と別管理。追加回帰試験を含むため同一ZIPとは扱わない。

## 公開状態

既存Sites project: `appgprj_6af0df6df7b481918c8c3599aeae8fb1`、public、owner権限、version5。ライブURL: https://chameleonjp-kamereoru.chameleonjp.chatgpt.site 。HTTPとChromiumで起動・資源版・commit・production/API空を確認。ライブは未変更。

Sitesのcurrent_preview_urlはnull。利用可能ツールを調べたがdeploy系はすべてproductionで、ドラフトの実行URLや環境ポート公開機能は提供されていない。save-onlyは保存であり実行URLではない。よって**今回修正版のiPhone確認URLは未準備**。localhostや既存ライブを修正版として案内しない。新しい本人限定サイトを作る場合は別途承認が必要。

GitHubには試験用CIだけがあり、Sitesへの自動配備連携は確認できない。今回CIへ単独動作buildとActions配布物保存だけを追加し、配備・新公開先作成・秘密の発行は行わない。mainマージだけでは既存ライブは更新されない。

## マージ後の反映手順（公開作業者向け）

1. ユーザーがPRをmainへマージ後、対象merge SHAのソースを取得しCI成功を確認。
2. Sitesの既存project IDとaudience=publicを再確認。既存のSitesソースリポジトリへ同期するにはSitesの短期書込認証取得が必要。その発行/同期/公開は今回未実行。認証発行が必要な段階で対象と理由を示し承認を得る。別Sitesを作らない。
3. 既存ライブの`release.json`、keptVersionsの各版releaseとfilesを取得・SHA照合し旧資源を保持。今回取得した5版325ファイルは[live-dist-verification.json](live-dist-verification.json)で照合済み。
4. 同期後のSites source HEADを記録し、その同じ状態から `KAMEREORU_ENV=production KAMEREORU_STANDALONE=1 KAMEREORU_PUBLIC_URL=https://chameleonjp-kamereoru.chameleonjp.chatgpt.site npm run build -- --keep <既存dist>` を実行。APIは空、ランキング・実験場へ接続しない。Sites source SHAとGitHub merge SHAの対応を記録。
5. `.openai/hosting.json`と`dist/`をtarへ梱包。release.jsonの規則v2・commit・assetVersion・keptVersions・全hashを検査。Sites save_site_versionに**Sites source branch HEADと一致するcommit_sha**およびarchiveを渡す（GitHubのSHAを無条件に流用しない）。保存した版だけを既存projectへdeploy_site_version。これはライブ変更なのでマージ後の明示的な反映操作として扱う。
6. deployment成功と既存URLのrelease/起動を確認。旧版ファイルと公開版5の保存版IDを保持し、必要時はその保存版を再配備して戻す。

Actionsの`chameleol-standalone-<sha>`成果物はそのCI checkoutのソースから作られ、release.jsonで識別できる。PR CIは合成merge SHAになることがある。成果物は新資源一式で、ライブ配備前に旧版保持が必要。

## iPhoneでの確認（修正版URLが用意された後）

同じChatGPTアカウントで確認URLを開き、確認URL配下の`release.json`を開き、assetVersionとcommitが案内された値に一致することを確認（設定画面には版表示なし）。通常練習2種とガイド1〜4でタップ/ドラッグ/2本指/戻るを試す。本編の停止・再開、音量0から復帰、別アプリへ移動して戻る、音量バランス・音割れを確認する。現時点の既存ライブでこの修正の合否は判断できない。

ブラウザ自動試験はChromiumのタッチ対応viewport。モック音声は発音要求/予約の検査であり聴感ではない。物理iPhone17 Pro/Safariの音量・音割れ・OSのアプリ切替後復帰・実聴は未確認。


## 確定ソースから作成した配布物

ソース `e7ae32f56aaafa9def75d2df0b8d118b2cbd0713` を独立worktreeでビルド。資源版`0.1.0-73d1e4527b`、production、API空、規則v2、旧5版保持。`chameleol-audio-e7ae32f.tar.gz`は3,001,373 bytes。SHA-256は`44da7bc93fcfa3808c746ac73dae6278213943dd37a4c3a16762aeffba72c5df`。[distribution.json](distribution.json)に検査結果。これはライブ未配備の配布物で、Sitesへ直接保存する前には前述のソースHEAD照合が必要。
