const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

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
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const scriptName of ['preview', 'test', 'test:unit', 'test:e2e']) {
    assert.equal(
      typeof packageJson.scripts?.[scriptName],
      'string',
      `package.json must define the ${scriptName} script`
    );
    assert.notEqual(
      packageJson.scripts[scriptName].trim(),
      '',
      `package.json ${scriptName} script must not be empty`
    );
  }

  assert.match(readme, /^# 雁火渡江：夏日回响$/m);
  assert.match(readme, /当前版本包含序章和“芦苇深处的声音”第一章/);
  assert.match(readme, /仅保留普通游戏入口/);
  assert.match(readme, /桌面端支持键盘和鼠标方向按钮移动/);
  assert.match(readme, /按住并拖拽指针调整视角/);
  assert.match(readme, /点击、E、Enter 或 Space/);
  assert.match(readme, /粗指针设备使用屏幕摇杆/);
  assert.match(readme, /自动画质会在性能不足时降档/);
  assert.match(readme, /所有运行时资源均保存在仓库本地/);
  assert.match(readme, /安装 Node\.js 依赖：`npm install`/);
  assert.match(readme, /启动预览：`npm run preview`/);
  assert.match(readme, /打开 `http:\/\/127\.0\.0\.1:4173\/`/);
  assert.match(readme, /全部测试：`npm test`/);
  assert.match(readme, /仅逻辑与静态检查：`npm run test:unit`/);
  assert.match(readme, /仅浏览器流程：`npm run test:e2e`/);
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
  assert.match(readme, /刷新后会回到该任务入口/);
  assert.match(readme, /任务内的准星位置、计时和失误不保存/);
  assert.match(readme, /任务会从头开始/);
  assert.match(readme, /每项任务按 1-3 星评定/);
  assert.match(readme, /总分仅保存在当前浏览器本地/);
  assert.match(readme, /不是教师评分/);
  assert.match(readme, /不上传/);
  assert.match(readme, /不联网/);
  assert.match(readme, /无排行榜/);
});

test('published field-task entry points are wired through their exact release files', async () => {
  const releasePaths = [
    'game/index.html',
    'game/main.mjs',
    'game/core/field-task-engine.mjs',
    'game/ui/field-task-view.mjs',
    'game/data/field-tasks.mjs'
  ];
  for (const releasePath of releasePaths) {
    assert.equal(fs.existsSync(path.join(root, releasePath)), true, `${releasePath} must be published`);
  }

  const game = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');
  const taskLayer = game.match(/<section\b[^>]*\bid="field-task-layer"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(taskLayer, 'game/index.html must contain the field task layer');
  assert.match(taskLayer, /\bclass="[^"]*\bfield-task-layer\b[^"]*"/);
  assert.match(taskLayer, /\baria-label="实地任务"/);
  assert.match(taskLayer, /\bhidden\b/);
  for (const attribute of [
    'data-field-teammate',
    'data-field-title',
    'data-field-cancel',
    'data-field-stage',
    'data-focus-stage',
    'data-focus-target',
    'data-focus-aim',
    'data-timing-stage',
    'data-route-marker',
    'data-route-nodes',
    'data-listening-stage',
    'data-sound-wave',
    'data-field-action',
    'data-field-progress',
    'data-field-status',
    'data-field-result',
    'data-field-stars',
    'data-field-submit'
  ]) {
    assert.match(taskLayer, new RegExp(`\\b${attribute}\\b`));
  }

  const main = fs.readFileSync(path.join(root, 'game/main.mjs'), 'utf8');
  assert.match(
    main,
    /^import\s+\{\s*createFieldTaskView\s*\}\s+from\s+['"]\.\/ui\/field-task-view\.mjs['"];?$/m
  );
  const viewConstruction = main.match(
    /fieldTask\s*=\s*createFieldTaskView\s*\(\s*root\s*,\s*\{[\s\S]*?\}\s*\);/
  )?.[0];
  assert.ok(viewConstruction, 'game/main.mjs must construct the field task view');
  assert.match(
    viewConstruction,
    /onSubmit\s*\(\s*result\s*\)\s*\{\s*session\?\.completeFieldTask\s*\(\s*result\s*\)\s*;?\s*\}/s
  );
  assert.match(
    viewConstruction,
    /onCancel\s*\(\s*\)\s*\{\s*session\?\.cancelFieldTask\s*\(\s*\)\s*;?\s*\}/s
  );

  const view = fs.readFileSync(path.join(root, 'game/ui/field-task-view.mjs'), 'utf8');
  assert.match(
    view,
    /^import\s+\{\s*createFieldTaskEngine\s*\}\s+from\s+['"]\.\.\/core\/field-task-engine\.mjs['"];?$/m
  );
  assert.match(view, /engine\s*=\s*createFieldTaskEngine\s*\(\s*config\s*\)/);

  const fieldTasksUrl = pathToFileURL(path.join(root, 'game/data/field-tasks.mjs')).href;
  const { FIELD_TASKS } = await import(fieldTasksUrl);
  assert.deepEqual(
    Object.fromEntries(Object.entries(FIELD_TASKS).map(([id, config]) => [id, config.title])),
    {
      'camera-spot': '晨雾取景',
      'notes-spot': '路线节奏',
      'voice-spot': '安静收声'
    }
  );
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
  assert.equal(releasePaths.has('README.md'), false);
  assert.equal(
    [...releasePaths].some((file) => (
      file.startsWith('tests/')
      || file.startsWith('docs/')
      || file.startsWith('.superpowers/')
    )),
    false,
    'forbidden-marker scan must exclude documentation and test text'
  );
  const forbiddenPatterns = [
    { label: 'teacher identifier', pattern: /teacher/i },
    { label: 'mode and teacher branch', pattern: /(?:mode[\s\S]{0,40}teacher|teacher[\s\S]{0,40}mode)/i },
    { label: '教师模式或教师浏览', pattern: /教师\s*(?:模式|浏览)/u },
    { label: '章节直达或章节菜单', pattern: /章节\s*(?:直达|菜单)/u },
    { label: 'chapter menu entry point', pattern: /(?:show|open)?[-_\s]*chapter[-_\s]*menu/i },
    { label: '证据匹配', pattern: /证据\s*匹配/u },
    { label: 'evidence matching', pattern: /evidence[-_\s]*(?:match|matching)/i },
    { label: '档案修复或修复档案', pattern: /(?:档案\s*修复|修复\s*档案)/u },
    { label: 'archive repair', pattern: /(?:archive[-_\s]*repair|repair[-_\s]*archive)/i },
    { label: '材料拼接或材料归档', pattern: /材料\s*(?:拼接|归档)/u },
    {
      label: 'material splice or archive',
      pattern: /(?:materials?[-_\s]*(?:splice|splicing|stitch|stitching|merge|merging|archive|archiving)|(?:splice|splicing|stitch|stitching|merge|merging|archive|archiving)[-_\s]*materials?)/i
    }
  ];
  const forbiddenExamples = [
    'teacher',
    'teacherBrowse',
    'showTeacherMenu',
    "mode === 'teacher'",
    'mode=teacher',
    '教师模式',
    '教师浏览',
    '章节直达',
    '章节菜单',
    'chapter-menu',
    'chapterMenu',
    'show chapter menu',
    'showChapterMenu',
    '证据匹配',
    'evidence-match',
    'evidenceMatching',
    '档案修复',
    '修复档案',
    'archive-repair',
    'repairArchive',
    '材料拼接',
    '材料归档',
    'material-splicing',
    'materialArchive',
    'archiveMaterials'
  ];
  for (const example of forbiddenExamples) {
    assert.equal(
      forbiddenPatterns.some(({ pattern }) => pattern.test(example)),
      true,
      `forbidden release patterns must cover ${example}`
    );
  }

  for (const file of releaseFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const { label, pattern } of forbiddenPatterns) {
      assert.doesNotMatch(
        source,
        pattern,
        `${path.relative(root, file)} contains disabled release marker ${label}`
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
