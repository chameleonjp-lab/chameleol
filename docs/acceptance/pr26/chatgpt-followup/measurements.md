# PR #26：ChatGPT受入修正後の測定

基準：`455c1495a12fe2f7dda08b1f6f6e7925a8a9e569`。最新headのCIはPR本文を参照する。
自動Chromium（SwiftShader・倍率1）の測定と、iPhone実機の確認を区別する。

## 手元の確認

| 対象 | 結果 |
| --- | --- |
| 全単体 | 最終レビュー修正後718件：687成功・失敗0・既存SQL専用31skip |
| 独立レビュー | 計画C0/I3/M3を全反映。コードC0/I1/M0、旗以外の装飾を変えない測定へ修正。レビュー担当の対象43成功 |
| 製品の再現 | 未定義キー、予熱後の実claim不可、旗の縦画面配置不可、水と柱の交差を修正前に確認 |
| 手元ブラウザ | Chromiumがsocket EPERMで起動不可。未実施を合格にしない |
| 本番・実機 | マージ/公開/本番DB操作は未実施。iPhoneの音・性能・保存・共有・VoiceOverは未確認 |

## 記録の読み方

`*-first-grace.json`は各棟直前800msを16ms刻みで進め、grace最初のフレームだけを記録した実舞台の配置可否。部品用のsettle後1500msの画像とは別の値である。

`*-real-midpoint.json`と`*-real-midpoint-delivery/static.png`は本物のcontroller・保存claimによる中間旗。旗の可視画素差はatlas67の実インスタンスだけを隠し、他の装飾を維持して測る。実投影枠8px、旗の差分10画素以上、壁/胴不一致0、壁遮蔽1.5%以内をassertする。

`combined-renderer-peak.json`は負荷用の合成入力で、旧prop群・リング・粒子・店内・3羽と舌を同時に描いた値。抽選やプレイでの発火の証拠ではない。

## 未解決

R07/Q07の鳥の条件付き非表示、R11/Q09の舌と胴4px、R09の足元の箱に対する−10pxと設計6pxの差を残す。今回の単体・ブラウザ成功だけでF12/G2/G5を合格にしない。

## CI #80と実測結果

[CI #80](https://github.com/chameleonjp-lab/chameleol/actions/runs/44046124259)は上記製品基準で全6ジョブ成功。
単体718件中687成功・失敗0・SQL専用31skip、SQLは別工程32/32、QuickJSは16照合成功。
ブラウザは4組で52/52、37/37、37/39（既存CL02の画像生成用任意2件skip）、137/137、合計263成功・失敗0・任意2件skip。今回追加/補強した検査にskipは無い。standalone build/成果物保存も成功。

| 実舞台の最初grace | 踏切 | 水 | ロボット | 鳥 |
| --- | --- | --- | --- | --- |
| 402×700 | 49/49 | 48/49 | 49/49 | 0/49 |
| 402×874 | 49/49 | 0/49 | 49/49 | 5/49 |
| 874×402 | 49/49 | 48/49 | 49/49 | 0/49 |

| 実中間旗（自己ベスト25） | 描画開始 | delivery提供/描画 | static撮影 | 旗だけの可視画素 |
| --- | --- | --- | --- | --- |
| 402×700 | 125632ms | 93/93フレーム | 127120ms | 249 |
| 402×874 | 125632ms | 93/93フレーム | 127120ms | 371 |
| 874×402 | 125632ms | 93/93フレーム | 127120ms | 234 |

元は縦画面のdeliveryが始まらなかったが、修正後は3寸法とも既存反応の後、126500ms未満に開始。実インスタンスの四隅、旗の画素外接枠とも8px内側を確認した。壁/胴の不一致0、壁の遮蔽1.5%以内も成功。

旧最大＋舌の実測は、95000ms/100000msの両場面で追加描画11回・形13個・画像1枚（上限12/16/4）。店内・3羽・成功リング・粒子・双眼鏡と保持中の舌が実際に出ることもassert。合計の計算だけで合格にしない。

## 回収して目視した画像

[原本のCI証拠画像artifact](https://github.com/chameleonjp-lab/chameleol/actions/runs/44046124259/artifacts/14312775538)。2026-11-17、修正後の水・静止旗・配達の3寸法、計9枚を回収して目視。静止旗が切れず、自己ベスト旗と別の位置にあること、水源が柱の左へ離れ、渦が手前の歩道にあることを確認した（自動描画の画像であり実機ではない）。選択した9枚とJSON7件を本フォルダに保存した。

| 寸法 | 実配達 | 実静止旗 | 水の部品例（強制表示） |
| --- | --- | --- | --- |
| 402×700 | [配達](images/402x700-real-midpoint-delivery.png) | [旗](images/402x700-real-midpoint-static.png) | [水](images/402x700-E067-render-only.png) |
| 402×874 | [配達](images/402x874-real-midpoint-delivery.png) | [旗](images/402x874-real-midpoint-static.png) | [水](images/402x874-E067-render-only.png) |
| 874×402 | [配達](images/874x402-real-midpoint-delivery.png) | [旗](images/874x402-real-midpoint-static.png) | [水](images/874x402-E067-render-only.png) |

水の画像は部品の見え方を検査する合成の場面。特に402×874では最初graceで0/49のため、実際に開始する証拠にしない。実プレイの可否は上の最初grace表を使う。描写と条件付き非表示を混同しない。


CI #80のstandalone成果物は[artifact 14311084697](https://github.com/chameleonjp-lab/chameleol/actions/runs/44046124259/artifacts/14311084697)、production設定・assetVersion `0.1.0-fbc95eedcc`・112ファイル。checkoutのmerge refは`1a56168a72cf9542d028aac60d4257d873ad9104`で、PR head 455c149とは区別する。成果物の保存は配備・公開ではない。
