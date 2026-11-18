# Task 2：通常接続と通し試験の実装報告

> 2026-11-17追記：この文書は作成時点の履歴です。現在の実装・検査・担当・残件は[最新状況](../completion-task4/evidence.md)を参照してください。通常接続や翻訳の未完了、旧CI待ち、Claudeへの再開指示を現在の作業指示として扱わず、実装済み部分を作り直さないでください。

2026-11-17。開始head `d6e7aee`。Task 1 scoped reviewの受入後、親担当からGOを受けて実装した。外部へのpush・公開・マージは行っていない。翻訳辞書は変更していない。

## 実装したこと

- 通常入口 `start()` が実 `createResultCardPorts` を渡し、本編 `showGame()` は `extended96` を指定する。`new App()` の描画口注入は従来どおり省略できるため、軽量App試験と明示legacy wrapperを維持する。既存のstageだけがcontroller.stepを呼び、App側へ二重抽選・追加stepを作っていない。
- catalogを96採用/4除外（45/51/88/97）へ切り替えた。元 `chameleol-effects80.json` は変更していない。元80の全強制描画と旧peak検査は新しい明示 `legacy80.html` で残し、通常入口のmode・結果パネル数・明示本文共有の期待を更新した。
- 通常の `debugPresentation()` で新16案を実描画/実解析へつないだ。結果用の検証runにも実履歴を付け、E086は実際に警戒が上がって戻るseed17の入力を使う。街/警察は通常と同じ描画関数へ検証snapshotを渡す。精密札は本物の評価区間収集と98%/500ms判定を使うが、取得は独立した表示用のものへ閉じる。検証snapshotを通常controller/RNG/取得保存へ書き戻さない。停止中の検証プレビューは画面を保持し、再開すると通常loopへ戻る。統計の新IDは実際の描画枚数/警察の表示から出す。
- `normal-integration.e2e.mjs` は通常indexから、実App loop（実session/実controller/実stage）で札・街・舌・警察を通し、停止・非表示・復帰・描画喪失/復旧・実履歴の終了・PNG事前作成・共有取消・明示保存/本文・再プレイ時の解放を検査する。演出オフと簡易DOMも通常App loopで検査する。`presentation-adopted.e2e.mjs` は新16案の実画像部品、SVG/DOM、実履歴との一致、実PNGを検査する。activeIdsだけの成功条件にはしていない。

## 保存・判定に関する確認

`tests/ui/game-extras-app.test.mjs` に、通常App loopの50棟を、明示legacy/通常extended × 演出on/offで通す試験を追加した。20/40/50通過を確認し、course・summary・history・送信本文の一致、描画前後のsession不変、150回のApp game frameに対してstageだけが150step（legacyは0step）、結果での履歴解析完了と購読解放を確認した。追加の札preview試験では、実評価から札を描き、通常runの札取得・extras・履歴・step数を変えないことを確認した。

規則v1〜v4、共有された判定コード、DB_VERSION、通常履歴/識別値/送信処理、抽選重み・再抽選・期限・開始条件、保護余白と描画上限は変更していない。既存の4ガイド・20/40/50境界・危険・旧版記録のブラウザ試験は通常入口の変更をそのまま受ける。今回ローカルでそれらのGPU合格を確認したとは扱わない。

## CI82から引き継いだ鳥の診断

親担当の `task-1-ci82-diagnosis.md` を読み、`extended-stage.e2e.mjs` の実鳥検査へ追加した。全5時点の画像/JSON（shown・bodyBad・maxDev・同じ舞台のbirdHidden基準）をassertより先に保存する。`captureAtlasCells()` は鳥・荷物・ひもの該当3行列だけを隠し、正確な行列をtry/finallyで復元する。controller・stage.update・時計・他の絵を進めない。複数行列のread失敗時も他の装飾を残して復元するunitを追加した。

実shaderのrim/glossと8bit markerの問題は仮説の段階である。失敗行の基準がまだ無いため、今回 `checkComparisonSurfaces` のmaskや不一致0の条件を変更していない。次のCIで402×874の胴1画素が再現すれば、shown/鳥のみ非表示の両方に座標とRGBが残る。Task 1の画素条件とG2は未受入のまま親担当へ引き継ぐ。

## 実行した検査

| コマンド | 結果 |
| --- | --- |
| `node --test tests/ui/game-extras-app.test.mjs tests/presentation/scope.test.mjs tests/presentation/street-extras.test.mjs tests/scene/stage-mode.test.mjs` | 48成功、0失敗 |
| `node --test tests/presentation/atlas-capture.test.mjs tests/ui/game-extras-app.test.mjs`（新試験の追加後） | 13成功、0失敗 |
| `npm test`（全コード完了後1回） | 742件、711成功、31skip、0失敗、約24秒。SQL接続等が必要な既存skipを成功へ数えていない |
| 変更/追加15 JavaScriptファイルを `node --check` | 全て成功 |
| `git diff --check` | 成功 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium timeout 10s node --test --test-reporter=tap --test-name-pattern='normal loop: tongue' tests/e2e/normal-integration.e2e.mjs` | ブラウザ起動前にhostのUnix socket制約で失敗（`socket() failed: Operation not permitted (1)`）。launch後のserverが残るため10秒で終了。アプリの試験は実行されていない |

詳細ログは同じ作業票ディレクトリの `task-2-npm-test.log` と `task-2-browser-attempt.log` にある（ローカル証拠、commit対象外）。最初の既定Playwright起動ではダウンロード済みbinaryが無かったため、存在する `/usr/bin/chromium` を指定し、上記の既知制約を確認した。以後ローカルブラウザ起動は繰り返していない。

## 受入待ちと確認範囲

新しいブラウザ試験はCIの既存4分割globへ自動で入る。CI設定・閾値は変更していない。CIで新16案、通常loop、既存80、3寸法、4ガイド、境界、旧記録を同じheadで実行する必要がある。E067の402×874での条件付き非表示は既存F04/Q07のまま維持した。強制previewは実プレイでの抽選/出現の証拠にはしない。

この報告はG2/G5、iPhoneのX画像添付・長押し保存・音・性能、15言語完了、候補公開の合格を意味しない。ブラウザ合否とCI82の1画素診断、実機項目は親担当の後続作業へ残す。
