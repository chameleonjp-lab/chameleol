import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome } from './helpers.mjs';

test('home ranking icon and link label center within the same-height mobile tile', async () => {
  const app = await launch({ width: 402, height: 700 });
  try {
    await openHome(app.page, app.url);
    for (const lang of ['ja', 'de', 'ru']) {
      await app.page.locator('.home-language select').selectOption(lang);
      const boxes = await app.page.getByTestId('home-ranking').evaluate(link => {
        const [icon, label] = link.children;
        const rect = link.getBoundingClientRect();
        const yCenter = element => {
          const r = element.getBoundingClientRect();
          return r.y + r.height / 2;
        };
        const sibling = document.querySelector('[data-testid="home-practice"]');
        return {
          center: yCenter(link), icon: yCenter(icon), label: yCenter(label),
          height: rect.height, sibling: sibling.getBoundingClientRect().height,
          right: rect.right, width: document.documentElement.clientWidth,
        };
      });
      assert.ok(Math.abs(boxes.center - boxes.icon) < 1, JSON.stringify(boxes));
      assert.ok(Math.abs(boxes.center - boxes.label) < 1, JSON.stringify(boxes));
      assert.equal(boxes.height, boxes.sibling);
      assert.ok(boxes.right <= boxes.width);
    }
    assert.match(await app.page.getByTestId('home-ranking').getAttribute('href'), /ranking\.html\?game=chameleol$/);
  } finally {
    await app.close();
  }
});
