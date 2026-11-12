# 統合後の検証

Node.js v24.22.1 / npm11.9.0。lockfileを維持してnpm ci。資料14の旧31件は今回の証拠へ流用していない。

| 対象 | 今回の結果 | 証拠 |
|---|---|---|
| 変更JavaScript各ファイルの構文 | 45ファイル成功（追加ブラウザスクリプトも個別確認） | syntax.log |
| 音・操作 | 21成功、0失敗 | audio-controls-final.log |
| App・操作音・練習/再開競合 | 21成功、0失敗 | app-final.log |
| 全単体・共有同期 | 296件: 271成功、0失敗、DB専用25既存skip | npm-test-final.log |
| DB必須検査 | SQL2ファイル＋上記DB専用25件すべて成功、0skip | test-sql.log |
| 別エンジン | QuickJS11照合成功。Deno未導入 | check-engines.log |
| 追加ブラウザ統合 | 6成功、0失敗、0skip | browser.log / browser-guide-exit.log |
| verification build | 成功 | build-verification.log |
| production単独build | APIなし、旧5版保持、全hash一致 | distribution.json |
| production実ブラウザ | 起動/通常練習、版一致、外部通信0、JSエラー0 | release-smoke.log |

単体行のDB専用skipは既存の環境分離であり期待値変更ではない。test:sqlで全25件を別途実行した。PostgreSQL16.15はlocalhost限定の使い捨てDockerで、終了後削除。本番DB・本番APIへの接続なし。

初期の標準node --testはsandboxの子プロセス制限によりファイル単位で'test failed'になった。必要なコマンドを許可された外側環境で再実行し、上表は実際の個々のテスト結果を使用。npm依存取得もsandbox内proxy到達不可を確認後、同じnpm ciを外側環境で成功させた。

独立レビューで相対import欠落0、v1/v2復元互換と規則差分、準備競合、音重複/破棄を確認。指摘された同値再描画の音欠落と保存待ち画面奪回は再現試験RED→修正GREEN。曲切替の予約残りも同様に回帰化。ガイド操作のcanvas遮断は実クリックで検出し3画面サイズで再検証した。追加UIの独立レビューに未解決指摘なし。

実装・モック音声試験・Chromium実操作・聴感・iPhone実機を区別する。詳細はBROWSER.md。iPhone/Safari/聴感は未実施。


既存e2eの初回に見つかった試験準備の問題も記録を保持する。G3の演出skipボタン自然消滅との競合はsetupのdispatchEvent化後1/1成功（本題pauseは実クリックのまま）。online初回はDB未準備。使い捨てPostgresで再実行し3/4成功、残1は長いframeで自動停止済みなのに背面のpauseを押すhelper不備で、停止中UIを利用するよう直して1/1成功。送信3件・開始3件・未送信0件等の期待値は維持。新skip追加なし。対応ログ: e2e-guidance-pause-fix.log、e2e-online-postgres.log、e2e-online-paused-fix.log。

公開版5では初回ガイドの壁を中央手前に保つため、描画位置sceneTとゲーム時計tは同値ではない（最初はsceneT=2000、ゲームt=0）。既存pause_hidden_resume試験は両者を直接比較していた。統合に合わせ、描画位置は停止時sceneTからの増分、presentationとsessionは停止時ゲームtからの増分で検査する。非表示時間を消費しない期待値は維持する。


既存e2e最終ローカル結果: 9ファイル、トップレベル60件＋subtestで146件。初回140成功/6失敗/0skip、上記6失敗の対象再試験はすべて成功。追加統合6件と合わせ152対象に成功証拠あり。ただし単一のclean全件runではない。詳細e2e-existing-summary.json。最終push後のGitHub CIで全体を再確認する（PRのChecks欄を参照）。
