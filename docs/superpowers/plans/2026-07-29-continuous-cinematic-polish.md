# Continuous Cinematic Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the visible team as two men and one woman, improve Baiyangdian composition and wayfinding, and make desktop/mobile interaction presentation-ready without expanding the story.

**Architecture:** Add a player-presentation adapter that shares the imported-character pipeline while retaining the procedural fallback. Keep scene definitions declarative, add one pure objective-copy module, and extend the existing shell and modal views instead of introducing a framework. Preserve local-only static assets and GitHub Pages deployment.

**Tech Stack:** Native ES modules, Three.js 0.185.1, Playwright 1.61.1, Node test runner, Sharp 0.34.4, static GitHub Pages.

## Global Constraints

- Do not restore teacher mode.
- The visible team is exactly two men and one woman: player Chen Yu, NPC Gu Yan, NPC Lin Xia.
- Do not add runtime model or image hotlinks; every asset must be local.
- Keep Three.js and the current native-module structure.
- Support 1440x900, 390x844, and 844x390.
- Keep control radius at 4px and panel radius at 6px.
- Do not add feature-explanation cards or marketing sections.
- Imported-player failure must degrade only the player and must not abort world creation.
- Reduced motion must freeze decorative motion.
- Do not run restart, shutdown, or system-configuration commands.

---

### Task 1: Imported Player Identity

**Files:**
- Create: `game/render/player-presentation.mjs`
- Create: `tests/unit/player-presentation.unit.test.mjs`
- Modify: `game/render/world.mjs`
- Modify: `game/scenes/activity-room.mjs`
- Modify: `game/scenes/reeds-wetland.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`

**Interfaces:**
- Consumes: `createCharacterPresentation({ instance, record, appearance, quality, reducedMotion })`, `createCharacterModel(record, { resources, quality })`, `modelLibrary.createCharacter(id)`.
- Produces: `createPlayerPresentation({ modelLibrary, resources, quality, reducedMotion }) -> { group, characterId, modelSource, update({ elapsed, delta, movementMagnitude }), setQuality(quality), setReducedMotion(value), dispose() }`.
- Produces diagnostics: `data-player-model-source`, `data-named-character-root-count`, `data-imported-character-count`, `data-character-model-ids`.

- [ ] **Step 1: Write failing player-presentation unit tests**

Create real Three.js groups with finite bounds and a fake imported instance. Assert imported preference, `Idle -> Walk -> Idle`, reduced-motion forwarding, quality forwarding, and one-time disposal:

```js
const player = createPlayerPresentation({
  modelLibrary: { createCharacter(id) { assert.equal(id, 'chen-yu'); return instance; } },
  resources,
  quality: { shadows: true, characterDetail: 1 },
  reducedMotion: false
});
assert.equal(player.characterId, 'chen-yu');
assert.equal(player.modelSource, 'imported');
player.update({ elapsed: 1, delta: 0.016, movementMagnitude: 1 });
player.update({ elapsed: 2, delta: 0.016, movementMagnitude: 0 });
assert.deepEqual(instance.playCalls, ['Idle', 'Walk', 'Idle']);
player.dispose();
player.dispose();
assert.equal(instance.disposeCount, 1);
```

Add a second test where `createCharacter()` returns `null` and assert `modelSource === 'procedural'`, movement animation remains callable, and player color data comes from `characterVisuals['chen-yu']`.

- [ ] **Step 2: Run the new unit test and confirm RED**

Run:

```powershell
node --test tests/unit/player-presentation.unit.test.mjs
```

Expected: FAIL because `game/render/player-presentation.mjs` does not exist.

- [ ] **Step 3: Implement the adapter**

Implement this exported shape:

```js
export const PLAYER_CHARACTER_ID = 'chen-yu';

export function createPlayerPresentation({
  modelLibrary = null,
  resources,
  quality,
  reducedMotion = false
}) {
  // Try imported Chen Yu with position [0,0,0], rotation [0,0,0],
  // scale [0.9,1.72,0.88], and appearance.prop forced to null.
  // Catch create/presentation errors, dispose any partial imported instance,
  // then create the existing procedural model using Chen Yu's palette.
}
```

For imported players map `movementMagnitude > 0.02` to `Walk`, otherwise `Idle`. For the procedural fallback call its existing `update({ elapsed, movementMagnitude })`.

- [ ] **Step 4: Integrate the player into the world**

Replace direct `createCharacterModel()` setup in `world.mjs` with `createPlayerPresentation()`. Pass frame `delta`, call `setReducedMotion()` and `setQuality()`, and dispose the player before disposing the model library.

Count character roots across `sceneRoot`, not only `builtScene.group`. Build diagnostics from the union of imported player ID and `builtScene.characterModelIds`:

```js
const characterModelIds = new Set(builtScene?.characterModelIds ?? []);
if (playerModel.modelSource === 'imported') characterModelIds.add(playerModel.characterId);
```

`namedCharacterCount` and `namedCharacterRootCount` must both be three in normal operation; imported count must include the player.

- [ ] **Step 5: Remove the duplicate Chen Yu NPC**

Delete only the `chen-yu` `kind: 'person'` record from both scene `teammates` arrays. Preserve the camera hotspot at its existing location and add `playerCharacterId: 'chen-yu'` to both definitions.

Update scene-definition tests:

```js
for (const definition of [activityRoomDefinition, reedsWetlandDefinition]) {
  assert.equal(definition.playerCharacterId, 'chen-yu');
  assert.deepEqual(
    definition.primitives.filter(({ kind }) => kind === 'person')
      .map(({ characterId }) => characterId).sort(),
    ['gu-yan', 'lin-xia']
  );
}
```

- [ ] **Step 6: Add browser identity assertions**

In the saved wetland test, assert:

```js
await expect(canvas).toHaveAttribute('data-player-model-source', 'imported');
await expect(canvas).toHaveAttribute('data-named-character-root-count', '3');
await expect(canvas).toHaveAttribute('data-imported-character-count', '3');
await expect(canvas).toHaveAttribute('data-character-model-ids', 'chen-yu,gu-yan,lin-xia');
```

Hold `W` through trusted keyboard input and assert `data-player-action` becomes `Walk`, then returns to `Idle`.

- [ ] **Step 7: Run targeted tests**

Run:

```powershell
node --test tests/unit/player-presentation.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs
npx.cmd playwright test tests/e2e/game-canvas.spec.mjs --project=desktop --grep "imported player|movement"
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```powershell
git add game/render/player-presentation.mjs game/render/world.mjs game/scenes/activity-room.mjs game/scenes/reeds-wetland.mjs tests/unit/player-presentation.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs tests/e2e/game-canvas.spec.mjs
git commit -m "feat: make Chen Yu the playable team member"
```

---

### Task 2: Character Material Separation and Echo Semantics

**Files:**
- Modify: `game/data/character-visuals.mjs`
- Modify: `game/data/characters.mjs`
- Modify: `game/render/character-presentation.mjs`
- Modify: `game/main.mjs`
- Modify: `tests/unit/character-presentation.unit.test.mjs`
- Modify: `tests/unit/story-data.unit.test.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`

**Interfaces:**
- Consumes: `appearance` fields `skin`, `jacket`, `shirt`, `trousers`, `backpack`, `accent`.
- Produces material roles: `skin`, `hair`, `clothing`, `shirt`, `trousers`, `backpack`, `accent`, `source`.
- Produces echo display copy: `name: '现场回响'`, `role: '历史片段'`.

- [ ] **Step 1: Add failing material-role tests**

Extend the presentation fixture with named materials and assert exact roles:

```js
assert.equal(materialByName('Green').userData.presentationRole, 'clothing');
assert.equal(materialByName('Grey').userData.presentationRole, 'trousers');
assert.equal(materialByName('Brown').userData.presentationRole, 'backpack');
assert.equal(materialByName('Gold').userData.presentationRole, 'accent');
assert.equal(materialByName('Unknown').userData.presentationRole, 'source');
assert.equal(materialByName('Unknown').color.getHex(), unknownSourceColor.getHex());
```

Add equivalent shirt/trouser assertions for Gu Yan and Lin Xia.

- [ ] **Step 2: Run the selected unit test and confirm RED**

Run:

```powershell
node --test tests/unit/character-presentation.unit.test.mjs
```

Expected: FAIL because all unrecognized and secondary materials currently resolve to `clothing`.

- [ ] **Step 3: Implement role-aware colors**

Add `shirt` to every named appearance. Update `MATERIAL_ROLES`:

```js
'chen-yu': {
  Skin: 'skin', Hair: 'hair', Eyebrows: 'hair', Eye: 'hair',
  Green: 'clothing', LightGreen: 'accent',
  Grey: 'trousers', Black: 'trousers',
  Brown: 'backpack', Brown2: 'backpack', Gold: 'accent'
}
```

Map Gu Yan `White -> shirt`, `LightBlue -> trousers`; map Lin Xia `White -> shirt`, `Grey -> clothing`, `Orange -> accent`. Return `appearance.shirt`, `appearance.trousers`, or `appearance.backpack` for those roles. When no role exists, use `source` and preserve the cloned source color.

- [ ] **Step 4: Clarify historical echo copy**

Change the character record:

```js
echo: {
  id: 'echo',
  name: '现场回响',
  gender: null,
  role: '历史片段',
  accent: '#c49a55',
  portrait: null
}
```

In `main.mjs`, use `characters[node.speaker]` for echo instead of synthesizing `回响 · 艺术化表达`.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test tests/unit/character-presentation.unit.test.mjs tests/unit/story-data.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
```

Expected: all pass and rendered-copy guards contain no old echo label.

- [ ] **Step 6: Commit**

```powershell
git add game/data/character-visuals.mjs game/data/characters.mjs game/render/character-presentation.mjs game/main.mjs tests/unit/character-presentation.unit.test.mjs tests/unit/story-data.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
git commit -m "feat: refine team materials and echo identity"
```

---

### Task 3: Wetland Composition, Portrait Camera, and Water Cadence

**Files:**
- Modify: `game/render/camera-rig.mjs`
- Modify: `game/render/scene-builder.mjs`
- Modify: `game/scenes/reeds-wetland.mjs`
- Modify: `tests/unit/camera-rig.unit.test.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/unit/scene-lifecycle.unit.test.mjs`

**Interfaces:**
- Consumes: existing `calculateThirdPersonCamera()` and `buildScene()`.
- Produces water diagnostics on each water mesh: `userData.normalUpdateInterval`.
- Exact boat hull position: `[6.4, 0.18, -7.4]`.
- Exact water-channel endpoint: `[6.4, -7.4]`, `halfWidth: 1.05`.

- [ ] **Step 1: Write failing camera and scene tests**

Change the portrait expected distance:

```js
assert.ok(Math.abs(distance - 5.05 * 1.16) < EPSILON);
assert.ok(rig.target[1] >= 1);
```

Assert the fishing boat hull and channel:

```js
assert.deepEqual(hull.position, [6.4, 0.18, -7.4]);
assert.deepEqual(rightReeds.waterChannel.to, [6.4, -7.4]);
assert.equal(rightReeds.waterChannel.halfWidth, 1.05);
```

Add a scene-lifecycle test that patches each water geometry's `computeVertexNormals`, calls `scene.update()` four times, and expects high-quality water to update twice and low-quality water once. Assert `normalUpdateInterval` is 2 or 4.

- [ ] **Step 2: Run tests and confirm RED**

Run:

```powershell
node --test tests/unit/camera-rig.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs tests/unit/scene-lifecycle.unit.test.mjs
```

Expected: portrait multiplier, boat position, channel, and cadence assertions fail.

- [ ] **Step 3: Tighten portrait framing**

In `calculateThirdPersonCamera()` use:

```js
const framedDistance = portrait ? distance * 1.16 : distance;
const framedTargetHeight = portrait ? targetHeight + 0.12 : targetHeight;
```

Use `framedTargetHeight` in the target calculation and continue centering shoulder offset in portrait.

- [ ] **Step 4: Move the boat and widen its channel**

Translate all boat components by the hull delta from `[8.9, -6.6]` to `[6.4, -7.4]`, preserving their relative x/z offsets and rotations. Update the right reed field channel endpoint and width exactly as declared above.

- [ ] **Step 5: Throttle normal recomputation**

In `createWater()`:

```js
const normalUpdateInterval = quality.postEffects ? 2 : 4;
let animationFrame = 0;
mesh.userData.normalUpdateInterval = normalUpdateInterval;
animations.push((time, activeReducedMotion) => {
  if (activeReducedMotion) return;
  animationFrame += 1;
  // Update positions every frame.
  if (animationFrame % normalUpdateInterval === 0) geometry.computeVertexNormals();
  // Keep texture offset continuous.
});
```

- [ ] **Step 6: Run targeted tests**

Run the same three unit files. Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add game/render/camera-rig.mjs game/render/scene-builder.mjs game/scenes/reeds-wetland.mjs tests/unit/camera-rig.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs tests/unit/scene-lifecycle.unit.test.mjs
git commit -m "feat: improve wetland framing and water efficiency"
```

---

### Task 4: Objective HUD and Contextual Hotspots

**Files:**
- Create: `game/core/objective-status.mjs`
- Create: `tests/unit/objective-status.unit.test.mjs`
- Modify: `game/index.html`
- Modify: `game/scenes/activity-room.mjs`
- Modify: `game/scenes/reeds-wetland.mjs`
- Modify: `game/core/session-controller.mjs`
- Modify: `game/ui/game-shell.mjs`
- Modify: `game/styles.css`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `tests/unit/session-controller.unit.test.mjs`

**Interfaces:**
- Produces: `describeObjective({ sceneId, completedHotspotIds = [] }) -> string`.
- Extends: `shell.showHud({ chapterTitle, objective })`, `shell.setObjective(text)`, `shell.setHotspot(hotspot)`.
- Extends session UI call: `ui.showHud(sceneId, { completedHotspotIds })`.

- [ ] **Step 1: Write failing pure objective tests**

```js
assert.equal(describeObjective({ sceneId: 'activity-room' }), '前往路线板，确认出发计划');
assert.equal(describeObjective({ sceneId: 'reeds-wetland' }), '沿栈道完成三项现场记录');
assert.equal(describeObjective({
  sceneId: 'reeds-wetland',
  completedHotspotIds: ['camera-spot']
}), '现场记录 1 / 3');
assert.equal(describeObjective({
  sceneId: 'reeds-wetland',
  completedHotspotIds: ['camera-spot', 'notes-spot', 'voice-spot']
}), '三项记录完成，整理今日回响');
```

- [ ] **Step 2: Run the objective test and confirm RED**

Run:

```powershell
node --test tests/unit/objective-status.unit.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement objective data flow**

Create the pure module with a fixed set of the three wetland hotspot IDs. Add `<p data-objective></p>` inside `#hud`.

Every `session-controller.mjs` call to `ui.showHud` must pass:

```js
{
  completedHotspotIds: state.visitedHotspots.filter((id) => REED_HOTSPOTS.has(id))
}
```

In `main.mjs`, call `describeObjective()` before `shell.showHud()`.

- [ ] **Step 4: Add contextual hotspot labels**

Add these exact fields:

```js
// activity room
label: '路线板',
actionLabel: '确认出发计划'

// wetland
camera-spot: label '陈屿取景位', actionLabel '开始晨雾取景'
notes-spot: label '顾言', actionLabel '协助核对路线'
voice-spot: label '林夏', actionLabel '协助安静收声'
```

Update `game-shell.mjs` so both visible prompt text and accessible labels use `actionLabel`. Never include the internal hotspot ID.

- [ ] **Step 5: Add restrained HUD styling**

Keep `#hud` one unframed information band. Style objective as a smaller off-white line below the gold location title. At 390x844 and 844x390 cap width so it does not overlap runtime controls.

- [ ] **Step 6: Extend shell and session tests**

Assert `showHud()` renders the objective and `setHotspot()` renders exact action copy. Assert session UI receives the updated completed ID array after each successful task.

- [ ] **Step 7: Run targeted tests**

```powershell
node --test tests/unit/objective-status.unit.test.mjs tests/unit/session-controller.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add game/core/objective-status.mjs game/index.html game/scenes/activity-room.mjs game/scenes/reeds-wetland.mjs game/core/session-controller.mjs game/ui/game-shell.mjs game/styles.css tests/unit/objective-status.unit.test.mjs tests/unit/session-controller.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
git commit -m "feat: add clear field objectives and hotspot actions"
```

---

### Task 5: Modal Focus Management

**Files:**
- Create: `game/ui/modal-focus.mjs`
- Create: `tests/unit/modal-focus.unit.test.cjs`
- Modify: `game/index.html`
- Modify: `game/ui/dialogue-view.mjs`
- Modify: `game/ui/field-task-view.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `tests/unit/field-task-view.unit.test.cjs`

**Interfaces:**
- Produces: `createModalFocusScope(container) -> { open(preferred), close({ restore = true }), destroy() }`.
- `preferred` may be an Element or selector string; invalid restore targets fall back to focusable `body`.

- [ ] **Step 1: Write failing focus-scope tests**

Mount a visible dialog with two buttons and an outside opener. Assert:

1. `open('[data-primary]')` focuses the primary button.
2. Tab from the last button wraps to the first.
3. Shift+Tab from the first wraps to the last.
4. `close()` restores the outside opener.
5. Removing the opener before close focuses body.
6. `destroy()` removes the key listener and is idempotent.

- [ ] **Step 2: Run the focus test and confirm RED**

```powershell
node --test tests/unit/modal-focus.unit.test.cjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the reusable focus scope**

Use the same focusable selector family already used by `game-shell.mjs`. Save `ownerDocument.activeElement` only when opening from a closed state. Trap only `Tab`; do not swallow Escape or gameplay keys. Ensure body receives `tabindex="-1"` only when needed.

- [ ] **Step 4: Integrate dialogue and field task**

Add these attributes in `game/index.html`:

```html
<section id="dialogue-layer" role="dialog" aria-modal="true" aria-label="剧情对话" ...>
<section id="field-task-layer" role="dialog" aria-modal="true" aria-labelledby="field-task-title" ...>
<h2 id="field-task-title" data-field-title></h2>
```

Dialogue `show()` opens the scope with the first choice button or dialogue line. Dialogue `hide()` closes it. Field task `show()` focuses `[data-field-cancel]`; `hide()` restores focus.

- [ ] **Step 5: Extend view tests**

Verify focus is inside the visible modal, Tab stays inside it, and hide/cancel/submit leaves no focus inside a hidden ancestor.

- [ ] **Step 6: Run targeted tests**

```powershell
node --test tests/unit/modal-focus.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs tests/unit/field-task-view.unit.test.cjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add game/ui/modal-focus.mjs game/ui/dialogue-view.mjs game/ui/field-task-view.mjs game/index.html tests/unit/modal-focus.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs tests/unit/field-task-view.unit.test.cjs
git commit -m "fix: manage focus in dialogue and field tasks"
```

---

### Task 6: Mobile Hero and Visible Look Control

**Files:**
- Create: `assets/generated/hero-summer-echo-portrait.jpg`
- Create: `tests/unit/mobile-visual-assets.unit.test.cjs`
- Modify: `game/index.html`
- Modify: `game/ui/touch-controls.mjs`
- Modify: `game/styles.css`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`

**Interfaces:**
- Consumes source image: `C:\Users\axezt\.codex\generated_images\019f21c8-8b00-7580-b639-a9c0ef5c5813\exec-0d2cfe1b-b1e1-4cd7-89a7-76afe76e4dc9.png`.
- Produces local JPEG at 1024x1536, quality 86.
- Extends touch control with keyboard-callable look buttons through `handlers.onLook({ x, y: 0 })`.

- [ ] **Step 1: Write failing asset and markup tests**

Use Sharp metadata:

```js
const metadata = await sharp('assets/generated/hero-summer-echo-portrait.jpg').metadata();
assert.equal(metadata.width, 1024);
assert.equal(metadata.height, 1536);
assert.equal(metadata.format, 'jpeg');
```

Assert `game/index.html` contains a real button:

```html
<button type="button" class="look-zone" data-look-zone
  aria-label="拖动调整视角" title="拖动调整视角">
  <span aria-hidden="true">↔</span><small>视角</small>
</button>
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests/unit/mobile-visual-assets.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs
```

Expected: missing image and missing button markup failures.

- [ ] **Step 3: Create the optimized local hero**

Run a one-time Sharp conversion:

```powershell
@'
const sharp = require('sharp');
sharp(process.argv[2])
  .resize(1024, 1536, { fit: 'cover' })
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(process.argv[3]);
'@ | node - "C:\Users\axezt\.codex\generated_images\019f21c8-8b00-7580-b639-a9c0ef5c5813\exec-0d2cfe1b-b1e1-4cd7-89a7-76afe76e4dc9.png" "assets\generated\hero-summer-echo-portrait.jpg"
```

Do not delete or overwrite the existing landscape hero.

- [ ] **Step 4: Implement the visible look control**

Replace the transparent div with the exact button above. Preserve pointer-drag behavior. Add `keydown` handling so ArrowLeft/ArrowRight while the button is focused calls:

```js
handlers.onLook?.({ x: event.code === 'ArrowLeft' ? -18 : 18, y: 0 });
```

Prevent default only for those two keys.

- [ ] **Step 5: Apply portrait-only styling**

Within `@media (max-width: 520px) and (orientation: portrait)`:

```css
#game-root,
#game-root:has(#main-menu:not([hidden])) {
  background-image: url("../assets/generated/hero-summer-echo-portrait.jpg");
  background-position: center;
}
```

Style `.look-zone` as a 64px circular control with the horizontal symbol and “视角” label. Keep it separate from the 58px interaction button and preserve safe-area spacing.

- [ ] **Step 6: Run targeted tests**

Run the same two unit files. Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add assets/generated/hero-summer-echo-portrait.jpg game/index.html game/ui/touch-controls.mjs game/styles.css tests/unit/mobile-visual-assets.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs
git commit -m "feat: improve the mobile entry and camera control"
```

---

### Task 7: Visual Release Gate and Publication

**Files:**
- Modify: `tests/e2e/visual-regression.spec.mjs`
- Modify: `tests/e2e/prototype-flow.spec.mjs` only if assertions require new visible copy
- Create ignored evidence under: `test-results/continuous-cinematic-polish/`

**Interfaces:**
- Consumes all prior task diagnostics and UI copy.
- Produces screenshots for menu, activity dialogue, wetland exploration, each field task, result, and summary at 1440x900, 390x844, and 844x390.

- [ ] **Step 1: Add failing release assertions**

Extend the runtime preflight to assert:

```js
expect(evidence.playerModelSource).toBe('imported');
expect(evidence.namedCharacterRootCount).toBe(3);
expect(evidence.characterModelIds.split(',').sort())
  .toEqual(['chen-yu', 'gu-yan', 'lin-xia']);
expect(await page.locator('[data-objective]').innerText()).not.toBe('');
expect(await page.locator('body').innerText()).not.toMatch(/camera-spot|notes-spot|voice-spot/);
```

For 390x844 assert the visible look control is at least 58x58 and the main menu uses the portrait image in computed style.

- [ ] **Step 2: Run visual tests and confirm any missing contract fails**

```powershell
npx.cmd playwright test tests/e2e/visual-regression.spec.mjs --project=desktop
npx.cmd playwright test tests/e2e/visual-regression.spec.mjs --project=mobile-landscape
```

- [ ] **Step 3: Fix only release-gate regressions**

Adjust source CSS or deterministic test helpers only when evidence shows overlap, clipping, blank canvas, hidden controls, or stale copy. Do not weaken pixel, overflow, model, or frame-budget assertions.

- [ ] **Step 4: Run the complete suite**

```powershell
npm.cmd test
```

Expected: unit suite passes; browser suite reports 0 failed tests.

- [ ] **Step 5: Inspect screenshots and canvas pixels**

Open all three menu/wetland/dialogue screenshots. Confirm:

- exactly three visible team members across player and NPCs;
- all three people visible in portrait menu;
- no duplicated limbs in the generated hero;
- boat recognizable in initial wetland framing;
- objective and controls do not overlap;
- portrait no longer has a large empty lower-water region;
- canvas opaque ratio > 0.25, luminance spread > 24, color buckets >= 12.

- [ ] **Step 6: Commit release checks**

```powershell
git add tests/e2e/visual-regression.spec.mjs tests/e2e/prototype-flow.spec.mjs
git commit -m "test: verify continuous cinematic polish"
```

Skip the commit if no tracked test file changed.

- [ ] **Step 7: Merge and publish**

Fast-forward the verified feature branch into `main`, rerun `npm.cmd test` on the merged tree, then:

```powershell
git push origin main
```

Do not force-push.

- [ ] **Step 8: Verify GitHub Pages**

Check:

- `/game/` returns 200;
- portrait hero returns 200 with expected byte size;
- all six GLB files return 200;
- browser diagnostics show imported player, three character roots and three active mixers;
- keyboard movement changes player position;
- mobile look drag changes camera yaw;
- console errors, page errors and failed requests are all empty.

