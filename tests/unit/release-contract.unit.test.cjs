const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (
      entry.name === '.git'
      || entry.name === 'node_modules'
      || file === path.join(root, 'game/vendor')
    ) return [];
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('release documentation describes the current local GitHub Pages build', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /^# 雁火渡江：夏日回响$/m);
  assert.match(readme, /当前版本包含序章和“芦苇深处的声音”第一章/);
  assert.match(readme, /仅保留普通游戏入口/);
  assert.match(readme, /桌面端支持键盘和鼠标方向按钮移动/);
  assert.match(readme, /按住并拖拽指针调整视角/);
  assert.match(readme, /点击、E、Enter 或 Space/);
  assert.match(readme, /粗指针设备使用屏幕摇杆/);
  assert.match(readme, /自动画质会在性能不足时降档/);
  assert.match(readme, /所有运行时资源均保存在仓库本地/);
  assert.match(readme, /启动预览：`npm run preview`/);
  assert.match(readme, /全部测试：`npm test`/);
  assert.match(readme, /运行时资源全部使用相对路径，不依赖 CDN/);
  assert.match(readme, /历史回响是依据核实资料创作的艺术化表达，不代表真实人物原话/);
  assert.match(readme, /`game\/vendor\/THREE-LICENSE\.txt`/);
});

test('release ignores work artifacts and contains no teacher or chapter entry points', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.superpowers\/$/m);

  const releaseFiles = [
    path.join(root, 'index.html'),
    ...walk(path.join(root, 'game')).filter((file) => (
      ['.cjs', '.html', '.js', '.mjs'].includes(path.extname(file))
    ))
  ];
  const forbiddenMarkers = [
    'mode=teacher',
    'teacher-browse',
    'chapter-menu',
    'openTeacherChapter'
  ];

  for (const file of releaseFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const marker of forbiddenMarkers) {
      assert.equal(
        source.includes(marker),
        false,
        `${path.relative(root, file)} contains disabled release marker ${marker}`
      );
    }
  }
});

test('homepage and game declare the local Yanhuo favicon', () => {
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');
  assert.match(homepage, /<link rel="icon" type="image\/png" href="assets\/generated\/stamp-yanhuo\.png">/);
  assert.match(game, /<link rel="icon" type="image\/png" href="\.\.\/assets\/generated\/stamp-yanhuo\.png">/);
  assert.equal(fs.existsSync(path.join(root, 'assets/generated/stamp-yanhuo.png')), true);
});

test('homepage and game assets stay within release budgets', () => {
  const homepageBytes = fs.statSync(path.join(root, 'index.html')).size
    + fs.statSync(path.join(root, 'styles.css')).size
    + fs.statSync(path.join(root, 'assets/generated/hero-summer-echo.jpg')).size;
  assert.ok(homepageBytes < 12 * 1024 * 1024, `homepage bytes: ${homepageBytes}`);

  const gameAssetBytes = walk(path.join(root, 'game'))
    .reduce((sum, file) => sum + fs.statSync(file).size, 0);
  assert.ok(gameAssetBytes < 25 * 1024 * 1024, `game asset bytes: ${gameAssetBytes}`);
});
