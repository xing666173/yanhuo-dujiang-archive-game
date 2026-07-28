const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('default Playwright gate serializes WebGL projects', () => {
  const config = fs.readFileSync(path.join(root, 'playwright.config.mjs'), 'utf8');
  assert.match(
    config,
    /\bworkers:\s*1\b/,
    'the default release gate must not run multiple WebGL game flows concurrently'
  );
});
