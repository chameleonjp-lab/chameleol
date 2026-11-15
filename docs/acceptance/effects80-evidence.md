# 追加演出80件の統合検証記録

2026-11-11。自動ブラウザでの検証記録。採用IDの整合確認と、実際の表示・実機確認は分けて記録する。
公開・マージ・DB適用は行っていない。

## 環境と判定の範囲

- 自動ブラウザ: Linux Chromium、Playwright、ソフトウェアWebGL。
- 画面寸法: 402×700、402×874、874×402。画像の取得・確認結果は下に記録する。
- iPhone 17 Pro / Safari実機: 未確認。
- 実機のフレーム時間・発熱・JSヒープ: 未測定。描画物体数はメモリ測定ではない。
- 基準T0のCI: PR #11は20:53:14Zにマージ済み。main / 07a36a81 の [run 43098637985](https://github.com/chameleonjp-lab/chameleol/actions/runs/43098637985) は21:06:36Zに成功（npm test・SQL・QuickJS・全E2E）。旧PRトリガー run 43096440517 はqueuedのまま。これは今回の追加実装のCI成功を示すものではない。

## 自動確認

| 確認 | コマンド・証拠 | 結果 |
|---|---|---|
| 採用80件・除外20件・重複0・タスク割当 | presentation.e2e.mjs effects80 coverage | 合格 |
| 同seed・同入力で装飾有無のcourse/summary/history/送信本文 | presentation.e2e.mjs、seed=1、50棟の目標色を各棟で入力 | 合格（本文のplayId/launchIdだけ同一化、endedAt固定） |
| 10回再プレイの購読・予約・描画上限 | 旧session購読0・旧scope予約実行0、描画物体225個×10回 | 合格（ヒープ測定ではない） |
| 実描画器の最大追加負荷 | 20/21棟、段階2無線、全小道具形状、店内、成功輪、煙、鳥3羽を個別・重畳して確認。calls105→112、geometries56→67 / 55→66、textures13→14、objects202→225 | 追加+7calls/+11geometries/+1texture、上限12/16/4以内。静物最大22・粒子6・鳥3・店内2 |
| 3寸法のガイド4段階・結果・境界の画像 | docs/acceptance/effects80-images: guide1〜4、before/after-unlock、last-five、final-building、result | 操作部品の範囲検査合格。ガイド12画像は練習画面。本編の初回ガイドは402x874-main-guide1.png（HUD非重複も自動確認） |
| 静止ガイド・中断 | guidance.e2e.mjs: draftはstate/historyを変更しない、95%で続行、静止中の停止、開始演出中の非表示→明示再開 | 合格 |
| 80件の強制出力・除外20件拒否 | presentation.e2e.mjs、80子試験、画像effect-NNN.png | 自動確認81件合格。一覧80画像＋主要原寸をレビュー済み。実機の動作・性能は別に判定 |
| 追加画像の圧縮・展開サイズ | 231,494B圧縮合計。street4,194,304B、result16,777,216B、detected1,382,400B RGBA推定。終了画面street+detected=5,576,704B | 圧縮1.5MiB・各画面16MiB以内（実ヒープ測定ではない） |
| 結果演出の終了・省略・動き削減 | 599ms未完了→600ms完了、タップ即完了、reduced-motion即完了、初期の有限CSSアニメーションは完了後none | 合格 |
| 結果の言語変更と遅延順位 | 旧画面rank99を無視、再描画後のrank3だけ表示 | 合格 |
| 明度ガイドの時計・音・所有権待ち | 実プレー95000msで停止＋ゲーム音停止。遅延所有権待ちでも手前の再開可・95000msを越えない | 合格 |
| iPhone 17 Pro Safari 30秒×開始/最終地区の性能 | 実機が必要 | 未測定 |

## 要件ごとの表示証拠

画像は `docs/acceptance/effects80-images/` に保存。採用80件の一覧画像4枚と、店内・警察2人・虹・窓の住人・本編ガイドなど主要な原寸画像をレビューした。動作時間・停止・復帰・解除はscope/modelおよびブラウザの自動試験で確認した。全演出をSafari実機の動画で個別検証したという意味ではない。実機の表示・性能・ヒープは未確認／未測定のまま残す。

| No. | 要件 | 条件 | 画像/動画 | 測定値 | 結果 |
|---|---|---|---|---|---|
| 1 | 三層に重なる街 | 本編の全地区 | [固定表示](effects80-images/effect-001.png) | actual activeIdsに1を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 2 | 歩道の模様が変わる | 地区が切り替わる時 | [固定表示](effects80-images/effect-002.png) | actual activeIdsに2を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 3 | 屋根の輪郭を増やす | 棟を表示する時 | [固定表示](effects80-images/effect-003.png) | actual activeIdsに3を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 4 | 店の奥が見える窓 | 店の窓が画面に入る時 | [固定表示](effects80-images/effect-004.png) | actual activeIdsに4を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 5 | 揺れる大きな看板 | 画面近くの看板 | [固定表示](effects80-images/effect-005.png) | actual activeIdsに5を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 6 | ベランダの生活感 | 住宅の表示 | [固定表示](effects80-images/effect-006.png) | actual activeIdsに6を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 7 | 風にめくれるひさし | 猶予中のひさし | [固定表示](effects80-images/effect-007.png) | actual activeIdsに7を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 8 | 配管まわりの動き | 配管がある建物 | [固定表示](effects80-images/effect-008.png) | actual activeIdsに8を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 9 | 建物の隙間の路地 | 建物間の隙間 | [固定表示](effects80-images/effect-009.png) | actual activeIdsに9を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 10 | 地区ごとの目印 | 地区が見える時 | [固定表示](effects80-images/effect-010.png) | actual activeIdsに10を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 11 | 地区の入口ゲート | 1・20・23・30・40棟目へ入る時 | [固定表示](effects80-images/effect-011.png) | actual activeIdsに11を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 12 | 窓から顔を出す住人 | 背景抽選・猶予中 | [固定表示](effects80-images/effect-012.png) | actual activeIdsに12を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 13 | 屋根の猫 | 背景抽選・猶予中 | [固定表示](effects80-images/effect-013.png) | actual activeIdsに13を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 14 | 飛び立つ鳥の群れ | 背景抽選・猶予中 | [固定表示](effects80-images/effect-014.png) | actual activeIdsに14を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 15 | 奥を走る自転車 | 背景抽選・猶予中 | [固定表示](effects80-images/effect-015.png) | actual activeIdsに15を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 16 | 遠くを横切るバス | 背景抽選・猶予中 | [固定表示](effects80-images/effect-016.png) | actual activeIdsに16を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 17 | 歩道の落ち葉 | 猶予中の歩道 | [固定表示](effects80-images/effect-017.png) | actual activeIdsに17を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 18 | 自販機の小芝居 | 猶予中の自販機 | [固定表示](effects80-images/effect-018.png) | actual activeIdsに18を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 19 | パン屋の煙突 | パン屋が近くにある時 | [固定表示](effects80-images/effect-019.png) | actual activeIdsに19を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 21 | 切替中の忍び足 | 既存の猶予時間 | [固定表示](effects80-images/effect-021.png) | actual activeIdsに21を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 22 | 擬態中の息止め | 評価中の成功状態 | [固定表示](effects80-images/effect-022.png) | actual activeIdsに22を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 23 | 危険時に身構える | 警察の段階が2の間 | [固定表示](effects80-images/effect-023.png) | actual activeIdsに23を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 24 | 宝石を守る尻尾 | 警察段階2／解除 | [固定表示](effects80-images/effect-024.png) | actual activeIdsに24を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 25 | 目だけで様子をうかがう | 成功状態で警察がいる時 | [固定表示](effects80-images/effect-025.png) | actual activeIdsに25を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 26 | 汗をぬぐってひと安心 | 警察の段階が下がる時 | [固定表示](effects80-images/effect-026.png) | actual activeIdsに26を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 27 | つまずいて持ち直す | 30棟目以降の猶予中 | [固定表示](effects80-images/effect-027.png) | actual activeIdsに27を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 28 | 歩く足の接地感 | 歩行中 | [固定表示](effects80-images/effect-028.png) | actual activeIdsに28を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 29 | こちらへの得意顔 | 連続成功3・5・10棟達成時 | [固定表示](effects80-images/effect-029.png) | actual activeIdsに29を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 30 | 宝石の無事を確認 | 10・25・40棟目通過後の猶予 | [固定表示](effects80-images/effect-030.png) | actual activeIdsに30を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 31 | 2人で役割分担 | 警察が2人いる時 | [固定表示](effects80-images/effect-031.png) | actual activeIdsに31を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 32 | 無線で連絡する | 警察が段階1・2へ増える時 | [固定表示](effects80-images/effect-032.png) | actual activeIdsに32を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 33 | 似ていない似顔絵 | 段階1で直前の評価終了が成功だった猶予 | [固定表示](effects80-images/effect-033.png) | actual activeIdsに33を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 35 | 急停止の足踏み | 追跡から捜索へ変わる時 | [固定表示](effects80-images/effect-035.png) | actual activeIdsに35を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 36 | 遠景のパトカー | 背景抽選・猶予中 | [固定表示](effects80-images/effect-036.png) | actual activeIdsに36を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 37 | 双眼鏡での捜索 | 段階1で直前の評価終了が成功だった猶予 | [固定表示](effects80-images/effect-037.png) | actual activeIdsに37を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 38 | 2人で顔を見合わせる | 警察2人が捜索へ変わる時 | [固定表示](effects80-images/effect-038.png) | actual activeIdsに38を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 40 | 帽子を追いかける | 段階1・30棟目以降の猶予 | [固定表示](effects80-images/effect-040.png) | actual activeIdsに40を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 41 | 足元に成功の輪 | 既存の瞬間成功通知 | [固定表示](effects80-images/effect-041.png) | actual activeIdsに41を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 42 | 画面の縁を走る成功光 | No.41と同じ通知 | [固定表示](effects80-images/effect-042.png) | actual activeIdsに42を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 43 | 成功中に伸びる帯 | 評価中に成功が続く時 | [固定表示](effects80-images/effect-043.png) | actual activeIdsに43を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 46 | 評価開始の小さなシャッター | 評価／猶予の切替 | [固定表示](effects80-images/effect-046.png) | actual activeIdsに46を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 47 | 成功した店の看板が反応 | 成功して棟を通過した時 | [固定表示](effects80-images/effect-047.png) | actual activeIdsに47を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 48 | 連続成功で宝石が連なる | 連続成功数が変わる時 | [固定表示](effects80-images/effect-048.png) | actual activeIdsに48を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 49 | 連続成功の鎖がほどける | 連続成功が正数から0になる時 | [固定表示](effects80-images/effect-049.png) | actual activeIdsに49を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 50 | 危険からの立て直し札 | 段階2を経験後、警察が0へ減る時 | [固定表示](effects80-images/effect-050.png) | actual activeIdsに50を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 52 | 街を進む小さな自分 | 通過棟数が変わる時 | [固定表示](effects80-images/effect-052.png) | actual activeIdsに52を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 53 | 自己ベスト地点の旗 | 名前ごとの保存済み自己ベストがある時 | [固定表示](effects80-images/effect-053.png) | actual activeIdsに53を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 54 | 最大連続成功を越える瞬間 | 今回の連続成功が保存済み最大値を超える時 | [固定表示](effects80-images/effect-054.png) | actual activeIdsに54を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 55 | 明るさバーの開錠 | 既存のunlockBrightness通知 | [固定表示](effects80-images/effect-055.png) | actual activeIdsに55を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 57 | 高層街への景色の変化 | 40棟目以降 | [固定表示](effects80-images/effect-057.png) | actual activeIdsに57を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 58 | 残り5棟の屋上表示 | 46〜50棟目へ入る時 | [固定表示](effects80-images/effect-058.png) | actual activeIdsに58を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 59 | 逃げ切りゲート | cleared確定後 | [固定表示](effects80-images/effect-059.png) | actual activeIdsに59を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 60 | 発見の決定的瞬間を漫画化 | detected確定後 | [固定表示](effects80-images/effect-060.png) | actual activeIdsに60を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 61 | 遠景の小さなUFO | 背景抽選・猶予中 | [固定表示](effects80-images/effect-061.png) | actual activeIdsに61を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 62 | 地区のマスコットマンホール | 地区の歩道 | [固定表示](effects80-images/effect-062.png) | actual activeIdsに62を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 63 | 更新される手配書 | 1・20・40棟目に到達した後 | [固定表示](effects80-images/effect-063.png) | actual activeIdsに63を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 64 | 看板絵のカメレオンが目配せ | 猶予中の広告 | [固定表示](effects80-images/effect-064.png) | actual activeIdsに64を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 65 | 遠くに二重の虹 | 背景抽選・昼の猶予中 | [固定表示](effects80-images/effect-065.png) | actual activeIdsに65を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 66 | 窓の灯りの波 | 40棟目以降の猶予 | [固定表示](effects80-images/effect-066.png) | actual activeIdsに66を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 70 | 屋上の隠れカメレオン | 背景抽選・猶予中 | [固定表示](effects80-images/effect-070.png) | actual activeIdsに70を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 71 | 結果を一枚の場面にする | 結果画面を開く時 | [固定表示](effects80-images/effect-071.png) | actual activeIdsに71を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 73 | 逃走報告書が印刷される | 結果画面を開く時 | [固定表示](effects80-images/effect-073.png) | actual activeIdsに73を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 74 | 得点の数字が回る | 結果画面を開く時 | [固定表示](effects80-images/effect-074.png) | actual activeIdsに74を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 77 | 最大連続成功を宝石で数える | 結果画面を開く時 | [固定表示](effects80-images/effect-077.png) | actual activeIdsに77を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 78 | 得点の内訳が積み上がる | 結果画面を開く時 | [固定表示](effects80-images/effect-078.png) | actual activeIdsに78を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 79 | 自己ベストの額を更新する | 既存のnewBestが真の時 | [固定表示](effects80-images/effect-079.png) | actual activeIdsに79を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 80 | 記念写真を撮る | 結果画面の場面表示 | [固定表示](effects80-images/effect-080.png) | actual activeIdsに80を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 81 | 50棟を一枚の逃走地図に | 結果画面を開く時 | [固定表示](effects80-images/effect-081.png) | actual activeIdsに81を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 82 | 最もうまく隠れた一棟 | 通過棟の有効な棟別成績がある時 | [固定表示](effects80-images/effect-082.png) | actual activeIdsに82を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 83 | 最も苦戦した一棟 | 通過棟の有効な棟別成績がある時 | [固定表示](effects80-images/effect-083.png) | actual activeIdsに83を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 85 | 初クリアの特別な切符 | 端末内で初めて50棟クリアした時 | [固定表示](effects80-images/effect-085.png) | actual activeIdsに85を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 89 | 地区ごとの絵はがき | 到達地区に有効な通過棟がある時 | [固定表示](effects80-images/effect-089.png) | actual activeIdsに89を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 91 | 実績のスタンプを押す | 結果画面を開く時 | [固定表示](effects80-images/effect-091.png) | actual activeIdsに91を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 92 | 今回の色を宝石箱に並べる | 現在の本編結果を表示する時 | [固定表示](effects80-images/effect-092.png) | actual activeIdsに92を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 93 | 到達した街を結果の背景に | 結果画面を開く時 | [固定表示](effects80-images/effect-093.png) | actual activeIdsに93を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 95 | プレイ内容に合ったひと言 | 結果画面を開く時 | [固定表示](effects80-images/effect-095.png) | actual activeIdsに95を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 96 | 確定順位が開く札 | 正式値と順位の取得が完了した時 | [固定表示](effects80-images/effect-096.png) | actual activeIdsに96を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 98 | 前回からの変化を並べる | 直前1回の端末内成績がある時 | [固定表示](effects80-images/effect-098.png) | actual activeIdsに98を確認 | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 99 | もう一度遊ぶボタンへ飛び乗る | 再プレイを一度受け付けた時 | [固定表示](effects80-images/effect-099.png) | actual activeIdsに99を確認。著作時のalpha境界を使用し、150ms時の描画済み足先中心(201,620.15625)＝再プレイボタン上端中心（透明余白のrect下端は使用しない） | 自動確認・一覧画像確認済み（Safari実機未確認） |
| 100 | 結果画面のおまけ反応 | 結果場面の主人公画像を押す時 | [固定表示](effects80-images/effect-100.png) | 背景位置72.2892%→99.5261%で実画像を変更、active400msで72.2892%へ復帰 | 自動確認・一覧画像確認済み（Safari実機未確認） |

除外20件: 20、34、39、44、45、51、56、67、68、69、72、75、76、84、86、87、88、90、94、97。上の採用表には含めない。

2026-11-14の注記：改訂3の[計画](../superpowers/specs/2026-11-14-chameleol-design-followups-spec.md)で、このうち16件（20、34、39、44、56、67、68、69、72、75、76、84、86、87、90、94）を後続の採用対象にし、45・51・88・97の4件は除外のままとした（元100案は採用96件・除外4件）。後続16件は未実装で、この記録の証拠には含まれない。main `e8c69b4` 時点のコード（`src/presentation/catalog.js` の対象外一覧、検証用の拒否一覧）と試験は、上の80件・20件のままである。後続16件の証拠は計画T9の別記録に分ける。No.33・37・85の補完（PR #14）は[補完2件の記録](effects37-85-completion.md)を参照。

## 画像の見方

各採用IDの `effect-NNN.png` は検証専用の固定条件で実際のモジュール出力を撮影した画像です。結果は演出完了後を保存し、No.99はCSS時刻150msの着地、No.100は実際の目配せタイルへの切替中（400active ms後の復帰も自動確認）を保存しています。ガイドは `402x700-guide1.png` のように寸法と段階、境界は `before-unlock` / `after-unlock` / `last-five` / `final-building` / `result` で対応します。これらはChromiumによる画面証拠で、iPhoneの結果ではありません。

## 一覧画像

[採用1〜20件目](effects80-images/contact-1.png) / [採用21〜40件目](effects80-images/contact-2.png) / [採用41〜60件目](effects80-images/contact-3.png) / [採用61〜80件目](effects80-images/contact-4.png)。各一覧は採用IDの昇順で、除外IDは含めない。細部の確認には各No.の原寸画像を使う。

## 最終一括確認

全E2Eと最新実装CIの最終集計は統合確認後に追記する。途中の対象試験成功を一括確認成功と読み替えない。

2026-11-14の注記：上の追記はまだ行われていない。PR #12・#14・#16・#18はmainへ取り込み済みだが、この記録の「追加描画呼出+7・形+11・画像+1、静物最大22・粒子6」などの測定値はPR #12時点のもので、その後の再測定は記録していない。基準main `e8c69b4` の `npm test` は429件・成功398・失敗0・スキップ31（DBが必要なサーバー試験）で、ブラウザ試験の一括実行はこの文書整理では行っていない。
