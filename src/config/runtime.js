// 実行時の設定。接続先・正式URLは公開工程で index.html の meta に書き込む（本書では架空の本番URLを置かない）。
// 手元の検証（localhost）では localStorage の 'kamereoru.apiBase' で検証用サーバーへ差し替えられる。
export const GAME_VERSION = '0.1.0';

export function loadRuntimeConfig(doc = globalThis.document, loc = globalThis.location, storage = globalThis.localStorage) {
  const meta = (name) => doc?.querySelector?.(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || null;
  let apiBase = meta('kamereoru-api');
  const publicUrl = meta('kamereoru-public-url');
  const env = meta('kamereoru-env') ?? 'development';
  const gameVersion = meta('kamereoru-version') ?? GAME_VERSION;
  // 版別の静的資源の名前（ビルドで決まる。例: 0.1.0-a1b2c3d4）。手元の開発では 'dev'。
  const assetVersion = meta('kamereoru-asset-version') ?? 'dev';
  const local = loc && ['localhost', '127.0.0.1'].includes(loc.hostname);
  if (local) {
    try {
      const override = storage?.getItem('kamereoru.apiBase');
      if (override) apiBase = override;
    } catch {
      /* 保存できない環境 */
    }
  }
  return Object.freeze({ apiBase, publicUrl, env, gameVersion, assetVersion, isVerification: env !== 'production' });
}
