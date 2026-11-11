# 素材の出典と使用条件

2026年11月7日時点。カメレオるが配布物に含む素材と、そのもとになった資料を記録します。有償の素材は使っていません。

## 配布物に含むもの

| 素材 | 出典 | 使用条件 | 備考 |
| --- | --- | --- | --- |
| Three.js 0.170.0（`vendor/three.module.min.js`） | npm パッケージ `three@0.170.0` | MIT License（`vendor/three.LICENSE`） | 街とキャラクターの描画に使う |
| 主人公カメレオンの形・動き | 依頼者から提供された「カメレオン No.28 エディター」（`docs/design/chameleon-no28-editor.html`）の書き出し値 `CHAMELEON28` | 依頼者の提供物 | `src/scene/chameleon28.js`（PR #4 で作成）が、この値から立体のモデルを組み立てる |
| 警察官・宝石店・建物・街の形 | このリポジトリのコード（`src/scene/characters.js`、`src/scene/street.js`。PR #4 で作成） | このリポジトリと同じ | 箱・円柱・管などの単純な図形を組み合わせて作った立体。警察官は仮モデル。主人公と同じ太さの輪郭線と、照明を受けない塗りで描く |
| 音楽・効果音・環境音 | このリポジトリのコード（`src/audio/mixer.js`） | このリポジトリと同じ | Web Audio でその場で合成する。音声ファイルは含まない。本編の曲とホームの曲の旋律・和音は、このリポジトリのために書いたもの（既存の曲の引用なし） |
| 渦巻きの目の模様 | このリポジトリのコード（`src/scene/chameleon28.js` が Canvas で描画） | このリポジトリと同じ | 渦の巻き数・線の太さ・色は `CHAMELEON28` の値を使う。画像ファイルは含まない |
| 粒（土ぼこり・きらめき・紙吹雪・汗）と「！」「？」の記号、雲 | このリポジトリのコード（`src/scene/effects.js`・`src/scene/street.js` が Canvas で描画） | このリポジトリと同じ | 画像ファイルは含まない。粒と記号は不透明で、壁と体の色に何も混ぜない |
| ボタンと警戒ゲージの絵文字（🎨🏆📖⚙️📋🚨🔒） | 端末に入っている絵文字の書体 | 端末の書体をそのまま表示（配布物には含まない） | 端末によって絵柄が変わる |
| 窓の灯り・光の輪・足元の影などの小さな画像 | このリポジトリのコード（`src/scene/street.js`・`src/scene/characters.js` が Canvas で描画） | このリポジトリと同じ | 画像ファイルは含まない |

試験だけに使い、配布物には含まないもの：CIEDE2000 の試験値（`tests/rules/fixtures/ciede2000_sharma.tsv`）。Sharma・Wu・Dalal（2005）の実装ノートの表1を、scikit-image 0.26.0 の試験データ（BSD-3-Clause）から写しています。

## 原画との照合

要件仕様書 VIS-01 は、会話に添付されたカメレオン No.28（`8E4EFB22-C5F2-4F7E-96A2-296617593010.jpeg`）、フェレット警察官 No.02（`BCDB0E31-B796-4ED3-B1AD-F455B53410A7.jpeg`）、パレットの操作参考（`IMG_2075.png`）を基準にすると定めています。これらの画像は、このリポジトリにも作業環境にもありませんでした。

### 主人公（カメレオン No.28）

2026年11月7日に、依頼者から「カメレオン No.28 エディター」（Three.js r128 で動く HTML）と、その書き出し値 `CHAMELEON28` を受け取りました。エディターは `docs/design/chameleon-no28-editor.html` に保存しています。

ゲームの主人公は、PR #4 で作ったモデル（`src/scene/chameleon28.js`）を使います。2026年11月8日に依頼者がこのモデルを選びました。このモデルは `CHAMELEON28` の値を読んで形を作りますが、作った時点ではエディターが手元になかったため、値の意味をファイル内の「解釈」に書いた読み方で当てはめています。エディターの作り方をそのまま写したものではありません。

- 形・比率：頭・とさか・渦巻きの目・口・腕・脚・丸まった尻尾を、`CHAMELEON28` の値から組み立てます。太い輪郭線を付けています。服は着せていません。
- 動き：歩く・立ち止まる動きと、警戒が高い時の低い姿勢・振り返りがあります。
- 体色：体の面に体色を反映し、目の渦と舌は残します。尻尾に宝石を隠し、クリア時に取り出します。
- 判定との関係：比較に使う胴の中央は、照明や色調整をかけずに判定と同じ8ビットの色で描きます。陰とつやは、輪郭の近くと中央から離れた所にだけ付けます（受入試験 GAME-07 で読み取り確認）。

エディターの体色は `#58c43c`（色合い107.65°・鮮やかさ69.39%・明るさ76.86%）です。ゲームの初期色は、この色合いと鮮やかさを使い、明るさだけを100%にした `#72ff4e` にしました。1〜19棟は明るさを100%に固定する決まり（INPUT-02）があり、初期色もその範囲に入れる必要があるためです。ホーム画面の主人公は、エディターの `#58c43c` そのままで表示します（`src/scene/showcase.js`）。

初期色を変えると1棟目の出題が変わるため、本来は判定規則の版（`rulesVersion`）を上げます。今回は公開前で、本番の記録がまだ1件もないため、版は `kamereoru-rules-v1` のまま照合例（`tests/replay/fixtures/`）と調整資料を作り直しました。公開後に変える時は版を上げます。

### 警察官（フェレット No.02）

警察官の原画は届いていません。今の警察官は、仕様の文章に書かれた特徴（紺の制服・帽子・懐中電灯を持つフェレット）だけで作った仮モデルです。体色の変更対象外です。2026年11月9日に、背景の一部のように小さく奥に置いていたのをやめ、主人公と同じ歩道の並び・近い大きさ・同じ描き方（太い輪郭線、照明を受けない塗り）に変えました。まばたき・眉・口を足し、走る・見失って探す・見つけて指をさす、の3つの動きをします。形そのもの（顔つき・比率）は、原画がないため仮のままです。原画が届いたら、形・色・比率を照合してこの表を更新します。

モデルの受入（受入試験 SCOPE-01）は、警察官の照合が終わるまで「保留」です。

### 結果画面の固定画像（追加演出80件）

`src/presentation/assets/result-atlas.webp` は2048×2048pxの共用WebPです。5地区の背景は本作向けのCanvas図形、4姿勢（clear/detected/quit/proud）と目配せ反応（glance）の主人公は持ち主提供のNo.28設定と既存`src/scene/chameleon28.js`から制作時にChromium/Three.jsで描画しました。領域は`result-atlas.json`、再制作手順は`scripts/render-result-atlas.mjs`です。文字・成績は画像に含めず、表示時の撮影・画像生成・画像保存は行いません。Three.jsのライセンスは`vendor/three.LICENSE`を参照してください。

### Street presentation atlas

`src/presentation/assets/atlas.webp` is original vector artwork created for this game: five pavement patterns and landmarks, three shop interiors, two alley views, street props, eye/awning/window animation frames, and nine background cameo illustrations. The 1024×1024 WebP and its region definitions in `atlas.json` are produced deterministically from the SVG shapes in `scripts/render-street-atlas.mjs`, using librsvg/Cairo and Pillow at authoring time. No third-party artwork or runtime image generation is used.

- `src/presentation/assets/detected.webp`: 480×720の発見表情。既存No.28モデルから `scripts/render-result-atlas.mjs` が制作時に描画。終了中に16MiBの結果アトラスを読み込まず、街と合わせて約5.32MiBの追加画像に収めるための共有素材。
