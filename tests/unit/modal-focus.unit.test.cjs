const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { chromium } = require('@playwright/test');
const { createStaticServer } = require('../../tools/serve.cjs');

const root = path.resolve(__dirname, '../..');

test('modal focus scope enters, traps, restores, falls back, and destroys cleanly', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const { port } = server.address();
  await page.goto(`http://127.0.0.1:${port}/game/`, { waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const { createModalFocusScope } = await import('/game/ui/modal-focus.mjs');
    const opener = document.createElement('button');
    opener.dataset.opener = '';
    opener.textContent = '打开';
    const dialog = document.createElement('section');
    dialog.innerHTML = [
      '<button type="button" data-first>第一项</button>',
      '<button type="button" data-primary>主要操作</button>',
      '<button type="button" data-last>最后一项</button>'
    ].join('');
    document.body.append(opener, dialog);
    opener.focus();
    window.__focusFixture = {
      dialog,
      opener,
      scope: createModalFocusScope(dialog)
    };
    window.__focusFixture.scope.open('[data-primary]');
  });

  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-primary')),
    true
  );

  await page.locator('[data-last]').focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-first')),
    true
  );

  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-last')),
    true
  );

  await page.evaluate(() => window.__focusFixture.scope.close());
  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-opener')),
    true
  );

  const fallbackAndDestroy = await page.evaluate(() => {
    const { dialog, opener, scope } = window.__focusFixture;
    opener.focus();
    scope.open('[data-primary]');
    opener.remove();
    scope.close();
    const fallbackIsBody = document.activeElement === document.body;

    scope.open('[data-first]');
    scope.destroy();
    scope.destroy();
    dialog.querySelector('[data-last]').focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });
    dialog.querySelector('[data-last]').dispatchEvent(event);
    return {
      fallbackIsBody,
      destroyRemovedListener: !event.defaultPrevented
    };
  });

  assert.deepEqual(fallbackAndDestroy, {
    fallbackIsBody: true,
    destroyRemovedListener: true
  });
});
