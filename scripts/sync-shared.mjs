// 端末とサーバーで同じ判定規則・名前の整理を使うため、src から Edge Function の共有フォルダへ写す。
// 写した各ファイルの SHA-256 を manifest.json に残し、試験で元と一致することを確かめる。
// 使い方: node scripts/sync-shared.mjs [--check]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_FILES } from '../src/rules/v1/manifest.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'kamereoru');

export const SHARED = [
  ...RULES_FILES.map((f) => ({ from: `src/rules/v1/${f}`, to: `rules/v1/${f}` })),
  { from: 'src/shared/name.js', to: 'shared/name.js' },
];

export const sha = (buf) => createHash('sha256').update(buf).digest('hex');

export function computeManifest() {
  const files = {};
  for (const { from, to } of SHARED) files[to] = sha(readFileSync(join(ROOT, from)));
  const combined = sha(Object.entries(files).map(([k, v]) => `${k}:${v}`).join('\n'));
  return { generatedFrom: 'src/rules/v1 + src/shared/name.js', fingerprint: combined, files };
}

export function check() {
  const problems = [];
  for (const { from, to } of SHARED) {
    const dest = join(DEST, to);
    if (!existsSync(dest)) {
      problems.push(`missing ${to}`);
      continue;
    }
    if (sha(readFileSync(join(ROOT, from))) !== sha(readFileSync(dest))) problems.push(`differs ${to}`);
  }
  const manifestPath = join(DEST, 'manifest.json');
  if (!existsSync(manifestPath)) problems.push('missing manifest.json');
  else if (JSON.stringify(JSON.parse(readFileSync(manifestPath, 'utf8'))) !== JSON.stringify(computeManifest())) problems.push('manifest outdated');
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const p = check();
    if (p.length) {
      console.error(p.join('\n'));
      process.exit(1);
    }
    console.log('shared files are in sync');
  } else {
    for (const { from, to } of SHARED) {
      const dest = join(DEST, to);
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, readFileSync(join(ROOT, from)));
    }
    writeFileSync(join(DEST, 'manifest.json'), `${JSON.stringify(computeManifest(), null, 2)}\n`);
    console.log('synced', SHARED.length, 'files');
  }
}
