import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceDirectory = path.resolve('test-results', 'task-7');

function readStatus(text) {
  const match = String(text).match(
    /scene=([^;]+);\s*player=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);\s*hotspot=([^;\s]+)/
  );
  if (!match) return null;
  return {
    sceneId: match[1],
    player: [Number(match[2]), Number(match[3]), Number(match[4])],
    hotspotId: match[5].split('@')[0]
  };
}

async function status(page) {
  return readStatus(await page.locator('#game-status').textContent());
}

async function advanceDisplayedLine(page, expectedText) {
  const line = page.locator('[data-dialogue-line]');
  await expect(line).toBeVisible();
  await line.click();
  const afterFirstClick = await line.textContent();
  if (afterFirstClick === expectedText) await line.click();
}

async function holdUntil(page, key, predicate, hotspotId, deadline) {
  await page.keyboard.down(key);
  try {
    while (Date.now() < deadline) {
      const current = await status(page);
      if (current?.hotspotId === hotspotId || predicate(current)) return current;
      await page.waitForTimeout(60);
    }
  } finally {
    await page.keyboard.up(key);
  }
  throw new Error(`Movement timed out before reaching ${hotspotId}`);
}

async function reachHotspot(page, hotspotId) {
  const deadline = Date.now() + 8000;
  const routes = {
    'camera-spot': [
      ['KeyW', (value) => value?.player[2] <= 0.35],
      ['KeyA', () => false]
    ],
    'notes-spot': [
      ['KeyD', (value) => value?.player[0] >= -0.1],
      ['KeyW', (value) => value?.player[2] <= -3.75],
      ['KeyD', () => false]
    ],
    'voice-spot': [
      ['KeyA', (value) => value?.player[0] <= 0.65],
      ['KeyW', () => false]
    ]
  };

  for (const [key, predicate] of routes[hotspotId]) {
    const current = await holdUntil(page, key, predicate, hotspotId, deadline);
    if (current?.hotspotId === hotspotId) return current;
  }
  throw new Error(`Route ended before reaching ${hotspotId}`);
}

async function canvasEvidence(page) {
  return page.locator('#game-canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const sample = document.createElement('canvas');
    sample.width = 64;
    sample.height = 36;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    let pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let sampling = 'drawImage';
    const copiedOpaque = [...pixels].filter((_, index) => index % 4 === 3 && pixels[index] > 0).length;
    if (copiedOpaque === 0) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const raw = new Uint8Array(sample.width * sample.height * 4);
        const x = Math.max(0, Math.floor((gl.drawingBufferWidth - sample.width) / 2));
        const y = Math.max(0, Math.floor((gl.drawingBufferHeight - sample.height) / 2));
        gl.readPixels(x, y, sample.width, sample.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        pixels = raw;
        sampling = 'readPixels';
      }
    }
    let opaque = 0;
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) opaque += 1;
      const luminance = Math.round(
        pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
      );
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
    }
    return {
      sampling,
      opaqueRatio: opaque / (sample.width * sample.height),
      luminanceRange: maximum - minimum
    };
  });
}

test('player completes the branching vertical slice and restores its completed save', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await fs.mkdir(evidenceDirectory, { recursive: true });

  await page.goto('/');
  await page.getByRole('link', { name: '开始旅程' }).click();
  await expect(page).toHaveURL(/\/game\/\?mode=new$/);

  await advanceDisplayedLine(page, '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？');
  await advanceDisplayedLine(page, '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。');
  await expect(page.locator('[data-dialogue-line]')).toHaveText('画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.screenshot({
    path: path.join(evidenceDirectory, `dialogue-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
  await advanceDisplayedLine(page, '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.getByRole('button', { name: '先听顾言把资料说完。' }).click();
  await advanceDisplayedLine(page, '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。');
  await expect.poll(async () => (await status(page))?.sceneId).toBe('reeds-wetland');

  const hotspotScripts = [
    {
      id: 'camera-spot',
      lines: [
        '晨雾刚散，木栈道把视线带进芦苇里。这个画面值得先留下。',
        '可以拍，但不要让空镜替代背景说明。水路和这里的人，也要说清楚。'
      ]
    },
    {
      id: 'notes-spot',
      lines: [
        '地点和称谓先核对一遍，写进记录里的每个词都得有来处。',
        '资料里的完整句子，未必等于讲述者的真实节奏。别把他的停顿剪掉。'
      ]
    },
    {
      id: 'voice-spot',
      lines: [
        '他停了一下。我们先别急着把这段话接过去。',
        '好，我先把相机放下，听他把想说的说完。'
      ]
    }
  ];

  for (const [index, hotspot] of hotspotScripts.entries()) {
    await reachHotspot(page, hotspot.id);
    if (index === 0) {
      const pixels = await canvasEvidence(page);
      expect(pixels.opaqueRatio).toBeGreaterThan(0.25);
      expect(pixels.luminanceRange).toBeGreaterThan(24);
      await fs.writeFile(
        path.join(evidenceDirectory, `reeds-pixels-${testInfo.project.name}.json`),
        JSON.stringify(pixels, null, 2)
      );
      await page.screenshot({
        path: path.join(evidenceDirectory, `reeds-exploration-${testInfo.project.name}.png`),
        animations: 'disabled'
      });
    }
    await page.keyboard.press('KeyE');
    for (const line of hotspot.lines) await advanceDisplayedLine(page, line);
  }

  await page.getByRole('button', { name: '保留讲述中的停顿，不替对方补全。' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-echo-active', 'true');
  await expect(page.locator('[data-speaker]')).toHaveText('回响 · 艺术化表达');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。'
  );
  await page.screenshot({
    path: path.join(evidenceDirectory, `echo-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-echo-active', 'true', { timeout: 6500 });

  await advanceDisplayedLine(page, '我会把来源和背景补清楚，但不替那段停顿下结论。');
  await advanceDisplayedLine(page, '我保留水声。画面不抢着解释，让观众先听见现场。');
  await advanceDisplayedLine(page, '这次我们记录的不是一个标准答案，是三种看见彼此校准的过程。');

  await expect(page.locator('#chapter-complete')).toBeVisible();
  await expect(page.locator('[data-complete-stats] li')).toHaveText(['事实核验', '倾听共情', '表达呈现']);
  await expect(page.getByRole('link', { name: '返回成果页' })).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDirectory, `summary-${testInfo.project.name}.png`),
    animations: 'disabled'
  });

  await page.goto('/game/');
  await page.reload();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeVisible();
  await page.getByRole('button', { name: '继续旅程' }).click();
  await expect(page.locator('#chapter-complete')).toBeVisible();

  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
});

test('teacher chapters are directly browsable without changing the normal save', async ({ page }) => {
  await page.goto('/game/?mode=teacher');
  const before = await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'));
  await page.getByRole('button', { name: /出发准备/ }).click();
  await expect.poll(async () => (await status(page))?.sceneId).toBe('activity-room');
  await expect(page.locator('#dialogue-layer')).toBeVisible();

  await page.goto('/game/?mode=teacher');
  await page.getByRole('button', { name: /白洋淀木栈道/ }).click();
  await expect.poll(async () => (await status(page))?.sceneId).toBe('reeds-wetland');
  await expect(page.locator('#hud')).toBeVisible();
  const after = await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'));
  expect(after).toBe(before);
});

test('audio settings persist without requesting remote audio', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/game/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('slider', { name: '音乐' }).fill('21');
  await page.getByRole('slider', { name: '环境音' }).fill('43');
  await page.getByRole('slider', { name: '提示音' }).fill('87');
  await page.getByRole('button', { name: '关闭设置' }).click();

  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('slider', { name: '音乐' })).toHaveValue('21');
  await expect(page.getByRole('slider', { name: '环境音' })).toHaveValue('43');
  await expect(page.getByRole('slider', { name: '提示音' })).toHaveValue('87');

  const audioRequests = requests.filter((url) => /\.(mp3|wav|ogg|m4a)(?:$|\?)/i.test(url));
  expect(audioRequests).toEqual([]);
  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
});
