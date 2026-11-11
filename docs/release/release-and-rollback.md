# 公開と切り戻しの手順（案）

2026年11月7日時点の案です。この手順は、まだ一度も本番で実行していません。Supabase の本番データベースへの適用、Edge Function の配備、ゲームの公開は、どれも本人の承認を得てから行います。公開先（GitHub Pages など）もまだ決まっていません。

## 先に知っておくこと

カメレオるは、ゲームの画面（静的なファイル）と、結果を受け付けるサーバー（Supabase の Edge Function と、データベースの `private` 領域の表・関数）に分かれています。画面とサーバーは、同じ判定規則のファイル（`src/rules/v1/`）を使います。サーバー側の写しは `supabase/functions/_shared/kamereoru/` にあり、`npm run sync` で作り、`npm test` で一致を確かめます。

ゲームの画面は、版ごとに別のフォルダへ置きます。`npm run build` を実行すると `dist/v/<版名>/` に一式ができて、`dist/index.html`（入口）が今の版を指します。版名は「ゲームの版 + 中身の指紋」（例：`0.1.0-a1b2c3d4e5`）です。古い版のフォルダは消さずに残します。こうしておくと、入口だけを差し替えて切り戻せて、古い版で途中保存したプレイもその版のページで再開できます。

`dist/release.json` には、ゲームの版、判定規則の版、出題の版、保存形式、結果の形式、共有コードの指紋、各ファイルの SHA-256 を記録します。公開した時は、このファイルを公開記録として残します。

## オンラインランキングを使わない単独公開

本編・練習・端末内の記録・Xでの共有を使える本番版を作ります。実験場への掲載や Supabase への接続は、この手順では行いません。

```sh
KAMEREORU_ENV=production \
KAMEREORU_STANDALONE=1 \
KAMEREORU_PUBLIC_URL=https://chameleonjp-kamereoru.chameleonjp.chatgpt.site/ \
npm run build
```

2回目以降の配布では、直前に配布したフォルダを `npm run build -- --keep <前回の dist>` で引き継ぎます。保存時の版を開けるよう、以前の `v/` 以下も一緒に配布します。

## 1. 検証環境で通す

本番の前に、検証用の Supabase（本番とは別の場所）で一度通します。次の順に進めます。

1. データベースへ `supabase/migrations/20261107120000_kamereoru_v1.sql` を適用します。このファイルは `private` 領域に `kamereoru_` で始まる表と関数だけを作り、公開用の役割（`anon`・`authenticated`）からは実行権限を外します。他のゲームの表や関数には触れません。
2. 適用した直後に、順位の対象になる新しい開始を止めておきます。初期値は「受け付ける」なので、公開の準備が整うまで閉じておくためです。

   ```sql
   select private.kamereoru_set_accepting(false);
   ```

3. Edge Function の秘密の設定値を入れます。`KAMEREORU_IP_SALT` は回数制限に使う長い乱数の文字列、`KAMEREORU_ALLOWED_ORIGIN` は公開するページのオリジン（例：`https://example.github.io`）です。`SUPABASE_DB_URL` は Supabase が自動で入れます。秘密の値はリポジトリやログに書きません。
4. Edge Function を配備します。ゲームは名前だけで遊べるようにしているため、ログインの確認を外して配備します（`--no-verify-jwt`）。

   ```sh
   supabase functions deploy kamereoru --no-verify-jwt
   ```

5. 検証用のゲームを作り、iPhone で開きます。

   ```sh
   KAMEREORU_ENV=verification \
   KAMEREORU_API=https://<検証用のref>.supabase.co/functions/v1/kamereoru \
   npm run build
   node scripts/serve.mjs --root dist --host 0.0.0.0
   ```

   検証用の画面には「検証用」の表示と、20棟目の手前・終了の手前・夜の場面へ飛ぶ検証メニューが出ます。本番用（`KAMEREORU_ENV=production`）では出ません。

6. 開始を一時的に開き（`select private.kamereoru_set_accepting(true);`）、通し試験をします。受入試験の記録（`docs/acceptance/results.md`）と、実機の確認手順（`docs/device-test-procedure.md`）に沿って確かめます。終わったら閉じます。

## 2. 本番へ切り替える順番

計画書 P9 の順番に合わせて、古い版を受け付ける口を残したまま、新しいものを先に置き、入口は最後に切り替えます。

1. **受け口**：データベースの変更と Edge Function を先に配ります。新しい判定規則の版を足す時は、古い版の規則ファイルも残し、`private.kamereoru_config.accepted_rules_versions` に新旧の両方を入れます。
2. **版別の資源**：新しい版のフォルダ `v/<版名>/` を公開先へ置きます。この時点では入口は古い版のままです。古い版のフォルダは消しません（`npm run build -- --keep <前回の dist>` で残せます）。
3. **入口**：`index.html` を新しい版へ差し替えます。
4. **順位の登録を開く**：公開URL・共有文・接続先が正しいことを確かめてから、`select private.kamereoru_set_accepting(true);` を実行します。

本番用のゲームは、接続先と公開URLを必ず指定して作ります。指定がないと作成を止めます。

```sh
KAMEREORU_ENV=production \
KAMEREORU_API=https://<本番のref>.supabase.co/functions/v1/kamereoru \
KAMEREORU_PUBLIC_URL=https://<公開URL>/ \
npm run build -- --keep <前回公開した dist>
```

検証で作った記録や試作のスコアは、検証用の Supabase に残し、本番へは持ち込みません。

## 3. 切り戻し

問題が見つかった時は、まず新しい開始だけを止めます。止めても、すでに終わったプレイの結果の受け付け、照会、再送は続きます。

```sql
select private.kamereoru_set_accepting(false);
```

次に、入口（`index.html`）を前の版へ戻します。版別のフォルダは新旧とも残しておきます。新しい版で途中保存した人がページを開くと、ホームに「保存した版のページで続きを開く」案内が出て、`v/<新しい版名>/` で再開できます（受入試験 VERSION-01、`tests/e2e/version.e2e.mjs`）。新しい版で終わった結果は、同じ番号と当時の版のまま1回だけ受け付けます。サーバーが持っていない判定規則の版の結果は、消さずに「確認待ち」として保護します。

この流れ（新しい版で途中保存と未送信の結果を作り、入口を戻し、再開と再送が通るか）は、まだ検証環境で実演していません。公開の合格は、この実演の後に判断します。

## 4. GitHub Pages を選んだ場合（未採用）

公開先が GitHub Pages に決まった時のための下書きです。リポジトリにはまだ入れていません（入れると main への反映で自動公開が始まるため）。採用する時は、公開の承認を受けてから `.github/workflows/pages.yml` として追加します。前の版のフォルダを残すため、公開済みのページから前回の `dist` を取り出して `--keep` に渡す手順を加える必要があります。その方法はまだ決めていません。

```yaml
name: pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          KAMEREORU_ENV: production
          KAMEREORU_API: ${{ vars.KAMEREORU_API }}
          KAMEREORU_PUBLIC_URL: ${{ vars.KAMEREORU_PUBLIC_URL }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```

GitHub Pages では、ページの住所にリポジトリ名が入ります（このリポジトリの場合は `https://chameleonjp-lab.github.io/chameleol/`）。採用する場合は、この住所を `KAMEREORU_PUBLIC_URL` に指定します。ゲームのファイルはすべて相対的な住所で読み込みます。実際の公開先ではまだ確かめていません。
