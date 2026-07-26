const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { createStaticServer } = require('../../tools/serve.cjs');

test('serves the homepage and rejects path traversal', async (t) => {
  const server = createStaticServer({ rootDir: path.resolve(__dirname, '../..') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const { port } = server.address();
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /^text\/html/);

  const traversal = await fetch(`http://127.0.0.1:${port}/..%2Fpackage.json`);
  assert.equal(traversal.status, 403);
});
