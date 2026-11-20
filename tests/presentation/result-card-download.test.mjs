import test from 'node:test';
import assert from 'node:assert/strict';
import { requestResultCardDownload } from '../../src/presentation/result-card-download.js';

const createDoc = (events, failClick = false) => ({
  body: { append() { events.push('append'); } },
  createElement(tag) {
    events.push('create:' + tag);
    return {
      set href(value) { events.push('href:' + value); },
      set download(value) { events.push('name:' + value); },
      click() { events.push('click'); if (failClick) throw new Error('blocked'); },
      remove() { events.push('remove'); },
    };
  },
});

test('one tap triggers one PNG download without a viewer or confirm dialog', () => {
  const events = [];
  const doc = createDoc(events);
  const controller = { getImageUrl() { events.push('get-image'); return 'blob:card-test'; } };
  assert.equal(requestResultCardDownload({ controller, doc }), true);
  assert.deepEqual(events, [
    'get-image', 'create:a', 'href:blob:card-test',
    'name:chameleol-result.png', 'append', 'click', 'remove',
  ]);
});

test('no image leaves the page untouched', () => {
  const events = [];
  assert.equal(requestResultCardDownload({ controller: { getImageUrl: () => null }, doc: createDoc(events) }), false);
  assert.deepEqual(events, []);
});

test('blocked download reports failure and removes the temporary link', () => {
  const events = [];
  assert.equal(requestResultCardDownload({
    controller: { getImageUrl: () => 'blob:card-test' }, doc: createDoc(events, true),
  }), false);
  assert.equal(events.at(-1), 'remove');
});
