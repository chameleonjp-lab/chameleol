import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonDistance } from './polygon-distance.mjs';
const rectangle = (l, t, r, b) => [[l, t], [r, t], [r, b], [l, b]];

for (const [name, A, B, expected] of [
  ['crossing thin rectangles without interior vertices', rectangle(-20, -1, 20, 1), rectangle(-1, -20, 1, 20), 0],
  ['contained polygon', rectangle(-20, -20, 20, 20), rectangle(-1, -1, 1, 1), 0],
  ['touching parallel edges', rectangle(0, 0, 2, 2), rectangle(2, 0, 4, 2), 0],
  ['touching vertex', rectangle(0, 0, 2, 2), rectangle(2, 2, 4, 4), 0],
  ['collinear separated edges', rectangle(0, 0, 2, 2), rectangle(8, 0, 10, 2), 6],
  ['diagonally separated polygons', rectangle(0, 0, 2, 2), rectangle(5, 6, 7, 8), 5],
  ['crossing degenerate line segments', [[-20, 0], [20, 0]], [[0, -20], [0, 20]], 0],
  ['separated degenerate line segments', [[0, 0], [1, 0]], [[4, 0], [5, 0]], 3],
]) test(`polygon distance: ${name}`, () => {
  assert.equal(polygonDistance(A, B), expected);
  assert.equal(polygonDistance(B, A), expected, 'symmetric');
  assert.equal(polygonDistance([...A].reverse(), [...B].reverse()), expected, 'winding does not matter');
});

test('empty projection has no measured distance', () => {
  assert.equal(polygonDistance([], rectangle(0, 0, 1, 1)), Infinity);
  assert.equal(polygonDistance(null, null), Infinity);
});
