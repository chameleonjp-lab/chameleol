# ブラウザ検証（今回の統合コード）

実施日: 2026-11-12 UTC。Node v24.22.1、Playwright 1.63.0、Linux Chromium（`/usr/bin/chromium`）。タッチ有効のモバイルviewportを使用。物理iPhone、Safari/WebKit、音を耳で聞いた確認ではない。

## 追加統合試験

`tests/e2e/audio-integration.e2e.mjs` の最初の5試験を実行し **5成功・0失敗・0skip**（356.4秒）。ログ `browser.log`。続けて第6試験（ガイド各段階の完了前の戻る、保持中の指入力をpauseで取消し）を名前指定で実行し **1成功・0失敗・0skip**（19.1秒）。ログ `browser-guide-exit.log`。追加統合試験は合計6件成功。

- 402×874、402×700、874×402でホーム→通常練習2種（各3問と結果）→ガイド4段階→本編開始→停止→再開→50棟結果→ホーム。静止ガイドは実際の目印タップで自動完了。動くガイドは実時間で完了。停止、完了後の段階選択、戻るは実クリック。
- 各サイズのパレット・明度バー・終了・pause・戻ると結果表示が操作可能。長いホームと結果は縦スクロールで到達できることを検証（全ボタンの同時表示は要求しない）。主要画像を目視でも確認し、通常練習・ガイド・本編・pauseに操作を妨げる重なりがないことを確認。
- 単発タップ、同じ色への再タップ、ドラッグ、2本指、CDP touchCancel、明度ロック、音量0→復帰を実DOM/WebAudio接続で検証。音の呼出名は実mixerを呼ぶラッパーで記録。聴感の検証ではない。
- 音準備中の別練習選択・ホームへの遷移、描画準備中のホーム遷移、音準備失敗後の通常/ガイド練習起動。遅延/失敗は実ブラウザ内でPromiseの解決・拒否を制御した試験。

短時間で同じ状態を再現するため、明度練習の解放フラグと最終出口直前への移動のみfixtureを使用。最終出口は250秒の実プレイ全体を再現したという意味ではない。開始・入力・停止・再開・結果・復帰は実画面を操作する。

初回試験でガイド練習の完了ボタンとpauseがWebGLキャンバスに覆われる問題を検出。位置だけでは見つからず、実クリックで失敗した（`browser-initial.log`）。操作レイヤーを修正して全サイズで再検証した。初回の短縦/横ホーム試験はスクロール未考慮の試験側誤りも含み、到達可能性を確認するよう修正した。

## 公開用配布物の独立確認

`release-smoke.mjs /workspace/chameleol-release/dist` を実行。`release-smoke.log` と `release-*.png` を参照。

- source commit: `e7ae32f56aaafa9def75d2df0b8d118b2cbd0713`
- asset version: `0.1.0-73d1e4527b`
- production、API未設定、verification false、ランキング入口非表示。
- ホーム・設定・通常練習を開けた。release.json、HTML meta、runtimeの資源版が一致。JavaScriptエラー0、外部リクエスト0。
- 旧5版の保持をrelease.jsonで確認。設定画面自体には資源版表示はなく、iPhoneで版を確認するには配布先の `release.json` を開く。

## 既存ライブの確認

既存URL `https://chameleonjp-kamereoru.chameleonjp.chatgpt.site/` をChromiumで開き、ホームの起動を確認（HTTP200、JavaScriptエラー0）。公開版5の資源版は `0.1.0-f25f4a9ee1`、HTML metaのコミットは `9c4a6ebad65414e4f659537d28f4bc3a93a1f55c`。`live-browser.log`、`live-site-observed.json`、`live-home.png` が証拠。**修正版のプレビューURLではない。ライブへの書込み・切替はしていない。**

## 未確認

iPhone 17 Pro実機の音量・音割れ・サイレントスイッチ・アプリ切替/画面ロック後の復帰、Safari固有のAudioContext制限、耳で聞いた楽曲/効果音の品質は未確認。コード試験とChromiumでの音源実行を、これらの実機確認として扱わない。
