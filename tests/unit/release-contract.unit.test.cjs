const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const publishedSourceExtensions = new Set(['.css', '.html', '.js', '.mjs']);
const nonReleaseDirectories = new Set([
  '.git',
  '.github',
  '.superpowers',
  '.worktrees',
  'coverage',
  'docs',
  'node_modules',
  'playwright-report',
  'test-results',
  'tests',
  'tools'
]);
const nonReleaseSourceFiles = new Set(['playwright.config.mjs']);

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

function enumeratePublishedSources(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && nonReleaseDirectories.has(entry.name)) return [];

    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return enumeratePublishedSources(file);

    const relativeFile = path.relative(root, file).split(path.sep).join('/');
    if (nonReleaseSourceFiles.has(relativeFile)) return [];
    return publishedSourceExtensions.has(path.extname(file).toLowerCase()) ? [file] : [];
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

test('release documentation describes the collaborative field-task loop and local scoring', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /晨雾取景/);
  assert.match(readme, /路线节奏/);
  assert.match(readme, /安静收声/);
  assert.match(readme, /简报.*互动任务.*结果对话.*章节评分/s);
  assert.match(readme, /鼠标、键盘和手机触控/);
  assert.match(readme, /取景.*跟随目标/s);
  assert.match(readme, /游标.*接近.*节点.*按键/s);
  assert.match(readme, /安静.*按住.*收声/s);
  assert.match(readme, /取消.*重新尝试/s);
  assert.match(readme, /刷新.*继续/s);
  assert.match(readme, /每项任务按 1-3 星评定/);
  assert.match(readme, /总分仅保存在当前浏览器本地/);
  assert.match(readme, /不是教师评分/);
  assert.match(readme, /不上传/);
  assert.match(readme, /不联网/);
  assert.match(readme, /无排行榜/);
});

test('published HTML and JavaScript expose the field-task release contract', () => {
  const releaseFiles = enumeratePublishedSources();
  const releasePaths = new Set(releaseFiles.map((file) => (
    path.relative(root, file).split(path.sep).join('/')
  )));
  const htmlSource = releaseFiles
    .filter((file) => path.extname(file).toLowerCase() === '.html')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const javascriptSource = releaseFiles
    .filter((file) => ['.js', '.mjs'].includes(path.extname(file).toLowerCase()))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.equal(releasePaths.has('game/index.html'), true);
  assert.equal(releasePaths.has('game/core/field-task-engine.mjs'), true);
  assert.equal(releasePaths.has('game/ui/field-task-view.mjs'), true);
  assert.match(htmlSource, /field-task-layer/);
  assert.match(javascriptSource, /field-task-engine\.mjs/);
  assert.match(javascriptSource, /field-task-view\.mjs/);
  for (const taskTitle of ['晨雾取景', '路线节奏', '安静收声']) {
    assert.match(javascriptSource, new RegExp(taskTitle));
  }
});

test('release ignores work artifacts and contains no teacher or chapter entry points', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.superpowers\/$/m);

  const releaseFiles = enumeratePublishedSources();
  const releasePaths = new Set(releaseFiles.map((file) => (
    path.relative(root, file).split(path.sep).join('/')
  )));
  const requiredPublishedVendorFiles = [
    'game/vendor/three.module.min.js',
    'game/vendor/three.core.min.js'
  ];
  assert.deepEqual(
    requiredPublishedVendorFiles.filter((file) => releasePaths.has(file)),
    requiredPublishedVendorFiles,
    'forbidden-marker scan must include published vendor JavaScript'
  );
  const forbiddenMarkers = [
    'mode=teacher',
    'teacher-browse',
    'chapter-menu',
    'openTeacherChapter',
    '教师模式',
    '证据匹配',
    '档案修复',
    '修复档案',
    '材料拼接'
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
