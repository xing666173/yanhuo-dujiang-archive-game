# 3D Visual, Model, and Interface Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to execute this plan one task at a time with
> task-scoped review after every implementation task.

**Goal:** Replace the most visibly geometric characters and near-bank scenery with
optimized local CC0 models, add authored animation and robust fallback behavior, and
redesign the game interface into a polished documentary-cinematic presentation without
changing the existing story, tasks, routes, controls, or save format.

**Architecture:** Add an immutable asset manifest and a world-owned asynchronous model
library in front of the existing synchronous scene builder. Imported skinned characters
and selected nature models are cloned from settled source assets; any missing asset uses
the existing procedural implementation. The world remains the only runtime owner of the
library, and scene rebuilds dispose mixers and instances without disposing shared source
geometry.

**Tech Stack:** Static HTML/CSS, native ES modules, Three.js 0.185.1, GLTFLoader,
SkeletonUtils, glTF Transform for offline processing, Node test runner, Playwright, and
GitHub Pages.

## Global Constraints

- Keep `/` and `/game/`, all visible story copy, the three field-task rules, local save
  behavior, keyboard controls, touch controls, pointer look, accessibility names, and
  analytics-relevant DOM IDs unchanged unless a test proves a visual wrapper can change
  safely.
- Keep exactly three named teammates: Chen Yu and Gu Yan are men; Lin Xia is a woman.
  The controllable avatar remains an anonymous non-story viewpoint and must not be
  presented as a fourth named team member.
- All runtime model requests are same-origin repository paths. No CDN, model host, or
  third-party API may be required after publication.
- Quaternius CC0 source records and a local license copy must ship with the models.
- Keep the current procedural character, tree mass, reeds, lotus, water, and WebGL
  fallback paths. A failed model request must still lead to a playable scene.
- Preserve Three.js sRGB output, ACES tone mapping, quality switching, reduced-motion
  behavior, and scene disposal.
- Combined character GLBs must be at most 4.5 MB; environment GLBs at most 1.5 MB; all
  new model payload at most 6 MB; every GLB at most 2 MB; three visible named characters
  at most 25,000 triangles.
- Imported nature is limited to authored near and middle ground. High quality adds at
  most 18 environment draw calls; low quality may omit imported bushes and reduce tree
  instances.
- Use one dark translucent UI theme, one muted cinnabar interaction accent, one warm
  reed-gold status color, 4 px control radii, and 6 px framed-panel radii.
- Do not add a teacher mode, landing-page marketing copy, runtime network dependency,
  shutdown command, restart command, system-setting change, or unrelated refactor.
- Every feature or bug fix starts with a failing automated test. Every task ends with
  its focused tests, `git diff --check`, and a focused commit.

## Task 1: Define Model Asset and Release Contracts

**Files:**

- Create: `game/data/model-assets.mjs`
- Create: `tests/unit/model-assets.unit.test.mjs`
- Modify: `tests/unit/release-contract.unit.test.cjs`

**Step 1: Write failing manifest tests**

Add tests that import `MODEL_ASSETS`, `CHARACTER_MODEL_IDS`, and
`ENVIRONMENT_MODEL_IDS` and assert:

- exactly `chen-yu`, `gu-yan`, `lin-xia`, `birch-tree-1`, `birch-tree-3`, and
  `bush-large` exist;
- each URL begins with `./assets/models/`, ends in `.glb`, and contains no protocol or
  protocol-relative prefix;
- every record is deeply immutable enough that mutation throws in strict mode;
- every record has `license: 'CC0-1.0'`, an HTTPS Quaternius `sourceUrl`, positive
  `triangleCount`, and positive `maxBytes` no larger than 2,000,000;
- character records list exactly `Idle`, `Walk`, `Interact`, and `Wave`;
- summed character triangles are no more than 25,000;
- summed `maxBytes` respect the 4.5 MB, 1.5 MB, and 6 MB ceilings.

Extend the release contract to require `game/assets/models/ATTRIBUTION.md` and every
declared local asset file.

Run:

```powershell
npm run test:unit -- --test-name-pattern="model asset|model release"
```

Expected: failure because the manifest and files do not exist.

**Step 2: Implement the immutable manifest**

Export frozen records and frozen ID maps. Keep display concerns out of this file. Use
model URL strings relative to `game/index.html`.

**Step 3: Re-run focused tests**

The manifest tests should pass while the release contract may remain red only for model
files that Task 2 adds.

**Step 4: Commit**

```powershell
git add game/data/model-assets.mjs tests/unit/model-assets.unit.test.mjs tests/unit/release-contract.unit.test.cjs
git commit -m "test: define local model asset contracts"
```

## Task 2: Process and Add Licensed CC0 Assets

**Files:**

- Create: `tools/process-model-assets.mjs`
- Create: `tests/unit/model-processing.unit.test.mjs`
- Create: `game/assets/models/chen-yu.glb`
- Create: `game/assets/models/gu-yan.glb`
- Create: `game/assets/models/lin-xia.glb`
- Create: `game/assets/models/birch-tree-1.glb`
- Create: `game/assets/models/birch-tree-3.glb`
- Create: `game/assets/models/bush-large.glb`
- Create: `game/assets/models/ATTRIBUTION.md`
- Create: `game/assets/models/CC0-1.0.txt`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Write failing output-inspection tests**

Use `@gltf-transform/core` in the test to inspect the six output GLBs. Assert:

- every declared file exists and is no larger than its manifest `maxBytes`;
- character documents contain only the four allowed clip names;
- character documents retain named skeleton joints including `Hips`, `Head`, `Wrist.L`,
  and `Wrist.R`;
- character triangle counts and aggregate budgets match the manifest;
- environment documents contain no animation and fit aggregate budgets;
- no output references an external texture or buffer URI;
- attribution names each output, original pack, source page, and CC0-1.0.

Run:

```powershell
npm run test:unit -- --test-name-pattern="model processing|model release"
```

Expected: failure because optimized outputs do not yet exist.

**Step 2: Add the offline processor**

Add glTF Transform as a development-only dependency. Implement a CLI that receives an
input path, output path, asset kind, and optional allowed animation list. It must remove
disallowed clips, run deduplication and pruning, omit the oversized birch normal texture,
embed remaining resources, and write GLB. It must print output bytes, triangles, and clip
names and exit nonzero when a budget is exceeded.

**Step 3: Generate release assets from the researched source files**

Process:

- `Adventurer.gltf` to `chen-yu.glb`;
- `Casual_2.gltf` to `gu-yan.glb`;
- women `Casual.gltf` to `lin-xia.glb`;
- `BirchTree_1.gltf`, `BirchTree_3.gltf`, and `Bush_Large.gltf` to their matching GLBs.

Binary copying and optimizer output are mechanical asset operations; do not hand-edit
GLB bytes. Add the Quaternius CC0 license and precise attribution.

**Step 4: Run focused and full release tests**

```powershell
npm run test:unit -- --test-name-pattern="model asset|model processing|model release"
npm run test:unit
git diff --check
```

**Step 5: Commit**

```powershell
git add package.json package-lock.json tools/process-model-assets.mjs tests/unit/model-processing.unit.test.mjs game/assets/models
git commit -m "feat: add optimized CC0 model assets"
```

## Task 3: Add the Partial-Success Runtime Model Library

**Files:**

- Modify: `tools/vendor-three.cjs`
- Modify: `game/index.html`
- Create: `game/vendor/addons/loaders/GLTFLoader.js`
- Create: `game/vendor/addons/utils/BufferGeometryUtils.js`
- Create: `game/vendor/addons/utils/SkeletonUtils.js`
- Create: `game/render/model-library.mjs`
- Create: `tests/unit/model-library.unit.test.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`

**Step 1: Write failing loader and ownership tests**

Inject a fake loader and lightweight source scenes into `loadModelLibrary`. Assert:

- all records are attempted and progress receives settled counts;
- one rejected record produces a usable partial library;
- `has(id)` reflects only successful records;
- environment instances are separate groups but share source geometry;
- character instances use an injected skeleton clone function;
- instance disposal stops and uncaches its mixer without disposing shared geometry;
- library disposal disposes every unique source geometry, material, and texture exactly
  once and is idempotent;
- creating an unavailable asset returns `null`.

Run:

```powershell
npm run test:unit -- --test-name-pattern="model library|vendored Three"
```

Expected: failure because the loader and vendored add-ons do not exist.

**Step 2: Vendor official matching Three.js add-ons**

Extend `npm run vendor:three` to copy the three official add-on files from the installed
Three.js 0.185.1 package. Add an import map for `three` and `three/addons/` before the
game entry module and add a release test that forbids remote import-map targets.

**Step 3: Implement the library**

Export:

```js
loadModelLibrary({
  assetRecords,
  loader,
  skeletonClone,
  onProgress
})
```

Use `Promise.allSettled`, normalize loaded roots, cache clips by name, and retain source
ownership in the library. `createCharacter` and `createEnvironment` return independent
instance wrappers with `group`, `update`, `setQuality`, `play`, and `dispose`.

**Step 4: Run tests and commit**

```powershell
npm run test:unit -- --test-name-pattern="model library|vendored Three"
npm run test:unit
git diff --check
git add tools/vendor-three.cjs game/index.html game/vendor game/render/model-library.mjs tests/unit/model-library.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
git commit -m "feat: add resilient runtime model library"
```

## Task 4: Integrate Animated Characters and Procedural Fallback

**Files:**

- Create: `game/render/character-presentation.mjs`
- Create: `tests/unit/character-presentation.unit.test.mjs`
- Modify: `game/render/scene-builder.mjs`
- Modify: `game/render/world.mjs`
- Modify: `game/main.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`

**Step 1: Write failing presentation and integration tests**

Assert:

- palette remapping keeps skin, hair, clothing, and accent material roles distinct;
- a prop attaches to `Wrist.R`, with `Wrist.L` as a tested fallback;
- `play('Walk')` cross-fades from idle, repeating the same action is a no-op, and stopping
  movement returns to idle;
- active NPC hotspots request `Interact` and completed hotspots return to `Idle`;
- scene building prefers imported Chen Yu, Gu Yan, and Lin Xia models;
- a missing model falls back to `createCharacterModel` without throwing;
- world disposal disposes the model library once;
- an intercepted character GLB failure still reaches playable exploration.

Run:

```powershell
npm run test:unit -- --test-name-pattern="character presentation|imported character"
npx playwright test tests/e2e/game-canvas.spec.mjs --grep "model fallback"
```

Expected: failure before integration.

**Step 2: Implement character presentation**

Add named palette mapping, rough non-metallic material normalization, authored idle
variation, wrist props, shadow flags, and the action state machine. Keep animation
cross-fades short and deterministic. Reduced motion keeps state changes but removes idle
body drift.

**Step 3: Preload the library before world creation**

In `initializeGame`, import the manifest and model library, settle all asset requests,
then pass the partial library into `createWorld`. Keep initialization-generation checks
around the asynchronous boundary so a late load is disposed after page teardown.

**Step 4: Use imported NPCs first**

Pass the library into `buildScene`. Store character instances in a map so the world can
update active, completed, and idle animations. Keep the anonymous player on the improved
procedural fallback for visual distinction.

Expose diagnostics on the canvas:

- `data-model-library-ready`;
- `data-imported-character-count`;
- `data-character-model-ids`;
- `data-player-action`.

**Step 5: Run focused and full tests, then commit**

```powershell
npm run test:unit -- --test-name-pattern="character presentation|imported character|scene definition"
npx playwright test tests/e2e/game-canvas.spec.mjs
npm run test:unit
git diff --check
git add game/render/character-presentation.mjs game/render/scene-builder.mjs game/render/world.mjs game/main.mjs tests/unit tests/e2e/game-canvas.spec.mjs
git commit -m "feat: animate imported field-team characters"
```

## Task 5: Integrate Nature Models and Rebalance Rendering

**Files:**

- Create: `game/render/environment-presentation.mjs`
- Create: `tests/unit/environment-presentation.unit.test.mjs`
- Modify: `game/render/scene-builder.mjs`
- Modify: `game/render/world.mjs`
- Modify: `game/scenes/reeds-wetland.mjs`
- Modify: `game/scenes/activity-room.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`

**Step 1: Write failing composition tests**

Assert:

- authored nature placements are deterministic and remain outside walkable boardwalk
  lanes;
- high quality creates no more than 18 imported environment draw calls;
- low quality creates fewer imported instances and omits `bush-large`;
- imported nature materials are rough, non-metallic, and desaturated within declared
  limits;
- quality switching preserves player position, hotspot state, and named-character count;
- scene diagnostics report imported environment count, triangles, draw calls, and active
  quality.

Run:

```powershell
npm run test:unit -- --test-name-pattern="environment presentation|nature composition"
npx playwright test tests/e2e/game-canvas.spec.mjs --grep "quality"
```

Expected: failure before integration.

**Step 2: Implement authored near-bank composition**

Use the two birches and one bush model only in curated middle-ground groups. Add a
primitive low-profile fishing boat on the horizon. Retain instanced reeds, lotus, and
procedural distant tree mass. Add subtle deterministic foliage sway only in high quality
and disable it for reduced motion.

**Step 3: Rebalance lighting and water**

Keep ACES and sRGB. Adjust scene exposure, warm directional key, cool hemisphere fill,
soft rim, fog falloff, water base color, and grazing sheen so faces and clothing retain
shape without clipping the sky. Low quality must remain legible with shadows disabled.

**Step 4: Run tests and commit**

```powershell
npm run test:unit -- --test-name-pattern="environment presentation|nature composition|scene definition"
npx playwright test tests/e2e/game-canvas.spec.mjs
npm run test:unit
git diff --check
git add game/render/environment-presentation.mjs game/render/scene-builder.mjs game/render/world.mjs game/scenes tests/unit tests/e2e/game-canvas.spec.mjs
git commit -m "feat: compose a richer Baiyangdian wetland"
```

## Task 6: Redesign the Interface with Taste Skill

**Files:**

- Modify: `game/index.html`
- Modify: `game/styles.css`
- Modify: `game/ui/game-shell.mjs`
- Modify: `game/ui/dialogue-view.mjs`
- Modify: `game/ui/field-task-view.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `tests/unit/field-task-view.unit.test.cjs`
- Modify: `tests/e2e/visual-regression.spec.mjs`

**Step 1: Write failing layout and interface contracts**

Assert:

- the menu has a lower-left title region and a right-side action region;
- runtime controls remain one labelled group and retain existing accessible names;
- location, hotspot prompt, dialogue, choices, and task status each have a single stable
  layout region;
- task hit-area dimensions and all existing control IDs remain unchanged;
- no teacher-mode text or UI exists;
- visible copy contains no em dash;
- Playwright overlap checks pass at 1440x900, 390x844, and 844x390.

Run:

```powershell
npm run test:unit -- --test-name-pattern="game shell|field task view"
npx playwright test tests/e2e/visual-regression.spec.mjs
```

Expected: at least the new structural and overlap assertions fail.

**Step 2: Apply the interface system**

Use native CSS with:

- one dark translucent theme over the full-bleed daylight canvas;
- one muted cinnabar action accent and one reed-gold status color;
- 4 px controls and 6 px framed panels;
- title in the lower-left menu safe area;
- a narrow right action rail;
- compact top-right runtime controls with icon plus text where space permits;
- top-left location label;
- lower-third dialogue with portrait outside the text column;
- choices as one command list, not nested cards;
- thin field-task title and status strips;
- `100dvh`, safe-area insets, and explicit mobile portrait and landscape rules.

Use only meaningful state and transition motion. Wrap decorative entrances and foliage
effects in both CSS reduced-motion and the in-game reduced-motion state.

**Step 3: Run focused tests and capture draft screenshots**

```powershell
npm run test:unit -- --test-name-pattern="game shell|field task view"
npx playwright test tests/e2e/visual-regression.spec.mjs
git diff --check
```

Inspect menu, dialogue, exploration, every task, result, and chapter summary screenshots
at all three target viewports before committing.

**Step 4: Commit**

```powershell
git add game/index.html game/styles.css game/ui tests/unit tests/e2e/visual-regression.spec.mjs
git commit -m "feat: redesign the documentary game interface"
```

## Task 7: Debug Model Failures, Motion, and Lifecycle

**Files:**

- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/e2e/prototype-flow.spec.mjs`
- Modify: `game/main.mjs`
- Modify: `game/render/model-library.mjs`
- Modify: `game/render/world.mjs`
- Modify other files only when a reproduced failure identifies the responsible module

**Step 1: Add failing browser regressions for reproduced risks**

Cover:

- all six same-origin model requests return 200 in the normal flow;
- delayed model loads cannot attach after `pagehide`;
- one failed character and one failed environment request preserve movement, interaction,
  dialogue, task entry, quality switching, and save;
- keyboard and on-screen directional movement both switch the player diagnostic to
  `Walk`, then back to `Idle`;
- dialogue, pause, settings, history, and field tasks clear movement and do not leave a
  stuck walk action;
- scene and quality rebuilds keep one player root, three named NPCs, and no duplicated
  animation mixers;
- browser console and page-error collections remain empty except one expected,
  classified asset-fallback warning during the forced-failure test.

Run the new tests and confirm each catches the intended missing behavior before fixing.

**Step 2: Fix root causes**

Follow the failing state backward through input, world, library, scene, and UI ownership.
Do not mask failures with timeouts or catch-all suppression. Classify optional asset
failures once, clean up stale asynchronous work, and keep diagnostic state deterministic.

**Step 3: Run focused and full browser suites**

```powershell
npx playwright test tests/e2e/game-canvas.spec.mjs
npx playwright test tests/e2e/prototype-flow.spec.mjs
npm run test:e2e
npm run test:unit
git diff --check
```

**Step 4: Commit**

```powershell
git add game tests
git commit -m "fix: harden model loading and animated movement"
```

## Task 8: Visual, Performance, and Taste Pre-Flight Verification

**Files:**

- Modify: `tests/e2e/visual-regression.spec.mjs`
- Create: `test-results/visual-model-upgrade/` during verification only
- Modify implementation files only when a measured failure requires a fix

**Step 1: Extend diagnostics and screenshot checks**

Automate captures for menu, dialogue, wetland exploration, focus task, timing task,
listening task, result, and summary at 1440x900, 390x844, and 844x390. Assert:

- the canvas has nonblank pixel variance and no full-frame fallback color;
- the three named imported character IDs are ready in normal mode;
- player and marker feet remain on the visual surface;
- dialogue, controls, prompts, joystick, and task interfaces do not overlap;
- no text or button overflows its region;
- runtime triangles, draw calls, and model bytes remain within declared budgets;
- sampled 95th-percentile frame time remains below the existing quality-monitor
  threshold, with automatic low-quality downgrade still working.

Run and observe any new failing assertion before changing production code.

**Step 2: Inspect actual screenshots and canvas pixels**

Open representative desktop, portrait, and landscape screenshots. Check character
silhouettes, hands, camera crop, face lighting, depth layers, water readability, task
legibility, and full-screen balance. Fix visual defects at their source and repeat.

**Step 3: Run the complete Taste pre-flight**

Mechanically verify:

- no visible em dash;
- one theme, one action accent, one status color, one radius system;
- WCAG AA text and control contrast;
- no desktop CTA wrapping or mobile control overlap;
- all motion is tied to feedback, state, hierarchy, or scene life;
- decorative motion stops for reduced motion;
- no cards inside cards, fake SVG imagery, gradient orbs, decorative dots, teacher mode,
  or version labels;
- `100dvh`, safe-area, cleanup, loading, error, and playable fallback states exist.

**Step 4: Run all verification and commit any fixes**

```powershell
npm run test:unit
npm run test:e2e
npm test
git diff --check
git status --short
```

If verification required implementation fixes, commit them as:

```powershell
git add game tests
git commit -m "fix: polish 3D presentation across viewports"
```

## Task 9: Review, Integrate, Publish, and Production Smoke Test

**Files:**

- Modify: `README.md`
- Modify: `game/assets/models/ATTRIBUTION.md` only if final measured values differ

**Step 1: Update user-facing project documentation**

Document local preview, keyboard and touch controls, local CC0 asset ownership, optional
model fallback, quality settings, and the GitHub Pages route. Do not add teacher mode.

**Step 2: Run final whole-branch review**

Review the complete diff from `52b3701d25277b2ae57991018c8b21cb2b952a90` for behavioral
regressions, ownership leaks, asset licensing, route stability, save compatibility,
mobile layout, accessibility, and missing tests. Resolve every load-bearing finding and
re-run affected tests.

**Step 3: Final verification**

```powershell
npm ci
npm run vendor:three
npm run test:unit
npm run test:e2e
npm test
git diff --check
git status --short
```

Confirm the vendoring command is idempotent and leaves the worktree clean.

**Step 4: Integrate and publish**

Use `superpowers:finishing-a-development-branch`. Merge the reviewed feature branch into
local `main` without discarding unrelated work, then push `main` to
`origin`. Wait for GitHub Pages to serve the pushed commit.

**Step 5: Run production smoke**

At `https://xing666173.github.io/yanhuo-dujiang-archive-game/game/` verify:

- all six model requests return 200 and stay on the GitHub Pages origin;
- menu, new game, movement, all three interactions, all three tasks, result, and chapter
  summary complete;
- save and settings persist after reload;
- normal desktop and mobile screenshots contain the imported characters and no overlap;
- no browser page errors, unclassified console errors, missing resources, teacher mode,
  or WebGL fallback occur.

Record the deployed commit SHA and production URL in the final report.
