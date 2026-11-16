import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { RESULT_ATLAS, PORTRAIT_BOUNDS } from '../../src/presentation/assets/result-atlas-bounds.js';
import { buildResultData } from '../../src/presentation/result-data.js';
import { mountResultPresentation } from '../../src/presentation/result-view.js';
import { createPresentationScope } from '../../src/presentation/scope.js';
import { DISTRICT_STARTS, districtIndexForBuilding } from '../../src/presentation/result-sky.js';

const asset = (name) => new URL(`../../src/presentation/assets/${name}`, import.meta.url);

function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = bytes.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error(`unknown webp chunk ${kind}`);
}

test('result atlas is packed to 1920x1520 and the file really has that size', async () => {
  assert.equal(RESULT_ATLAS.width, 1920);
  assert.equal(RESULT_ATLAS.height, 1520);
  assert.equal(RESULT_ATLAS.width * RESULT_ATLAS.height * 4, 11_673_600);
  const bytes = await readFile(asset('result-atlas.webp'));
  assert.deepEqual(webpSize(bytes), [1920, 1520]);
  const meta = JSON.parse(await readFile(asset('result-atlas.json'), 'utf8'));
  assert.equal(meta.width, 1920);
  assert.equal(meta.height, 1520);
  assert.deepEqual(meta.reaction, RESULT_ATLAS.reaction);
});

test('every atlas cell is inside the image and no two cells overlap', () => {
  const cells = [...RESULT_ATLAS.backgrounds, ...RESULT_ATLAS.portraits, RESULT_ATLAS.reaction].map((c) => ({ id: c.id, rect: c.rect }));
  assert.equal(cells.length, 10);
  for (const { id, rect: [x, y, w, h] } of cells) {
    assert.ok(x >= 0 && y >= 0 && x + w <= RESULT_ATLAS.width && y + h <= RESULT_ATLAS.height, `${id} inside`);
  }
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const [ax, ay, aw, ah] = cells[i].rect;
      const [bx, by, bw, bh] = cells[j].rect;
      const apart = ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay;
      assert.ok(apart, `${cells[i].id} and ${cells[j].id} do not overlap`);
    }
  }
  assert.deepEqual(RESULT_ATLAS.reaction.rect, [1280, 400, 240, 360]);
  assert.deepEqual(RESULT_ATLAS.portraits.map((p) => p.rect[1]), [800, 800, 800, 800]);
  assert.deepEqual(Object.keys(PORTRAIT_BOUNDS), ['clear', 'detected', 'quit', 'proud']);
});

test('result-view computes sprite positions from the atlas table, not from a 2048 literal', () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const host = document.getElementById('r');
  const scope = createPresentationScope({ id: 'atlas', kind: 'result' });
  try {
    const data = buildResultData({ summary: { buildings: 0, maxCombo: 0, perBuilding: [], score: { total: 0 }, endReason: 'quit' } });
    const view = mountResultPresentation({ host, data, scope });
    const portrait = view.sceneElement.querySelector('button');
    const [, py, pw, ph] = RESULT_ATLAS.portraits.find((p) => p.id === data.portraitId).rect;
    const size = portrait.style.backgroundSize;
    assert.equal(size, `${(1920 / pw) * 100}% ${(1520 / ph) * 100}%`);
    assert.ok(portrait.style.backgroundPosition.endsWith(`${(py / (1520 - ph)) * 100}%`), portrait.style.backgroundPosition);
    portrait.click();
    const [gx, gy, gw, gh] = RESULT_ATLAS.reaction.rect;
    assert.equal(portrait.style.backgroundPosition, `${(gx / (1920 - gw)) * 100}% ${(gy / (1520 - gh)) * 100}%`);
    view.dispose();
  } finally { scope.dispose(); }
});

test('district index follows the five district starts', () => {
  assert.deepEqual(DISTRICT_STARTS, [1, 20, 23, 30, 40]);
  assert.deepEqual([1, 19, 20, 22, 23, 29, 30, 39, 40, 50].map(districtIndexForBuilding), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(districtIndexForBuilding(null), 0);
});
