# 輪郭・舌のダイヤ・称号と結果画像：工程ごとの証拠

対象：[要件](../superpowers/specs/2026-11-14-chameleol-design-followups-spec.md)・[計画 T0〜T9](../superpowers/plans/2026-11-14-chameleol-design-followups-plan.md)・[実装前レビュー](../reviews/2026-11-14-chameleol-design-followups-implementation-review.md)。
書く人：試験・証拠担当。実装担当が出した commit を、別の立場で試験し、ここへ記録する。製品コードと試験コードは、この担当では書かない。

## 基準

- 基準は main `e8c69b43cb035ba9bfb9929e36ebc231423ba332`（PR #20 マージ後）。
- 基準の単体試験（`npm test`）：429件、成功398、失敗0、スキップ31（チームの決まりに書かれた値。この文書の担当は再実行していない）。
- 作業ブランチは `claude/chameleol-27-titles-x2w7cc`。本番DB・公開設定は変えない。

## 状態の区別

この文書では、次の4つを混ぜない。

| 状態 | 意味 |
| --- | --- |
| 実装済み | commit に入っている。画面や他の部品へつながっているとは限らない |
| 自動確認済み | Node の単体試験や Chromium の自動試験で通った。iPhone 実機の確認ではない |
| 実機未確認 | 本人の iPhone などの実機で、まだ見ていない |
| 本番未反映 | 本番へ公開・配備していない（この作業では公開しない） |

## 証拠の列

要件ごとの一覧は、次の列で書く。空欄は「まだ無い」の意味で、合格の意味ではない。

| 列 | 書くこと |
| --- | --- |
| commit | 確かめた commit の SHA |
| requirementId | 要件の番号（例：EXT-03） |
| evidence | 試験ファイル・試験名・画像・記録の場所 |
| automated | 自動試験の結果（成功／失敗／スキップの数と、何で動かしたか） |
| device | 実機での結果。見ていなければ「未確認」 |
| published | 本番へ出したか。この作業では「未反映」 |
| blockedReason | 確かめられない理由（環境が無い、後の工程で入る、など） |

---

## T8（保存ファイル部分）

確かめた commit：`c065bc2`（T8: 表示用の保存 presentation.extras.v1）。確かめた日：2026-11-14。

この commit は保存の部品だけ。app.js へのつなぎ（`extrasPort`、構造メモ §5.3）は後の commit で入るので、ここでは確かめていない。**T8 は完了していない。**

### 要件ごとの状態

| commit | requirementId | evidence | automated | device | published | blockedReason |
| --- | --- | --- | --- | --- | --- | --- |
| `c065bc2` | EXT-03（保存の部品） | `tests/storage/presentation-extras.test.mjs`、下の追加確認 | 21件成功・失敗0・スキップ0（Node 22.23.4、fake-indexeddb とメモリ版） | 未確認 | 未反映 | app.js へのつなぎが未実装。画面からの動きは確かめられない |
| `c065bc2` | EXT-03（app からの入口 `extrasPort`） | なし | なし | 未確認 | 未反映 | 後の commit で入る予定 |

### 変わったファイル（事実）

基準 `e8c69b4` から `c065bc2` までで、`src`・`tests`・`scripts`・`package.json` の変更は次の4つだけ。

- 新規 `src/storage/presentation-extras.js`（純関数：正規化・上限・札と小芝居の取得の規則）
- 変更 `src/storage/store.js`（取引 `extrasTransaction` と3関数を追加）
- 変更 `src/storage/memory-store.js`（同じ規則のメモリ版と `failWrites` を追加）
- 新規 `tests/storage/presentation-extras.test.mjs`

`src/net`・署名 summary・採点・`DB_VERSION` の行には差分が無い。

### 実行したコマンドと結果（事実）

作業場所 `/home/user/chameleol`、Node v22.23.4。全試験の一括実行はしていない。

| コマンド | 成功 | 失敗 | スキップ |
| --- | --- | --- | --- |
| `node --test tests/storage/*.test.mjs tests/net/outbox.test.mjs` | 54 | 0 | 0 |
| `node --test tests/net/bonus-outbox.test.mjs tests/net/bonus-start.test.mjs tests/net/bonus-status.test.mjs tests/net/start.test.mjs tests/ui/app.test.mjs tests/ui/bonus-app.test.mjs tests/ui/record-status.test.mjs` | 49 | 0 | 0 |
| `node --test tests/storage/presentation-extras.test.mjs`（上の54件の内数） | 21 | 0 | 0 |
| 追加確認：リポジトリ外の一時スクリプト `t8-extra-checks.mjs`（下に内容） | 9 | 0 | 0 |
| 新しい試験を、1つ前の commit（`c065bc2^`）のコードへ当てた | 0 | 1 | 0 |

- 2行目は、`store.js`・`memory-store.js` を使う既存の単体試験（`tests` の中で取り込んでいるもの）から、1行目に入っていないものを選んだ。`tests/server/*` は DB を使う別の試験なので、今回は動かしていない。
- 最後の行は、部品が無い時に新しい試験が失敗することだけを示す（`presentation-extras.js` が無いので読み込みで失敗）。個々の検査が先に失敗したかどうかは、試験とコードが同じ commit なので確かめられない。

### 試験が確かめていること（事実：試験の中身を読んだ）

新しい試験は10の検査を、IndexedDB 版（fake-indexeddb）とメモリ版の両方で動かす（20件）。純関数の検査が1件。

| 確かめたいこと | 試験の検査 | 判断 |
| --- | --- | --- |
| 同時2回の取得で true は1回（札） | `two concurrent badge claims` | 確かめている |
| 同時2回の取得で true は1回（小芝居） | `two concurrent cameo claims` | 確かめている |
| 古いタブ・古い世代・旧 playId を拒否（札も小芝居も、P22） | `stale tab, stale generation and old playId…` | 確かめている。新しいタブ名＋古い世代の組み合わせも拒否 |
| 終わったプレイ・旧 playId の遅い保存を採らない | `late write for a finished play…` | 確かめている。保存値が作られないことも見る |
| 5回後の再開で追加は1回以下 | `resume after 5 starts…` | 確かめている。別タブへ引き継いだ後、予約を残した通常の6回目は拒否、中間配達の6回目は同時2回でも1回、7回目は拒否 |
| 状態の後退・飛び越しを拒否 | `cameo state cannot regress or skip` | 確かめている |
| 保存拒否で取得は false、成績の保存は続く | `write refusal keeps result storage working…` | 確かめている。取得失敗の枠は消費済み扱い（次の count+2 は拒否） |
| 壊れた値は空として扱い、成績は保存できる | `corrupt stored value…` | 確かめている（6種類の壊れた値） |
| 直近32 playId だけ残す | `oldest plays are dropped beyond 32…` | 確かめている（40件で古い8件が消える） |
| 32KiB の上限 | 純関数の検査で `maxBytes: 1500` を渡す | 上限を小さくした時の動きだけ確かめている（下の「不足」） |
| DB_VERSION=1・既存ストア・snapshot・outbox・localResults・他の kv を変えない | `saved values keep other stores…` | 確かめている。保存する項目が `at/badge/director/playId` だけであることも見る |
| 発見集合などの余分な項目を持たない | 純関数の検査（`discovered` を捨てる） | 確かめている |

### 追加で確かめたこと（事実：一時スクリプトで実行）

スクリプトはリポジトリの外 `/tmp/claude-0/-home-user-chameleol/188cd798-3721-5fcf-813a-763582c03ca5/scratchpad/evidence/t8-extra-checks.mjs` に置いた（リポジトリへは入れていない）。9件すべて成功。

1. **2つのタブ（同じDBを開いた2つの Store）**：古いタブAと持ち主のタブB（2回）が同時に札を取ると、結果は A=false、B=true が1回だけ。
2. **書き込みの最後での失敗**：kv への put が例外を出す場合と、put の後に取引が中止される場合の両方で、取得は false（例外なし）。保存値と本編の欄（runs）は前と同じ。
3. **実際の上限での最大の大きさ**：エスケープで長くなる文字だけの 128 文字の playId、最も長い数値を入れた 32 件でも 29,719 バイトで、32,768 バイトを超えない。もう1件足しても上限内で、新しい件が先頭に残る。
4. **札と小芝居が互いを消さない**：小芝居→札→小芝居の順に取っても、`badge=true` と `count=1` が両方残る（両方の版）。
5. **取得失敗の後、runs・outbox・localResults が完全に同じ**（両方の版、保存拒否と古い世代の両方）。
6. **おかしな引数**：引数なし、`state: null`、playId がオブジェクトでも、例外を出さず false または null。
7. **時計が戻った時**：前より小さい時刻で取っても、今のプレイが先頭に残り、追い出されない。
8. **lastStartedAt の上限**：規則 v1 の `totalMs` は 250,000ms。設計の上限は 310,000ms（totalMs+60000）だが、実装は 10,000,000ms で受け入れる（下の「設計との違い」）。
9. **知らない版の値**：`version: 2` の値があると、次の取得で版1の値に置き換わる。

### 不足と設計との違い

事実：

- **32KiB の追い出しは、実際の保存の流れでは起きない**。32 件の上限が先に効き、最大でも約 29.7KB だった。32KiB の処理は「上限を小さく渡した純関数の試験」だけで確かめている。実装担当の報告と同じ。
- **書き込みの最後での失敗**（put の例外、取引の中止）は、リポジトリの試験に無い。試験の `failWrites` は取引を始める前の失敗だけを起こす。上の追加確認2では正しく false になった。
- **2つの Store（2タブ）での同時の取得**は、リポジトリの試験に無い。試験は同じ Store への同時呼び出しだけ。上の追加確認1では正しく動いた。
- **失敗した取得の後に runs・outbox・localResults が「同じ」こと**は、リポジトリの試験では outbox の件数と score だけを見ている（構造メモ §5.5 は「不変」を求める）。追加確認5では完全に同じだった。
- **lastStartedAt の上限**：設計（構造メモ §5.1）は `0..totalMs+60000`、実装は固定の 10,000,000ms。実装担当の報告に書かれた解釈どおり。
- **設計に無い規則**：小芝居の取得の細かい規則（count は +1 だけ、保存値が無い時は 0 か 1、予約が残る間は5回まで、lastStartedAt は後退しない、予約は戻せない、予約の無い中間配達は不可）は、実装担当が足したもの。構造メモ §6.1 の表（予約中・解放済み・実施済み）と食い違う所は、読んだ範囲では見つからなかった。

意見：

- lastStartedAt の上限の違いは、表示用の保存の中だけの話で、成績・送信本文には届かない。ただ、設計どおりにするか、設計メモ側を直すかは、設計担当かレビュー担当が決めるのがよいと思う。
- 知らない版（`version: 2`）を上書きする動きは、キー名に版（`.v1`）が入っているので、今は困らないと思う。将来同じキーで版を上げる時には問題になる。
- 取得が1回失敗すると、そのプレイではその後の小芝居が保存側で全部拒否される（count が合わなくなる）。構造メモ §6.1 の「取った枠は以後必ず消費済み」と合っているが、一時的な失敗でも残りの小芝居が出なくなる。成績には影響しない。T4 で動きを見る時に確かめたい。
- `memory-store.js` で、新しい import 行が既存のコメント「IndexedDB を使えない時の代わり…」と class の間に入った。動きには関係しない。

### 未確認

- app.js から `extrasPort` を通した動き（`memoryOnly`・世代0のプレイのメモリ版ポート、新規プレイ直後の count:0 の保存、再開時の `loadDirector`）。後の commit で入るので、その時に確かめる。
- T4（小芝居）・T6（精密札）の画面からの取得。まだ実装されていない。
- 実際のブラウザ（Chromium）と iPhone Safari の IndexedDB での動き。今回は Node と fake-indexeddb だけ。
- 本番：未反映。
