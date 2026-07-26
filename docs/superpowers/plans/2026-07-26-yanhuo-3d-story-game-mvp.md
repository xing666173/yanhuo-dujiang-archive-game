# 《雁火渡江：夏日回响》第一阶段可玩原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 GitHub Pages 档案修复网页改造成《雁火渡江：夏日回响》的入口，并完成“序章 + 白洋淀第一章”的 3D 剧情可玩原型。

**Architecture:** 保持 GitHub Pages 直接发布静态文件的方式。首页只负责项目入口与实践信息，`game/` 负责游戏；剧情、存档、3D 场景、界面分别使用独立 ES Module。Three.js 固定版本后复制为本地静态依赖，浏览器运行时不访问 CDN。

**Tech Stack:** HTML5、CSS、JavaScript ES Modules、Three.js 0.185.1、Node.js 内置测试、Playwright Test 1.61.1、GitHub Pages

## Global Constraints

- 第一阶段只实现“序章 + 第一章：芦苇深处的声音”和简化章节结算。
- 三名主角固定为顾言（男）、陈屿（男）、林夏（女）。
- 核心玩法只能是 3D 探索、角色对话、剧情选择和历史回响，不得恢复证据匹配、材料归档、档案修复或知识答题。
- 游戏使用第三人称视角；桌面端支持 WASD、方向键和鼠标拖动；移动端支持虚拟摇杆和触摸视角。
- 主页面和游戏页面都必须使用相对路径，确保部署在 GitHub Pages 项目子路径下仍然工作。
- 浏览器运行时不得请求外部图片、脚本、字体、音频或模型。
- 首屏必要下载资源不超过 12 MB，第一章全部资源不超过 25 MB。
- Three.js 固定为 `0.185.1`，Playwright Test 固定为 `1.61.1`。
- 角色美术必须明确呈现两名男生和一名女生，服装、发型和配色在所有立绘中保持一致。
- 无法核实的历史对白只能标为“回响”或艺术化表达，不得伪装成真实人物原话。
- 页面卡片圆角不超过 8px；不使用装饰性渐变球、营销式浮动卡片或大面积紫蓝、米色、深蓝单色主题。
- 目标性能为普通桌面设备 45 至 60 FPS，中端移动设备不低于 30 FPS；设备性能不足时关闭阴影和后处理。
- 每个任务必须先看到对应测试失败，再完成最小实现并看到测试通过。

---

## File Map

### Repository and test foundation

- `package.json`: 项目命令和固定开发依赖。
- `package-lock.json`: 依赖锁定文件。
- `.gitignore`: 忽略 `node_modules/`、测试截图临时目录和系统文件。
- `playwright.config.mjs`: 浏览器测试设备、服务器和失败截图配置。
- `tools/serve.cjs`: 无外部依赖的本地静态服务器。
- `tools/vendor-three.cjs`: 从固定 npm 包复制 Three.js 浏览器模块和许可证。
- `tests/unit/`: 纯逻辑、静态页面和资源预算测试。
- `tests/e2e/`: 桌面端和移动端浏览器流程测试。

### Project homepage

- `index.html`: 新项目入口、团队信息、实践路线和创作说明。
- `styles.css`: 首页视觉系统和响应式布局。
- `assets/generated/hero-summer-echo.jpg`: 首页全屏主视觉。

### Game shell

- `game/index.html`: 3D 画布和所有游戏界面挂载点。
- `game/styles.css`: 游戏菜单、对话、选项、设置、触控和回响样式。
- `game/main.mjs`: 组合剧情、存档、场景和界面，不承担各模块内部逻辑。
- `game/vendor/three.module.min.js`: 本地 Three.js 0.185.1 浏览器模块。
- `game/vendor/THREE-LICENSE.txt`: Three.js MIT 许可证。

### Narrative

- `game/data/characters.mjs`: 角色姓名、性别、配色、立绘和表情映射。
- `game/data/prologue.mjs`: 序章对白与第一次选择。
- `game/data/reeds.mjs`: 白洋淀三个热点、历史回响和章节结算对白。
- `game/data/scripts.mjs`: 合并并导出可用剧本。
- `game/core/story-engine.mjs`: 当前节点、推进、选择、数值和已读记录。
- `game/core/session-controller.mjs`: 场景进度、热点完成和章节解锁。
- `game/core/save-store.mjs`: 存档、设置、损坏数据回退和版本号。
- `game/core/proximity.mjs`: 玩家与热点的距离判断。
- `game/core/navigation.mjs`: 把玩家移动限制在活动室地面和木栈道可行走区域。
- `game/audio/audio-manager.mjs`: 使用 Web Audio 生成本地环境声、轻音乐动机和界面提示音。

### 3D runtime

- `game/scenes/activity-room.mjs`: 活动室布局、边界、出生点和热点定义。
- `game/scenes/reeds-wetland.mjs`: 木栈道、芦苇水面、边界和热点定义。
- `game/render/scene-builder.mjs`: 把纯场景定义转成 Three.js 对象。
- `game/render/world.mjs`: renderer、camera、玩家、移动、视角、缩放和帧循环。
- `game/render/quality.mjs`: WebGL 检测、设备画质选择和降级配置。

### UI and visual assets

- `game/ui/game-shell.mjs`: 主菜单、章节浏览、加载、暂停和设置面板。
- `game/ui/dialogue-view.mjs`: 对话文本、立绘、选项、历史和自动播放。
- `game/ui/touch-controls.mjs`: 虚拟摇杆、触摸视角和交互按钮。
- `game/assets/generated/gu-yan-expressions.png`: 顾言五表情立绘横向表。
- `game/assets/generated/chen-yu-expressions.png`: 陈屿五表情立绘横向表。
- `game/assets/generated/lin-xia-expressions.png`: 林夏五表情立绘横向表。

---

### Task 1: Reproducible test and preview foundation

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tools/serve.cjs`
- Create: `tests/unit/static-server.unit.test.cjs`

**Interfaces:**
- Produces: `createStaticServer({ rootDir: string }): http.Server`
- Produces: `npm run preview`, `npm run test:unit`, `npm run test:e2e`, `npm test`
- Consumes: no project modules

- [ ] **Step 1: Write the failing static server test**

```js
// tests/unit/static-server.unit.test.cjs
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
```

- [ ] **Step 2: Run the focused test and verify the failure**

Run:

```powershell
node --test tests/unit/static-server.unit.test.cjs
```

Expected: FAIL with `Cannot find module '../../tools/serve.cjs'`.

- [ ] **Step 3: Add the fixed dependency and command configuration**

```json
{
  "name": "yanhuo-summer-echo",
  "private": true,
  "scripts": {
    "preview": "node tools/serve.cjs",
    "vendor:three": "node tools/vendor-three.cjs",
    "test:unit": "node --test tests/unit",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:e2e"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "three": "0.185.1"
  }
}
```

`.gitignore` must contain exactly these project entries:

```gitignore
node_modules/
test-results/
playwright-report/
*.log
.DS_Store
Thumbs.db
```

Run:

```powershell
npm install
```

Expected: `package-lock.json` records Three.js `0.185.1` and Playwright Test `1.61.1`.

- [ ] **Step 4: Implement the dependency-free static server**

```js
// tools/serve.cjs
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function createStaticServer({ rootDir }) {
  const root = path.resolve(rootDir);
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    if (pathname.includes('..')) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(root, relative.replace(/^\/+/, ''));
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      fs.createReadStream(filePath).pipe(response);
    });
  });
}

module.exports = { createStaticServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createStaticServer({ rootDir: path.resolve(__dirname, '..') });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${port}`);
  });
}
```

- [ ] **Step 5: Run the focused test and all current unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS with one static server test and zero failures.

- [ ] **Step 6: Commit the foundation**

```powershell
git add .gitignore package.json package-lock.json tools/serve.cjs tests/unit/static-server.unit.test.cjs
git commit -m "test: add local preview and test foundation"
```

---

### Task 2: Replace the archive homepage with the story-game entry

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Delete: `app.js`
- Create: `assets/generated/hero-summer-echo.jpg`
- Create: `tests/unit/homepage-contract.unit.test.cjs`

**Interfaces:**
- Produces: relative links `game/?mode=new` and `game/?mode=teacher`
- Produces: semantic sections `#entry`, `#team`, `#route`, `#creation-note`
- Consumes: `assets/generated/hero-summer-echo.jpg`

- [ ] **Step 1: Write the failing homepage contract test**

```js
// tests/unit/homepage-contract.unit.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('homepage presents the story game and removes the old repair theme', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const hero = path.join(root, 'assets/generated/hero-summer-echo.jpg');

  assert.match(html, /雁火渡江：夏日回响/);
  assert.match(html, /href="game\/\?mode=new"/);
  assert.match(html, /href="game\/\?mode=teacher"/);
  assert.match(html, /id="team"/);
  assert.match(html, /id="route"/);
  assert.doesNotMatch(`${html}\n${css}`, /证据匹配|档案修复|修复档案/);
  assert.doesNotMatch(`${html}\n${css}`, /https?:\/\//);
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.equal(fs.existsSync(hero), true);
  assert.ok(fs.statSync(hero).size > 100_000);
});
```

- [ ] **Step 2: Run the contract test and verify the failure**

Run:

```powershell
node --test tests/unit/homepage-contract.unit.test.cjs
```

Expected: FAIL because the current title and archive interactions are still present.

- [ ] **Step 3: Generate the full-bleed homepage artwork**

Use the `imagegen` skill with this exact art brief:

```text
Create a polished 16:9 cinematic key art image for a Chinese university social-practice story game. Show exactly three college students, two young men and one young woman, standing together on a real wooden boardwalk beside Baiyangdian water and tall green reeds at clear early-morning light. One man carries a notebook, the other a camera, and the woman carries a small interview recorder. Mature anime-inspired illustration with realistic body proportions, documentary sensitivity, clean faces, natural summer clothing, restrained red accents, visible water and boardwalk, bright enough for readable white title text on the left, no text, no logo, no uniforms, no fantasy effects, no blurred stock-photo look.
```

Inspect the generated image. Reject it if the team count or genders are wrong, if a face is cropped, or if the location is only an abstract background. Save the accepted optimized JPEG as `assets/generated/hero-summer-echo.jpg`, target width 1920 px, quality 86, and file size below 1.5 MB.

- [ ] **Step 4: Replace the homepage markup**

The new `index.html` must be semantic static HTML rather than JavaScript-rendered content. Its title screen must follow this structure:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#171916">
  <title>雁火渡江：夏日回响</title>
  <link rel="preload" href="assets/generated/hero-summer-echo.jpg" as="image">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <a class="skip-link" href="#entry">跳到主要内容</a>
  <header class="site-header" aria-label="项目导航">
    <a class="wordmark" href="#entry">雁火渡江</a>
    <nav>
      <a href="#team">团队</a>
      <a href="#route">实践路线</a>
      <a href="#creation-note">创作说明</a>
    </nav>
  </header>
  <main>
    <section class="title-screen" id="entry">
      <div class="title-screen__shade"></div>
      <div class="title-screen__content">
        <p class="eyebrow">暑期社会实践互动作品</p>
        <h1>雁火渡江：夏日回响</h1>
        <p class="lede">三名青年沿着实践路线前行，在一次次对话中重新理解该怎样讲述历史。</p>
        <div class="entry-actions">
          <a class="button button--primary" href="game/?mode=new">开始旅程</a>
          <a class="button button--secondary" href="game/?mode=teacher">教师浏览</a>
        </div>
      </div>
      <a class="next-section" href="#team" aria-label="查看团队"></a>
    </section>
    <section class="team-band" id="team">
      <div class="section-inner">
        <p class="section-kicker">三人实践小队</p>
        <h2>同一段路，三种看见方式</h2>
        <div class="team-grid">
          <article><span>01</span><h3>顾言</h3><p>资料整理与报告结构</p></article>
          <article><span>02</span><h3>陈屿</h3><p>摄影、视频与网页视觉</p></article>
          <article><span>03</span><h3>林夏</h3><p>访谈、文字与人物故事</p></article>
        </div>
      </div>
    </section>
    <section class="route-band" id="route">
      <div class="section-inner">
        <p class="section-kicker">实践路线</p>
        <h2>从芦苇水乡到江岸灯火</h2>
        <ol class="route-list">
          <li><span>01</span><strong>白洋淀</strong><small>芦苇深处的声音</small></li>
          <li><span>02</span><strong>中国国家博物馆</strong><small>展柜前的沉默</small></li>
          <li><span>03</span><strong>雨花台</strong><small>雨中的台阶</small></li>
          <li><span>04</span><strong>渡江胜利纪念馆</strong><small>江边夜谈</small></li>
        </ol>
      </div>
    </section>
    <section class="creation-band" id="creation-note">
      <div class="section-inner">
        <p class="section-kicker">创作说明</p>
        <h2>现实走访与艺术化回响</h2>
        <p>作品依据团队社会实践路线创作。历史回响是建立在核实资料上的艺术化表达，不代表真实人物原话。</p>
      </div>
    </section>
  </main>
</body>
</html>
```

Delete `app.js`. Keep the existing historical image assets in place because deleting unrelated binary files does not help this vertical slice.

- [ ] **Step 5: Replace the homepage styles**

Use these tokens and layout rules as the base of `styles.css`:

```css
:root {
  color-scheme: dark;
  --ink: #171916;
  --paper: #f2f0e9;
  --muted: #b9b9ae;
  --red: #a4342f;
  --red-bright: #d34b3f;
  --green: #315c4d;
  --line: rgba(255, 255, 255, 0.18);
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; color: var(--paper); background: var(--ink); }
a { color: inherit; }
.site-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 5vw;
  border-bottom: 1px solid var(--line);
  background: rgba(16, 18, 16, 0.72);
  backdrop-filter: blur(14px);
}
.title-screen {
  position: relative;
  display: grid;
  min-height: min(92svh, 900px);
  align-items: end;
  overflow: hidden;
  background: url("assets/generated/hero-summer-echo.jpg") center / cover no-repeat;
}
.title-screen__shade {
  position: absolute;
  inset: 0;
  background: rgba(9, 11, 9, 0.42);
}
.title-screen__content {
  position: relative;
  z-index: 1;
  width: min(760px, 90vw);
  padding: 0 5vw 10vh;
}
h1 {
  max-width: 10ch;
  margin: 12px 0 18px;
  font-size: 96px;
  line-height: 0.98;
  letter-spacing: 0;
}
.entry-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border: 1px solid var(--line);
  border-radius: 6px;
  text-decoration: none;
}
.button--primary { border-color: var(--red-bright); background: var(--red); }
.section-inner { width: min(1120px, 90vw); margin: 0 auto; padding: 90px 0; }
.team-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); }
.team-grid article { min-width: 0; padding: 26px 24px 26px 0; border-bottom: 1px solid var(--line); }
.route-band { color: var(--ink); background: #e8e8e0; }
.route-list { padding: 0; list-style: none; border-top: 1px solid rgba(23, 25, 22, 0.25); }
.route-list li { display: grid; grid-template-columns: 64px minmax(180px, 1fr) 1fr; gap: 18px; padding: 20px 0; border-bottom: 1px solid rgba(23, 25, 22, 0.25); }
@media (max-width: 1000px) {
  h1 { font-size: 64px; }
}
@media (max-width: 720px) {
  .site-header nav { display: none; }
  .title-screen { min-height: 86svh; background-position: 62% center; }
  h1 { font-size: 48px; }
  .team-grid { grid-template-columns: 1fr; }
  .route-list li { grid-template-columns: 44px 1fr; }
  .route-list small { grid-column: 2; }
}
```

Add focus-visible states, a skip-link, and reduced-motion rules. Do not add ornamental floating cards or nested cards.

- [ ] **Step 6: Run tests and inspect both viewport sizes**

Run:

```powershell
npm run test:unit
npm run preview
```

Open `http://127.0.0.1:4173/` at 1440 x 1000 and 390 x 844. Verify that the three students are visible, the title does not cover their faces, the next section is hinted below the fold, and both game links resolve under the local project root.

- [ ] **Step 7: Commit the homepage pivot**

```powershell
git add index.html styles.css assets/generated/hero-summer-echo.jpg tests/unit/homepage-contract.unit.test.cjs
git add -u app.js
git commit -m "feat: replace archive page with story game entry"
```

---

### Task 3: Implement the narrative state machine and prototype scripts

**Files:**
- Create: `game/core/story-engine.mjs`
- Create: `game/data/characters.mjs`
- Create: `game/data/prologue.mjs`
- Create: `game/data/reeds.mjs`
- Create: `game/data/scripts.mjs`
- Create: `tests/unit/story-engine.unit.test.mjs`
- Create: `tests/unit/story-data.unit.test.mjs`

**Interfaces:**
- Produces: `createInitialStoryState(): StoryState`
- Produces: `createStoryEngine({ scripts, state }): StoryEngine`
- Produces: `StoryEngine.start(scriptId)`, `advance()`, `choose(optionId)`, `getNode()`, `getState()`
- Produces: `characters: Record<CharacterId, CharacterDefinition>`
- Produces: `scripts: Record<ScriptId, StoryScript>`
- Consumes: no DOM, storage or Three.js APIs

- [ ] **Step 1: Write failing state-machine tests**

```js
// tests/unit/story-engine.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialStoryState, createStoryEngine } from '../../game/core/story-engine.mjs';

const scripts = {
  sample: {
    id: 'sample',
    entry: 'line',
    nodes: {
      line: { id: 'line', type: 'line', speaker: 'lin-xia', text: '出发吧。', next: 'choice' },
      choice: {
        id: 'choice',
        type: 'choice',
        prompt: '先记录什么？',
        options: [
          { id: 'truth', label: '核对资料', effects: { truth: 1, cooperation: 1 }, next: 'end' }
        ]
      },
      end: { id: 'end', type: 'end', outcome: 'sample-complete' }
    }
  }
};

test('advances lines and applies one choice exactly once', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });
  engine.start('sample');
  assert.equal(engine.getNode().id, 'line');
  engine.advance();
  engine.choose('truth');
  assert.deepEqual(engine.getState().stats, { truth: 1, empathy: 0, expression: 0 });
  assert.equal(engine.getState().cooperation, 1);
  assert.equal(engine.getNode().id, 'end');
  assert.throws(() => engine.choose('truth'), /not a choice/i);
});

test('returns immutable snapshots', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });
  engine.start('sample');
  const snapshot = engine.getState();
  snapshot.stats.truth = 99;
  assert.equal(engine.getState().stats.truth, 0);
});
```

- [ ] **Step 2: Run the engine test and verify the failure**

Run:

```powershell
node --test tests/unit/story-engine.unit.test.mjs
```

Expected: FAIL because `story-engine.mjs` does not exist.

- [ ] **Step 3: Implement the pure story engine**

Use this state shape:

```js
{
  version: 1,
  activeScriptId: null,
  activeNodeId: null,
  stats: { truth: 0, empathy: 0, expression: 0 },
  cooperation: 0,
  readNodes: [],
  choices: {},
  completedScripts: []
}
```

`createStoryEngine` must:

- validate that every started script exists;
- allow `advance()` only on `line` and `effect` nodes;
- allow `choose()` only on `choice` nodes;
- add `truth`, `empathy`, `expression`, and `cooperation` effects;
- record the chosen option under the node id;
- prevent applying the same choice twice;
- return `structuredClone` snapshots from `getState()`;
- mark a script completed when an `end` node is reached.

The public implementation skeleton is:

```js
// game/core/story-engine.mjs
export function createInitialStoryState() {
  return {
    version: 1,
    activeScriptId: null,
    activeNodeId: null,
    stats: { truth: 0, empathy: 0, expression: 0 },
    cooperation: 0,
    readNodes: [],
    choices: {},
    completedScripts: []
  };
}

export function createStoryEngine({ scripts, state }) {
  let current = structuredClone(state);

  function getScript() {
    const script = scripts[current.activeScriptId];
    if (!script) throw new Error(`Unknown script: ${current.activeScriptId}`);
    return script;
  }

  function getNode() {
    if (!current.activeNodeId) return null;
    return structuredClone(getScript().nodes[current.activeNodeId]);
  }

  function moveTo(nodeId) {
    const script = getScript();
    if (!script.nodes[nodeId]) throw new Error(`Unknown node: ${nodeId}`);
    current.activeNodeId = nodeId;
    if (!current.readNodes.includes(nodeId)) current.readNodes.push(nodeId);
    if (script.nodes[nodeId].type === 'end' && !current.completedScripts.includes(script.id)) {
      current.completedScripts.push(script.id);
    }
  }

  return {
    start(scriptId) {
      if (!scripts[scriptId]) throw new Error(`Unknown script: ${scriptId}`);
      current.activeScriptId = scriptId;
      moveTo(scripts[scriptId].entry);
      return getNode();
    },
    advance() {
      const node = getNode();
      if (!node || !['line', 'effect'].includes(node.type)) {
        throw new Error('Active node cannot advance');
      }
      moveTo(node.next);
      return getNode();
    },
    choose(optionId) {
      const node = getNode();
      if (!node || node.type !== 'choice') throw new Error('Active node is not a choice');
      if (current.choices[node.id]) throw new Error(`Choice already made: ${node.id}`);
      const option = node.options.find((item) => item.id === optionId);
      if (!option) throw new Error(`Unknown option: ${optionId}`);
      const effects = option.effects || {};
      for (const key of ['truth', 'empathy', 'expression']) {
        current.stats[key] += Number(effects[key] || 0);
      }
      current.cooperation += Number(effects.cooperation || 0);
      current.choices[node.id] = option.id;
      moveTo(option.next);
      return getNode();
    },
    getNode,
    getState: () => structuredClone(current)
  };
}
```

- [ ] **Step 4: Add the exact character definitions**

`characters.mjs` exports these ids and display values:

```js
export const characters = {
  'gu-yan': {
    id: 'gu-yan',
    name: '顾言',
    gender: '男',
    role: '资料整理与报告结构',
    accent: '#70889a',
    portrait: './assets/generated/gu-yan-expressions.png'
  },
  'chen-yu': {
    id: 'chen-yu',
    name: '陈屿',
    gender: '男',
    role: '摄影、视频与网页视觉',
    accent: '#9a463d',
    portrait: './assets/generated/chen-yu-expressions.png'
  },
  'lin-xia': {
    id: 'lin-xia',
    name: '林夏',
    gender: '女',
    role: '访谈、文字与人物故事',
    accent: '#b44b42',
    portrait: './assets/generated/lin-xia-expressions.png'
  },
  echo: {
    id: 'echo',
    name: '回响',
    gender: null,
    role: '艺术化表达',
    accent: '#c49a55',
    portrait: null
  }
};

export const expressions = ['calm', 'thinking', 'surprised', 'arguing', 'relieved'];
```

- [ ] **Step 5: Add the exact prototype scripts**

`prologue.mjs` contains one script with these nodes in order:

1. 林夏，思考：“录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？”
2. 陈屿，平静：“先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。”
3. 顾言，思考：“画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。”
4. 选择 `prologue-focus`：
   - `hear-gu-yan`：“先听顾言把资料说完。”，`truth +1`，`cooperation +1`
   - `hear-chen-yu`：“让陈屿说明拍摄计划。”，`expression +1`，`cooperation +1`
   - `hear-lin-xia`：“问林夏最想采访谁。”，`empathy +1`，`cooperation +1`
5. 林夏，释然：“那就把三种问题都带上。到了现场，我们再看看答案会不会改变。”
6. `end` 节点 outcome 为 `open-reeds-scene`

`reeds.mjs` exports four scripts:

- `reeds-camera`: 陈屿观察晨雾和木栈道，顾言提醒不要让空镜替代背景说明。
- `reeds-notes`: 顾言核对地点和称谓，林夏提醒资料里的完整句子未必等于讲述者的真实节奏。
- `reeds-voice`: 林夏注意到讲述者停顿，陈屿主动放下相机先听完。
- `reeds-convergence`: 三个热点完成后启动，包含第二次选择、历史回响和章节结算。

`reeds-convergence` 必须使用以下第二次选择：

```js
{
  id: 'reeds-recording-priority',
  type: 'choice',
  prompt: '这段讲述应该怎样留下？',
  options: [
    {
      id: 'verify-context',
      label: '请顾言先核对时间和称谓。',
      effects: { truth: 1 },
      next: 'reeds-echo'
    },
    {
      id: 'keep-pause',
      label: '保留讲述中的停顿，不替对方补全。',
      effects: { empathy: 1, cooperation: 1 },
      next: 'reeds-echo'
    },
    {
      id: 'keep-wide-shot',
      label: '用一个长镜头保留现场的水声和距离。',
      effects: { expression: 1 },
      next: 'reeds-echo'
    }
  ]
}
```

历史回响节点使用：

```js
{
  id: 'reeds-echo',
  type: 'effect',
  effect: 'historical-echo',
  durationMs: 4500,
  speaker: 'echo',
  text: '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。',
  next: 'reeds-return'
}
```

回到现实后的结算对白固定为：

- 顾言：“我会把来源和背景补清楚，但不替那段停顿下结论。”
- 陈屿：“我保留水声。画面不抢着解释，让观众先听见现场。”
- 林夏：“这次我们记录的不是一个标准答案，是三种看见彼此校准的过程。”
- `end` 节点 outcome 为 `prototype-complete`

- [ ] **Step 6: Write and run data integrity tests**

```js
// tests/unit/story-data.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { characters } from '../../game/data/characters.mjs';
import { scripts } from '../../game/data/scripts.mjs';

test('prototype has exactly two male leads, one female lead and two choices', () => {
  const leads = ['gu-yan', 'chen-yu', 'lin-xia'].map((id) => characters[id]);
  assert.deepEqual(leads.map((item) => item.gender), ['男', '男', '女']);

  const nodes = Object.values(scripts).flatMap((script) => Object.values(script.nodes));
  assert.equal(nodes.filter((node) => node.type === 'choice').length, 2);
  assert.equal(nodes.filter((node) => node.effect === 'historical-echo').length, 1);
  assert.equal(nodes.some((node) => /证据匹配|档案修复/.test(node.text || node.prompt || '')), false);
});

test('every branch target resolves inside its script', () => {
  for (const script of Object.values(scripts)) {
    assert.ok(script.nodes[script.entry], `${script.id} entry exists`);
    for (const node of Object.values(script.nodes)) {
      const targets = node.type === 'choice'
        ? node.options.map((option) => option.next)
        : node.next ? [node.next] : [];
      for (const target of targets) assert.ok(script.nodes[target], `${script.id}:${target} exists`);
    }
  }
});
```

Run:

```powershell
npm run test:unit
```

Expected: PASS with story engine and data integrity tests.

- [ ] **Step 7: Commit the narrative core**

```powershell
git add game/core/story-engine.mjs game/data tests/unit/story-engine.unit.test.mjs tests/unit/story-data.unit.test.mjs
git commit -m "feat: add prototype narrative engine and scripts"
```

---

### Task 4: Add versioned local save and settings

**Files:**
- Create: `game/core/save-store.mjs`
- Create: `tests/unit/save-store.unit.test.mjs`

**Interfaces:**
- Produces: `createSaveStore({ storage, key })`
- Produces: `loadProgress()`, `saveProgress(storyState, sessionState)`, `clearProgress()`
- Produces: `loadSettings()`, `saveSettings(settings)`
- Consumes: story state version `1`

- [ ] **Step 1: Write failing save-store tests**

```js
// tests/unit/save-store.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveStore } from '../../game/core/save-store.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('round-trips progress and applies settings defaults', () => {
  const store = createSaveStore({ storage: memoryStorage(), key: 'test' });
  assert.deepEqual(store.loadSettings(), {
    autoPlay: false,
    quality: 'auto',
    music: 0.55,
    ambience: 0.7,
    uiSound: 0.65,
    reducedMotion: false
  });

  store.saveProgress({ version: 1, stats: { truth: 1 } }, { sceneId: 'reeds', visitedHotspots: [] });
  assert.equal(store.loadProgress().sessionState.sceneId, 'reeds');
});

test('returns null and removes malformed progress', () => {
  const storage = memoryStorage();
  storage.setItem('test:progress', '{broken');
  const store = createSaveStore({ storage, key: 'test' });
  assert.equal(store.loadProgress(), null);
  assert.equal(storage.getItem('test:progress'), null);
});
```

- [ ] **Step 2: Run the focused test and verify the failure**

Run:

```powershell
node --test tests/unit/save-store.unit.test.mjs
```

Expected: FAIL because `save-store.mjs` does not exist.

- [ ] **Step 3: Implement schema-aware persistence**

Use keys:

- `yanhuo-summer-echo:v1:progress`
- `yanhuo-summer-echo:v1:settings`

`loadProgress()` accepts only objects containing `storyState.version === 1`, a string `sessionState.sceneId`, and an array `sessionState.visitedHotspots`. Malformed or incompatible progress is removed and returns `null`.

`saveSettings()` clamps all volume values to `0..1`, accepts only `auto`, `high`, or `low` quality, and converts boolean flags with `Boolean(value)`.

The module must never reference `window`; `localStorage` is injected from `main.mjs`.

- [ ] **Step 4: Run all unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS with malformed data fallback covered.

- [ ] **Step 5: Commit persistence**

```powershell
git add game/core/save-store.mjs tests/unit/save-store.unit.test.mjs
git commit -m "feat: add versioned local game saves"
```

---

### Task 5: Build the visual-novel shell and consistent character art

**Files:**
- Create: `game/index.html`
- Create: `game/styles.css`
- Create: `game/main.mjs`
- Create: `game/ui/game-shell.mjs`
- Create: `game/ui/dialogue-view.mjs`
- Create: `game/ui/touch-controls.mjs`
- Create: `game/assets/generated/gu-yan-expressions.png`
- Create: `game/assets/generated/chen-yu-expressions.png`
- Create: `game/assets/generated/lin-xia-expressions.png`
- Create: `tests/unit/game-shell-contract.unit.test.cjs`

**Interfaces:**
- Produces: `createGameShell(root, handlers): GameShell`
- Produces: `createDialogueView(root, handlers): DialogueView`
- Produces: `createTouchControls(root): TouchControls`
- Consumes: character ids, portrait URLs and expression names from `characters.mjs`

- [ ] **Step 1: Write the failing game-shell contract**

```js
// tests/unit/game-shell-contract.unit.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('game shell contains every required view and local portrait asset', () => {
  const html = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'game/styles.css'), 'utf8');

  for (const id of ['game-canvas', 'game-status', 'loading-view', 'main-menu', 'chapter-menu', 'dialogue-layer', 'settings-panel', 'touch-controls', 'webgl-fallback']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /type="module"/);
  assert.doesNotMatch(`${html}\n${css}`, /https?:\/\//);

  for (const asset of ['gu-yan-expressions.png', 'chen-yu-expressions.png', 'lin-xia-expressions.png']) {
    const file = path.join(root, 'game/assets/generated', asset);
    assert.equal(fs.existsSync(file), true);
    assert.ok(fs.statSync(file).size > 80_000);
  }
});
```

- [ ] **Step 2: Run the shell contract and verify the failure**

Run:

```powershell
node --test tests/unit/game-shell-contract.unit.test.cjs
```

Expected: FAIL because `game/index.html` and portrait assets do not exist.

- [ ] **Step 3: Generate the character expression sheets**

First generate a shared reference lineup with exactly two men and one woman, using the character descriptions in the design spec. Then use that accepted lineup as the reference image for three separate expression-sheet edits.

Use this common structure for every sheet:

```text
Transparent-background anime visual-novel character sprite sheet, one Chinese university student shown as five equal-width waist-up portraits in one horizontal row. The five expressions from left to right are calm, thinking, surprised, arguing, and relieved. Identical face, hairstyle, body proportions, clothing and camera angle in all five panels. Clean mature illustration, restrained documentary tone, natural anatomy, crisp edges, no text, no labels, no border, no extra person, no cropped head or hands.
```

Append these exact identity descriptions:

- 顾言：young man, straight dark short hair, light gray-blue field jacket, white shirt, slim notebook held near his chest, reserved expression.
- 陈屿：young man, slightly wavy short hair, dark green field jacket with restrained deep-red detail, camera strap, energetic posture.
- 林夏：young woman, neat shoulder-length dark hair, warm white field shirt with restrained red detail, small interview recorder and folder, attentive posture.

Inspect all three sheets together. Reject any set where gender, face, costume, panel count or panel order is inconsistent. Save the accepted PNG files at the exact paths above. Record the pixel crop positions for each expression as CSS custom properties if the generated panels are not perfectly equal.

- [ ] **Step 4: Create the semantic game shell**

`game/index.html` must:

- load only `styles.css` and `main.mjs` from relative paths;
- include a full-bleed `<canvas id="game-canvas">`;
- provide an ARIA live loading status;
- keep menu buttons as native `<button>` elements;
- provide an icon-only pause button with `aria-label="暂停"`;
- provide a return link `../` rather than an absolute URL;
- keep dialogue, menu and settings layers as siblings, not nested cards.
- include `<output id="game-status" class="sr-only" aria-live="polite"></output>` for concise scene, player and hotspot status.

The menu labels are:

- 继续旅程
- 新的旅程
- 教师浏览
- 设置
- 返回成果页

The settings panel contains:

- 画质：自动、高、低
- 音乐、环境音、提示音三个 range input
- 自动播放 toggle
- 减少动态效果 toggle

- [ ] **Step 5: Implement focused UI modules**

`createGameShell` exposes:

```js
{
  showLoading({ message, progress }),
  showMainMenu({ hasSave }),
  showChapterMenu({ chapters }),
  showHud({ chapterTitle }),
  showChapterComplete({ summary, stats }),
  showSettings(settings),
  showFallback(message),
  hideOverlay()
}
```

`createDialogueView` exposes:

```js
{
  renderNode(node, character),
  show(),
  hide(),
  setAutoPlay(enabled),
  appendHistory(entry),
  showHistory(),
  hideHistory()
}
```

It maps expressions to the five portrait-sheet positions:

```js
export const expressionIndex = {
  calm: 0,
  thinking: 1,
  surprised: 2,
  arguing: 3,
  relieved: 4
};
```

The portrait element uses `background-size: 500% 100%` and `background-position-x` based on the expression index. Dialogue text supports immediate full reveal when clicked once and advancing when clicked again.

`createTouchControls` emits normalized movement values through `onMove({ x, y })`, view deltas through `onLook({ x, y })`, and interaction through `onInteract()`. It must use pointer capture so a dragged finger cannot leave the joystick stuck.

At this task boundary, `game/main.mjs` only initializes the shell:

```js
import { createGameShell } from './ui/game-shell.mjs';

const root = document.querySelector('#game-root');
const shell = createGameShell(root, {
  onNewGame() {},
  onTeacherBrowse() {},
  onSettings() {}
});

shell.showMainMenu({ hasSave: false });
root.dataset.shellReady = 'true';
```

Task 6 extends this same file with the 3D world; Task 7 connects the final narrative and save behavior.

- [ ] **Step 6: Add stable responsive styling**

Required fixed layout rules:

- canvas fills `100dvw x 100dvh`;
- dialogue layer stays at the bottom with desktop maximum width 1180px;
- portraits reserve a stable `min(32vw, 420px)` desktop width;
- choice buttons use a vertical list and never overlay the current line;
- mobile landscape dialogue text is at least 16px;
- touch controls appear only for `(pointer: coarse)`;
- dialogue state hides the touch controls;
- reduced-motion mode disables typewriter animation and transition transforms;
- button and card corner radii remain at or below 8px.

Use a neutral charcoal, off-white, reed green, crimson and muted gold palette. Do not use a single-hue dark blue or purple interface.

- [ ] **Step 7: Run unit tests and inspect shell layout**

Run:

```powershell
npm run test:unit
npm run preview
```

Inspect `http://127.0.0.1:4173/game/` at 1440 x 900 and 844 x 390. At this task boundary the 3D canvas may show the intentional loading color, but every menu, dialogue and control layer must fit without overlap.

- [ ] **Step 8: Commit the shell and art**

```powershell
git add game/index.html game/styles.css game/ui game/assets/generated tests/unit/game-shell-contract.unit.test.cjs
git commit -m "feat: add visual novel game shell and portraits"
```

---

### Task 6: Build the local Three.js world, two scenes and player controls

**Files:**
- Create: `tools/vendor-three.cjs`
- Create: `game/vendor/three.module.min.js`
- Create: `game/vendor/THREE-LICENSE.txt`
- Create: `game/core/proximity.mjs`
- Create: `game/core/navigation.mjs`
- Create: `game/scenes/activity-room.mjs`
- Create: `game/scenes/reeds-wetland.mjs`
- Create: `game/render/scene-builder.mjs`
- Create: `game/render/world.mjs`
- Create: `game/render/quality.mjs`
- Modify: `game/main.mjs`
- Create: `tests/unit/proximity.unit.test.mjs`
- Create: `tests/unit/navigation.unit.test.mjs`
- Create: `tests/unit/scene-definitions.unit.test.mjs`
- Create: `playwright.config.mjs`
- Create: `tests/e2e/game-canvas.spec.mjs`

**Interfaces:**
- Produces: `getNearestHotspot(position, hotspots, radius)`
- Produces: `resolveWalkablePosition(previous, proposed, walkableAreas)`
- Produces: `activityRoomDefinition` and `reedsWetlandDefinition`
- Produces: `createWorld({ canvas, quality, onHotspotChange, onStatusChange }): World`
- Produces: `detectWebGL(canvas): boolean` and `chooseQuality({ devicePixelRatio, coarsePointer, requested }): Quality`
- Consumes: local `game/vendor/three.module.min.js`

- [ ] **Step 1: Write failing proximity and scene definition tests**

```js
// tests/unit/proximity.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getNearestHotspot } from '../../game/core/proximity.mjs';

test('returns the nearest in-range hotspot without mutating input', () => {
  const hotspots = [
    { id: 'far', position: [0, 0, 5], radius: 1 },
    { id: 'near', position: [1, 0, 0], radius: 2 }
  ];
  const copy = structuredClone(hotspots);
  assert.equal(getNearestHotspot([0, 0, 0], hotspots)?.id, 'near');
  assert.deepEqual(hotspots, copy);
  assert.equal(getNearestHotspot([9, 0, 9], hotspots), null);
});
```

```js
// tests/unit/navigation.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWalkablePosition } from '../../game/core/navigation.mjs';

test('keeps movement on connected walkable rectangles', () => {
  const areas = [
    { minX: -1.5, maxX: 1.5, minZ: -10, maxZ: 6 },
    { minX: -3, maxX: 3, minZ: -1, maxZ: 1 }
  ];
  assert.deepEqual(resolveWalkablePosition([0, 0, 0], [1, 0, -2], areas), [1, 0, -2]);
  assert.deepEqual(resolveWalkablePosition([1, 0, -2], [2.5, 0, -2], areas), [1, 0, -2]);
  assert.deepEqual(resolveWalkablePosition([0, 0, 0], [2.5, 0, 0], areas), [2.5, 0, 0]);
});
```

```js
// tests/unit/scene-definitions.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { activityRoomDefinition } from '../../game/scenes/activity-room.mjs';
import { reedsWetlandDefinition } from '../../game/scenes/reeds-wetland.mjs';

test('scene definitions have stable bounds, starts and unique hotspots', () => {
  for (const scene of [activityRoomDefinition, reedsWetlandDefinition]) {
    assert.equal(scene.playerStart.length, 3);
    assert.equal(scene.bounds.min.length, 3);
    assert.equal(scene.bounds.max.length, 3);
    assert.ok(scene.walkableAreas.length > 0);
    const ids = scene.hotspots.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.deepEqual(
    reedsWetlandDefinition.hotspots.map((item) => item.scriptId).sort(),
    ['reeds-camera', 'reeds-notes', 'reeds-voice']
  );
});
```

- [ ] **Step 2: Run focused tests and verify the failure**

Run:

```powershell
node --test tests/unit/proximity.unit.test.mjs tests/unit/navigation.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs
```

Expected: FAIL because proximity and scene definition modules do not exist.

- [ ] **Step 3: Vendor the fixed Three.js browser module**

`tools/vendor-three.cjs` must copy:

- `node_modules/three/build/three.module.min.js` to `game/vendor/three.module.min.js`
- `node_modules/three/LICENSE` to `game/vendor/THREE-LICENSE.txt`

The script must read the installed package version and throw unless it equals `0.185.1`.

Run:

```powershell
npm run vendor:three
```

Expected: both vendor files exist, and `three.module.min.js` contains no remote URL requirement.

- [ ] **Step 4: Implement proximity and pure scene definitions**

`getNearestHotspot` computes Euclidean XZ distance and uses each hotspot radius when supplied, otherwise the function radius argument.

`resolveWalkablePosition` returns the proposed `[x, y, z]` only when its XZ point falls inside at least one declared walkable rectangle. Otherwise it returns a clone of the previous position. This keeps the implementation deterministic and prevents the player from walking through furniture or into water without adding a physics engine.

`activityRoomDefinition` uses:

- scene id `activity-room`
- bounds `[-6, 0, -5]` to `[6, 0, 5]`
- player start `[0, 0, 3.4]`
- walkable areas forming one central aisle and the clear space around the route board
- warm window light, three desks, a route board, equipment cases and three simple teammate figures
- one progression hotspot at the route board with script id `prologue`

`reedsWetlandDefinition` uses:

- scene id `reeds-wetland`
- bounds `[-5, 0, -14]` to `[5, 0, 8]`
- player start `[0, 0, 6]`
- walkable areas forming a 3-unit-wide boardwalk plus two wider observation platforms
- wooden boardwalk along Z, water plane, instanced reeds, distant low shore and three teammate figures
- hotspots:
  - `camera-spot` at `[-2.2, 0, 0]`, script `reeds-camera`
  - `notes-spot` at `[2.1, 0, -4]`, script `reeds-notes`
  - `voice-spot` at `[0.5, 0, -9]`, script `reeds-voice`

All decorative geometry is described as primitive records:

```js
{
  kind: 'box' | 'cylinder' | 'plane' | 'reed-field' | 'person',
  position: [x, y, z],
  scale: [x, y, z],
  color: '#rrggbb',
  rotation: [x, y, z]
}
```

- [ ] **Step 5: Implement quality selection and WebGL fallback**

`chooseQuality` returns:

```js
{
  pixelRatio: 1 | 1.5 | 2,
  shadows: boolean,
  antialias: boolean,
  reedCount: 320 | 700,
  postEffects: boolean
}
```

Rules:

- requested `low` always returns pixel ratio 1, no shadows, no post effects, 320 reeds;
- requested `high` caps pixel ratio at 2 and uses 700 reeds;
- `auto` chooses low for coarse pointer or device pixel ratio above 2, otherwise high;
- `detectWebGL` attempts a WebGL2 context and then WebGL, returning false rather than throwing.

- [ ] **Step 6: Implement the scene builder and world**

`createWorld` must:

- create one renderer, one perspective camera, one scene root and one stylized player mesh;
- support `loadScene(definition)` by disposing the previous scene group;
- expose `setMovement({ x, y })`, `addLookDelta({ x, y })`, `interact()`, `start()`, `stop()`, `resize()`, `setEchoActive(active)` and `dispose()`;
- make `interact()` return a cloned active hotspot or `null`; it must not invoke narrative code itself;
- clamp player position to scene bounds;
- pass every proposed movement through `resolveWalkablePosition` before updating the player mesh;
- move at 3.2 world units per second and normalize diagonal input;
- follow the player from an offset determined by yaw and a fixed 18 degree pitch;
- call `onHotspotChange(hotspotOrNull)` only when the nearest hotspot id changes;
- call `onStatusChange({ sceneId, player, hotspotId })` at most ten times per second for the accessible status output;
- render an active hotspot marker without changing layout dimensions;
- lower color saturation and shift fog toward deep red while `setEchoActive(true)`.

Use `THREE.Clock` delta capped at `0.05` seconds. The frame loop must stop when the page is hidden and resume when visible.

Extend `game/main.mjs` to create the world, load `activityRoomDefinition`, update `#game-status`, set `data-scene-ready="activity-room"` on `#game-root`, and bind keyboard movement. Map `W` and ArrowUp to `{ x: 0, y: 1 }`, `S` and ArrowDown to `{ x: 0, y: -1 }`, `A` and ArrowLeft to `{ x: -1, y: 0 }`, and `D` and ArrowRight to `{ x: 1, y: 0 }`. Combine held keys before calling `world.setMovement`.

- [ ] **Step 7: Add browser canvas smoke test**

`playwright.config.mjs`:

```js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tools/serve.cjs',
    port: 4173,
    reuseExistingServer: true
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }
  ]
});
```

`game-canvas.spec.mjs` opens `/game/?mode=new`, waits for `[data-scene-ready="activity-room"]`, and samples a 64 x 36 copy of the WebGL canvas using `drawImage`. Assert:

- at least 25% of pixels have alpha above zero;
- the maximum and minimum luminance differ by at least 24;
- no `pageerror` or failed same-origin resource request occurred;
- pressing `W` for 500 ms changes the player position reported in `#game-status`.

- [ ] **Step 8: Run all unit and canvas tests**

Run:

```powershell
npm run test:unit
npx playwright install chromium
npx playwright test tests/e2e/game-canvas.spec.mjs
```

Expected: both desktop and mobile-landscape canvas tests pass.

- [ ] **Step 9: Commit the 3D runtime**

```powershell
git add tools/vendor-three.cjs game/vendor game/core/proximity.mjs game/core/navigation.mjs game/scenes game/render tests/unit/proximity.unit.test.mjs tests/unit/navigation.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs playwright.config.mjs tests/e2e/game-canvas.spec.mjs
git commit -m "feat: add interactive Three.js practice scenes"
```

---

### Task 7: Connect exploration, dialogue, choices, echo and saves

**Files:**
- Create: `game/core/session-controller.mjs`
- Create: `game/audio/audio-manager.mjs`
- Modify: `game/main.mjs`
- Create: `tests/unit/session-controller.unit.test.mjs`
- Create: `tests/unit/audio-manager.unit.test.mjs`
- Create: `tests/e2e/prototype-flow.spec.mjs`
- Modify: `game/styles.css`
- Modify: `game/ui/game-shell.mjs`
- Modify: `game/ui/dialogue-view.mjs`

**Interfaces:**
- Produces: `createSessionController({ storyEngine, saveStore, world, ui }): SessionController`
- Produces: `createAudioManager({ AudioContextCtor }): AudioManager`
- Produces: `normaliseAudioSettings(settings)`
- Produces: `startNew()`, `continueSaved()`, `openTeacherChapter(sceneId)`, `setScene(sceneId)`, `activateHotspot(hotspot)`, `completeHotspot(hotspotId)`, `advanceDialogue()`, `choose(optionId)`
- Consumes: story engine, save store, world and UI interfaces defined in Tasks 3 through 6

- [ ] **Step 1: Write failing session tests**

```js
// tests/unit/session-controller.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionController } from '../../game/core/session-controller.mjs';

test('unlocks convergence only after three unique reed hotspots', () => {
  const started = [];
  const controller = createSessionController({
    storyEngine: { start: (id) => started.push(id), getState: () => ({ version: 1 }) },
    saveStore: { saveProgress: () => {} },
    world: { loadScene: () => {}, setEchoActive: () => {} },
    ui: { renderNode: () => {}, showChapterComplete: () => {} }
  });

  controller.setScene('reeds-wetland');
  controller.completeHotspot('camera-spot');
  controller.completeHotspot('notes-spot');
  assert.equal(started.includes('reeds-convergence'), false);
  controller.completeHotspot('voice-spot');
  assert.equal(started.at(-1), 'reeds-convergence');
  controller.completeHotspot('voice-spot');
  assert.equal(started.filter((id) => id === 'reeds-convergence').length, 1);
});
```

```js
// tests/unit/audio-manager.unit.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioManager, normaliseAudioSettings } from '../../game/audio/audio-manager.mjs';

test('clamps channel gains and degrades to a no-op manager', () => {
  assert.deepEqual(normaliseAudioSettings({
    music: 2,
    ambience: -1,
    uiSound: 0.4
  }), {
    music: 1,
    ambience: 0,
    uiSound: 0.4
  });

  const audio = createAudioManager({ AudioContextCtor: null });
  assert.equal(audio.getState().available, false);
  assert.doesNotThrow(() => audio.applySettings({ music: 1, ambience: 1, uiSound: 1 }));
  assert.doesNotThrow(() => audio.setScene('reeds-wetland'));
});
```

- [ ] **Step 2: Run the session and audio tests and verify the failure**

Run:

```powershell
node --test tests/unit/session-controller.unit.test.mjs tests/unit/audio-manager.unit.test.mjs
```

Expected: FAIL because `session-controller.mjs` and `audio-manager.mjs` do not exist.

- [ ] **Step 3: Implement the session progression rules**

Use this session state:

```js
{
  version: 1,
  sceneId: 'activity-room',
  visitedHotspots: [],
  completedScenes: [],
  activeHotspotId: null,
  prototypeComplete: false
}
```

Rules:

- a new journey starts `prologue` in `activity-room`;
- `open-reeds-scene` loads `reeds-wetland`;
- a reed hotspot starts its mapped script only the first time it is activated;
- completing all three reed hotspot scripts starts `reeds-convergence` once;
- historical echo disables movement, enables world echo treatment, waits `durationMs`, then advances;
- `prototype-complete` sets the completion flag, saves, and opens chapter summary;
- every completed line, choice, hotspot and scene transition saves progress;
- teacher mode may enter either scene directly but does not alter the normal saved journey until the player makes a choice.

- [ ] **Step 4: Implement local procedural sound**

`createAudioManager` must lazily create its AudioContext after the first button, keyboard or pointer interaction. It exposes:

```js
{
  unlock(),
  applySettings(settings),
  setScene(sceneId),
  playUiCue(type),
  suspend(),
  resume(),
  dispose(),
  getState()
}
```

Use three gain channels connected to the master output:

- music: a quiet three-note pentatonic motif scheduled with oscillators every eight seconds;
- ambience: a deterministic looping noise buffer through low-pass and band-pass filters, softer indoors and broader in the reed scene;
- UI sound: a 70 ms sine cue for advance and a 110 ms two-tone cue for choice.

Use a fixed seeded noise generator so repeated tests and sessions produce the same buffer. No audio starts before a user gesture. If Web Audio creation or resume fails, mark the manager unavailable and continue the story without an error overlay.

- [ ] **Step 5: Wire the browser application in `main.mjs`**

Initialization order:

1. Read `mode` from `new URLSearchParams(location.search)`.
2. Create game shell and dialogue UI.
3. Detect WebGL; show `webgl-fallback` with return link if unavailable.
4. Load settings and choose quality.
5. Create world, story engine, save store, audio manager and session controller.
6. Bind keyboard, pointer, touch, pause, settings, dialogue history, auto-play, skip-read and visibility events.
7. Unlock audio only after the first user gesture and apply saved channel gains.
8. Start new game, show teacher menu or show main menu according to mode and save availability.

Expose only this read-only status for accessibility and browser tests:

```html
<output id="game-status" class="sr-only" aria-live="polite">
  scene=activity-room; player=0.00,0.00,3.40; hotspot=none
</output>
```

Do not expose mutable debug functions on `window`.

- [ ] **Step 6: Implement historical echo, dialogue controls and chapter summary**

While echo is active:

- add `data-echo-active="true"` to the game root;
- show the echo speaker as “回响 · 艺术化表达”;
- hide normal interaction prompts;
- shift 3D fog and scene color through `world.setEchoActive(true)`;
- respect reduced-motion by removing flicker and transition transforms;
- restore the exact previous quality and movement state after 4500 ms.

Dialogue controls must:

- append every displayed line to history once;
- let the first click reveal the full current line and the second click advance;
- advance automatically only after the full line has remained visible for `max(1600, text.length * 70)` milliseconds;
- pause auto-play while the page is hidden, history is open, settings is open or a choice is visible;
- skip only nodes already present in `readNodes`;
- save auto-play and reduced-motion changes immediately.

Chapter summary text is selected from the highest stat:

- truth: `你们先把事实的地基站稳。`
- empathy: `你们选择先听见讲述的人。`
- expression: `你们让现场的声音和画面先抵达观众。`
- tied highest values: `你们开始学会让三种方法彼此校准。`

Always show the three stat labels without numeric scores and a button `返回成果页`.

- [ ] **Step 7: Add the complete browser flow test**

`prototype-flow.spec.mjs` must cover:

1. open `/`, activate `开始旅程`, and confirm relative navigation reaches `/game/?mode=new`;
2. finish the prologue dialogue and select `先听顾言把资料说完。`;
3. verify the scene changes to `reeds-wetland`;
4. use keyboard movement to activate all three hotspots;
5. select `保留讲述中的停顿，不替对方补全。`;
6. verify `data-echo-active="true"` appears and later clears;
7. verify the prototype summary appears;
8. reload and verify Continue restores the completed state;
9. open `?mode=teacher` and verify both available scenes can be entered directly.
10. change all three audio sliders, reload, and verify the values persist without any remote audio request.

For movement, read player and hotspot coordinates from `#game-status`, hold the required direction keys, and stop when the expected hotspot id appears. The test must fail after eight seconds rather than loop indefinitely.

- [ ] **Step 8: Run complete logic and browser tests**

Run:

```powershell
npm run test:unit
npx playwright test tests/e2e/prototype-flow.spec.mjs
```

Expected: all unit tests pass and both Playwright projects complete the prototype flow.

- [ ] **Step 9: Commit the integrated vertical slice**

```powershell
git add game/main.mjs game/core/session-controller.mjs game/audio/audio-manager.mjs game/styles.css game/ui tests/unit/session-controller.unit.test.mjs tests/unit/audio-manager.unit.test.mjs tests/e2e/prototype-flow.spec.mjs
git commit -m "feat: connect exploration to branching story flow"
```

---

### Task 8: Finish resilience, accessibility, visual QA and release documentation

**Files:**
- Create: `tests/unit/release-contract.unit.test.cjs`
- Create: `tests/e2e/visual-regression.spec.mjs`
- Modify: `game/render/quality.mjs`
- Modify: `game/main.mjs`
- Modify: `game/styles.css`
- Modify: `README.md`

**Interfaces:**
- Produces: final `npm test` release gate
- Produces: screenshots for 1440 x 900, 390 x 844 homepage, and 844 x 390 game
- Consumes: all prior modules and assets

- [ ] **Step 1: Write the failing release contract**

```js
// tests/unit/release-contract.unit.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules' || file === path.join(root, 'game/vendor')) return [];
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('release is local-only, UTF-8 clean and within asset budgets', () => {
  const runtimeFiles = walk(root).filter((file) => /\.(html|css|mjs|js)$/.test(file));
  const runtimeText = runtimeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(runtimeText, /\uFFFD/);
  assert.doesNotMatch(runtimeText, /https?:\/\//);
  assert.doesNotMatch(runtimeText, /证据匹配|档案修复|修复档案/);
  assert.match(readme, /当前版本包含序章和“芦苇深处的声音”第一章/);

  const homepageBytes = fs.statSync(path.join(root, 'index.html')).size
    + fs.statSync(path.join(root, 'styles.css')).size
    + fs.statSync(path.join(root, 'assets/generated/hero-summer-echo.jpg')).size;
  assert.ok(homepageBytes < 12 * 1024 * 1024);

  const gameAssetBytes = walk(path.join(root, 'game')).reduce((sum, file) => sum + fs.statSync(file).size, 0);
  assert.ok(gameAssetBytes < 25 * 1024 * 1024);
});
```

- [ ] **Step 2: Run the release contract and verify any unmet requirement**

Run:

```powershell
node --test tests/unit/release-contract.unit.test.cjs
```

Expected: FAIL because the current README still describes the old archive showcase; any asset-budget or runtime-copy failure must also be reported.

- [ ] **Step 3: Complete deterministic degradation behavior**

Add these exact behaviors:

- if WebGL detection fails, do not import or initialize the world; show `当前设备无法启动 3D 场景` and a `返回成果页` link;
- if a portrait image fails, set `data-portrait-fallback` and show a color silhouette with the character name;
- if audio is unavailable, continue without blocking any node;
- if the tab loses visibility, stop rendering and suspend auto-play;
- if average FPS stays below 26 for five seconds in automatic quality, switch once to low quality and announce `已切换为流畅画质`;
- never switch quality automatically when the player explicitly selected high or low.

- [ ] **Step 4: Add visual and overlap checks**

`visual-regression.spec.mjs` must:

- capture homepage at 1440 x 900 and 390 x 844;
- capture activity room, reeds scene, normal dialogue, choice dialogue and historical echo at 1440 x 900 and 844 x 390;
- sample each WebGL canvas and require luminance spread above 24;
- compare bounding boxes and fail if dialogue text intersects choices, portraits intersect the speaker name, or touch controls intersect the dialogue panel;
- assert every button has nonzero width and height;
- assert the longest option wraps inside its button;
- assert `document.documentElement.scrollWidth <= window.innerWidth` on game pages.

Save snapshots under Playwright's test output only. Do not commit screenshot binaries unless the user explicitly requests baseline images in the repository.

- [ ] **Step 5: Update the README**

The README must contain:

```markdown
# 雁火渡江：夏日回响

社会实践主题的 3D 情景互动游戏。当前版本包含序章和“芦苇深处的声音”第一章。

## 本地预览

1. 安装 Node.js 依赖：`npm install`
2. 启动预览：`npm run preview`
3. 打开 `http://127.0.0.1:4173/`

## 测试

- 全部测试：`npm test`
- 仅逻辑与静态检查：`npm run test:unit`
- 仅浏览器流程：`npm run test:e2e`

## 发布

仓库根目录保持为可直接发布的 GitHub Pages 静态文件。运行时资源全部使用相对路径，不依赖 CDN。

## 内容说明

历史回响是依据核实资料创作的艺术化表达，不代表真实人物原话。Three.js 以 MIT 许可证随项目分发，许可证位于 `game/vendor/THREE-LICENSE.txt`。
```

- [ ] **Step 6: Run the complete fresh verification**

Run:

```powershell
npm test
git diff --check
git status --short
```

Expected:

- all unit tests pass;
- desktop and mobile-landscape Playwright projects pass;
- no whitespace errors;
- only Task 8 files are uncommitted.

- [ ] **Step 7: Inspect final screenshots**

Open every Task 8 screenshot at original resolution. Check:

- the homepage first viewport identifies the game and shows exactly two men and one woman;
- the next section remains visible as a hint on desktop and mobile;
- 3D scenes are nonblank and correctly framed;
- the player, hotspot marker and scene geometry do not overlap incoherently;
- dialogue, choices, portraits and touch controls do not overlap;
- historical echo remains readable and clearly differs from reality;
- there is no old evidence or archive-repair language.

If any check fails, add a focused regression assertion, observe it fail, fix the smallest relevant module, and rerun `npm test`.

- [ ] **Step 8: Commit the release gate**

```powershell
git add README.md game tests/unit/release-contract.unit.test.cjs tests/e2e/visual-regression.spec.mjs
git commit -m "test: finish game resilience and release checks"
```

---

### Task 9: Publish and verify GitHub Pages

**Files:**
- No planned content changes

**Interfaces:**
- Produces: public homepage and `/game/` deployment
- Consumes: a clean `main` branch with all Task 1 through Task 8 commits

- [ ] **Step 1: Verify the exact release commit**

Run:

```powershell
npm test
git status --short --branch
git log -8 --oneline
```

Expected: all tests pass, the working tree is clean, and the branch contains the design, plan and implementation commits.

- [ ] **Step 2: Push the verified main branch**

Run:

```powershell
git push origin main
```

Expected: `main` advances on `xing666173/yanhuo-dujiang-archive-game`.

- [ ] **Step 3: Verify the live static deployment**

Open:

- `https://xing666173.github.io/yanhuo-dujiang-archive-game/`
- `https://xing666173.github.io/yanhuo-dujiang-archive-game/game/?mode=teacher`

Verify:

- both URLs return HTTP 200;
- title and local assets match the release commit;
- no request is made to localhost or an external runtime asset host;
- desktop and mobile canvas pixel checks remain nonblank;
- new game, teacher browsing, choices, echo and save restore work online.

- [ ] **Step 4: Record release evidence**

In the completion report, include:

- release commit hash;
- public homepage and game URLs;
- unit and Playwright pass counts;
- desktop and mobile screenshot paths;
- measured homepage and first-chapter asset sizes;
- any remaining limitation, especially the fact that微信小程序迁移尚未开始。
