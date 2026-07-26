const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_VERSION = '0.185.1';
const root = path.resolve(__dirname, '..');
const packageEntry = require.resolve('three', { paths: [root] });
const packageDirectory = path.resolve(path.dirname(packageEntry), '..');
const packagePath = path.join(packageDirectory, 'package.json');
const packageMetadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (packageMetadata.version !== EXPECTED_VERSION) {
  throw new Error(`Expected three ${EXPECTED_VERSION}, found ${packageMetadata.version}`);
}

const destination = path.join(root, 'game', 'vendor');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(
  path.join(packageDirectory, 'build', 'three.module.min.js'),
  path.join(destination, 'three.module.min.js')
);
fs.copyFileSync(
  path.join(packageDirectory, 'build', 'three.core.min.js'),
  path.join(destination, 'three.core.min.js')
);
fs.copyFileSync(
  path.join(packageDirectory, 'LICENSE'),
  path.join(destination, 'THREE-LICENSE.txt')
);

console.log(`Vendored three ${EXPECTED_VERSION} to game/vendor`);
