import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const asset = name => fileURLToPath(new URL(`../../src/presentation/assets/${name}`, import.meta.url));

function webpSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return {kind, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1};
  }
  if (kind === 'VP8X') return {kind, width: (b.readUIntLE(24, 3)) + 1, height: (b.readUIntLE(27, 3)) + 1};
  return {kind, width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff};
}

test('street atlas grows to 8x12 and keeps the 61 existing cells at their indexes', () => {
  const atlas = JSON.parse(readFileSync(asset('atlas.json'), 'utf8'));
  assert.equal(atlas.columns, 8);
  assert.equal(atlas.rows, 12);
  assert.equal(atlas.height, 1536);
  const names = Object.keys(atlas.street);
  assert.equal(names.length, 80);
  names.forEach((name, i) => assert.equal(atlas.street[name].index, i, name));
  assert.equal(atlas.street.pavement0.index, 0);
  assert.equal(atlas.street.residentFace.index, 60);
  assert.deepEqual(names.slice(61), ['crossingPost', 'crossingPostLit', 'crossingArm', 'tram', 'droneA', 'droneB', 'midFlag', 'gutterWaterA', 'gutterWaterB', 'gutterSwirl', 'robotPaint', 'robotFoot', 'robotLook', 'paintStripe', 'birdCarryA', 'birdCarryB', 'parcel', 'rope', 'footprint']);
  for (const [name, cell] of Object.entries(atlas.street)) {
    assert.equal(cell.x, (cell.index % 8) * 128, name);
    assert.equal(cell.y, Math.floor(cell.index / 8) * 128, name);
  }
});

test('street atlas image is 1024x1536 and every image stays inside the budgets', () => {
  const size = webpSize(asset('atlas.webp'));
  assert.deepEqual([size.width, size.height], [1024, 1536]);
  const compressed = ['atlas.webp', 'result-atlas.webp', 'detected.webp'].reduce((n, f) => n + statSync(asset(f)).size, 0);
  assert.ok(compressed <= 1.5 * 1024 * 1024, `compressed ${compressed}`);
  // Decoded size held during play: the street atlas plus the ending comic (the result atlas belongs to another screen).
  const sizes = ['atlas.webp', 'detected.webp'].map(f => webpSize(asset(f)));
  const decoded = sizes.reduce((n, s) => n + s.width * s.height * 4, 0);
  assert.ok(decoded <= 16 * 1024 * 1024, `decoded ${decoded}`);
});
