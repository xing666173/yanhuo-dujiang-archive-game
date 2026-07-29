const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const portraitHero = path.join(root, 'assets/generated/hero-summer-echo-portrait.jpg');

test('mobile portrait hero is a local 1024 by 1536 JPEG', async () => {
  assert.equal(fs.existsSync(portraitHero), true, 'missing generated portrait hero');

  const metadata = await sharp(portraitHero).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: 'jpeg', width: 1024, height: 1536 }
  );
});
