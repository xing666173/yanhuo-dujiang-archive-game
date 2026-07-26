# Final Production Review Fix Report

Date: 2026-07-27
Branch: `feature/yanhuo-3d-story-game`
Review base: `88982724cf224a18915b19b97790cbbb95293587`
Implementation commit: `6f42b3cd7620047394541bd9206512d4fd4581af`
Commit subject: `fix: close final production review gaps`

## Scope And Boundaries

- Addressed all nine adjudicated whole-branch findings in one final fix wave.
- Preserved the approved portraits and anatomy, two-men/one-woman composition, full-bleed scenes, 18 degree camera, shadow disposal, mobile touch flow, procedural local audio, 4500 ms echo, save format version, relative assets, local-only runtime, and Task 8 visual bounds.
- Did not edit, stage, commit, revert, or delete the pre-existing tracked modification at `.superpowers/sdd/2026-07-26-yanhuo-3d-story-game-mvp/task-2-report.md`.
- Removed `.planning/` before final status.
- Did not stage or commit screenshots, evidence JSON, or scratch planning files.

## RED Evidence

Tests were written or tightened before the production changes.

### Focused Unit RED

Command:

```text
node --test tests/unit/save-store.unit.test.mjs tests/unit/session-controller.unit.test.mjs tests/unit/proximity.unit.test.mjs tests/unit/story-data.unit.test.mjs tests/unit/homepage-contract.unit.test.cjs
```

Result: 34 tests, 25 passed, 9 failed.

The failures proved:

1. The homepage still rendered `陈宇` instead of `陈屿`.
2. Completed hotspots remained eligible.
3. Invalid non-boolean settings were coerced instead of defaulted.
4. Structurally malformed progress was accepted.
5. Throwing storage reads crashed.
6. Throwing storage cleanup crashed.
7. The first new-journey save had null active script/node IDs.
8. Completed hotspot state was not synchronized to the world.
9. A teacher choice and scene transition wrote normal progress.

### Focused Browser RED

Command:

```text
npx.cmd playwright test tests/e2e/game-canvas.spec.mjs --project=desktop --grep "test-only query|throwing browser storage|semantically unknown|coordinate diagnostics|visibility loss"
```

Result: 5 tests, 0 passed, 5 failed.

The failures proved:

- Visibility loss cancelled two animation frames instead of one.
- `testHud` and `scene` query values bypassed the normal UI.
- Throwing browser storage entered the WebGL fallback.
- A structurally valid but unknown saved script exposed Continue.
- `#game-status` remained in live/accessible output.

Command:

```text
npx.cmd playwright test tests/e2e/prototype-flow.spec.mjs --project=desktop --grep "player completes|teacher choice|new journey saves|pause shows"
```

Result: 4 tests, 0 passed, 4 failed.

The failures proved:

- Held desktop movement drifted 1.01 world units through dialogue.
- Teacher browsing changed the pre-existing save.
- The immediate new-journey save still had null active IDs.
- Dialogue remained visible behind the pause menu.

Command:

```text
npx.cmd playwright test tests/e2e/prototype-flow.spec.mjs --project=mobile-landscape --grep "player completes"
```

Result: 1 test, 0 passed, 1 failed. Held touch movement drifted 0.97 world units through dialogue.

Command:

```text
node --test --test-name-pattern="continuing normal progress" tests/unit/session-controller.unit.test.mjs
```

Result: 1 test, 0 passed, 1 failed. Continue after teacher browsing retained the teacher node instead of restoring the saved normal node.

## Per-Finding Implementation And GREEN Evidence

### 1. Persistence Boundaries And Storage Resilience

- `startNew()` now loads the activity room without saving, starts `prologue`, then writes the first checkpoint with valid active script/node IDs.
- Teacher browsing remains ephemeral through choices, dialogue advances, and scene transitions.
- Continuing a normal journey restores both session state and story-engine state and reenables normal writes.
- Save validation now checks versions, the two known scene IDs, required story/session fields, paired active IDs, finite stats/cooperation, string arrays, choices records, booleans, and completed scene IDs.
- Semantic script/node validation in `main.mjs` clears unknown saved story references before Continue is exposed.
- Every storage read/write/remove is guarded. Once persistent storage fails, the store keeps current progress/settings in memory.

GREEN:

- Immediate start/reload browser test passed on desktop and mobile.
- Full teacher choice and scene flow passed on desktop and mobile with byte-for-byte save equality and zero observed progress writes.
- Throwing-storage unit tests passed.
- Throwing-browser-storage gameplay test passed on desktop and mobile without fallback.
- Unknown saved script cleanup test passed on desktop and mobile.

### 2. Pause/Modal Exclusivity

- Pause captures whether dialogue or HUD was active, clears movement, suspends audio, hides dialogue without discarding its current node, and shows only the menu.
- In-page Continue restores the captured HUD/dialogue directly without loading storage or replaying choice effects/history.
- New journey, normal Continue, teacher browsing, and chapter selection clear paused state.

GREEN:

- Pause regression passed on desktop and mobile.
- It verifies exclusive menu visibility, exact choice labels, unchanged history count, one choice effect application, and HUD-to-HUD restoration.

### 3. Input And Movement Lifecycle

- Desired input is now separate from world-applied movement.
- Dialogue nodes, hotspot activation, pause, settings, history opening, echo, scene changes, and visibility loss clear keyboard/touch/world movement.
- Touch zero/reset events update desired input even while gameplay is inactive.
- Echo restoration applies the current desired input state instead of a captured vector.

GREEN:

- The full desktop and mobile flows hold movement into hotspot dialogue and release movement during echo.
- Dialogue coordinates remain fixed after one status publication interval.
- Movement remains zero after echo when the key/joystick was released during echo.
- The desktop full player flow also passed 3 consecutive repetitions after the diagnostic sampling correction.

### 4. Echo Quality Correctness

- The resolved active world quality is tracked independently of the persisted `auto` preference.
- Echo snapshots preserve and restore the resolved quality object.
- Echo restoration no longer saves settings or re-resolves `auto` to high.

GREEN:

- Desktop browser coverage forces a sustained 25 FPS window, observes auto downgrade to low, enters the 4500 ms echo, and verifies low quality during and after echo.
- Existing explicit high/low live-quality coverage remains green.

### 5. Exactly One Animation-Frame Lifecycle

- Removed the independent quality-monitor animation loop from `main.mjs`.
- The world render loop now sends frame timestamps to the quality monitor through `onFrame`.
- Visibility and teardown reset quality sampling while controlling only the world's render frame.

GREEN:

- Lifecycle browser coverage verifies exactly one cancellation on hide, zero pending frames while hidden, exactly one request on resume, and one pending frame after resume.
- Auto-quality unit coverage still verifies continuous sub-26 FPS for five seconds, reset after recovery/visibility, one-shot downgrade, and explicit quality behavior.

### 6. Production Test Shortcuts Removed

- Removed `testHud` and direct `scene` query behavior from production `game/main.mjs`.
- Canvas tests now enter activity room and reeds through the real teacher chapter UI or the normal journey.
- Instrumentation only observes browser behavior or adjusts requested frame timing.

GREEN:

- The query contract test passes on desktop and mobile and proves `?mode=new&testHud=1&scene=reeds-wetland` still starts the activity-room prologue with normal dialogue.
- Production search found no `testHud` or `scene` query bypass in `game/`.

### 7. Accessibility Status

- `#game-status` remains the read-only hidden test diagnostic.
- It now has `aria-hidden="true"` and no `aria-live`.
- Dialogue, quality, loading, and fallback announcements retain their semantic live regions.

GREEN:

- Desktop and mobile accessibility tests verify the diagnostic is hidden, has no live role, coordinates do not appear in any live region, and `player=` is absent from the accessibility snapshot.

### 8. Team Identity Typo

- Homepage visible identity changed from `陈宇` to approved `陈屿`.

GREEN:

- Rendered homepage coverage asserts the exact ordered names `顾言`, `陈屿`, `林夏`.
- Story-data coverage asserts exact genders `男`, `男`, `女` and exact counts of two male and one female leads.

### 9. Completed Hotspot Polish

- The world receives completed hotspot IDs from session state.
- Proximity selection excludes completed IDs, which removes their marker/prompt/interact eligibility.
- Session uniqueness and three-hotspot convergence behavior remain unchanged.

GREEN:

- Unit proximity and session synchronization tests passed.
- The full desktop/mobile flow verifies the prompt is hidden, interaction availability is false, and the touch interaction button is disabled after each unique completion.
- Existing unique completion and convergence tests remain green.

## Final Verification

Focused GREEN:

- Focused unit set: 34/34 passed.
- Focused game-canvas regression set: 5/5 passed.
- Focused desktop prototype set: 4/4 passed.
- Focused mobile movement flow: 1/1 passed.
- Continue-after-teacher restore test: 1/1 passed.
- Desktop full player flow repeat: 3/3 passed.

Release command:

```text
npm.cmd test
```

Final result:

- Unit: 69 passed, 0 failed, 0 skipped.
- Browser: 35 passed, 0 failed, 9 project-specific skips.
- Total passing tests: 104.
- Total failures: 0.

Additional verification:

- `npx.cmd playwright test tests/e2e/visual-regression.spec.mjs`: 5 passed, 1 project-specific skip.
- `git diff --check`: passed.
- `git diff --cached --check`: passed before commit.
- Port 4173: no listener after tests.
- `.planning/`: absent.

One earlier full-suite run had a single diagnostic assertion failure caused by reading the throttled status less than one publication interval after echo. The behavior showed a one-frame 0.03 coordinate delta, not continued drift. The test now waits one existing 150 ms status publication interval before taking its baseline; the focused repeat and the complete release rerun passed.

## Screenshot And Canvas Inspection

All images are generated test output under `test-results/` and are not committed.

Homepage:

- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-desktop/task-8-homepage-desktop-1440x900.png`
- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-mobile-landscape/task-8-homepage-mobile-390x844.png`

Desktop game:

- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-activity-room-desktop-1440x900.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-normal-dialogue-desktop-1440x900.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-choice-dialogue-desktop-1440x900.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-historical-echo-desktop-1440x900.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-reeds-scene-desktop-1440x900.png`

Mobile landscape game:

- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-activity-room-mobile-landscape-844x390.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-normal-dialogue-mobile-landscape-844x390.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-choice-dialogue-mobile-landscape-844x390.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-historical-echo-mobile-landscape-844x390.png`
- `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-reeds-scene-mobile-landscape-844x390.png`

Inspection:

- Homepage desktop and portrait-mobile views retain the full-bleed three-character hero, exact two-men/one-woman composition, readable calls to action, and a visible hint of the next section.
- Desktop and mobile dialogue/choice layouts fit without incoherent overlap; the longest choice wraps to exactly two contained lines.
- Historical echo remains visually distinct and legible on desktop and mobile.
- Reeds scenes remain nonblank, full-bleed, correctly framed, and usable with desktop/mobile controls.
- All ten game evidence files report opaque ratio 1.0, luminance spread from 158 to 227, and all six tracked overlap flags false.
- Desktop/mobile choice evidence reports `contained: true`, two lines, and no tracked intersections.

## Files Changed In Commit

Production:

- `game/core/proximity.mjs`
- `game/core/save-store.mjs`
- `game/core/session-controller.mjs`
- `game/core/story-engine.mjs`
- `game/index.html`
- `game/main.mjs`
- `game/render/world.mjs`
- `game/ui/dialogue-view.mjs`
- `game/ui/game-shell.mjs`
- `index.html`

Tests:

- `tests/e2e/game-canvas.spec.mjs`
- `tests/e2e/prototype-flow.spec.mjs`
- `tests/unit/game-shell-contract.unit.test.cjs`
- `tests/unit/homepage-contract.unit.test.cjs`
- `tests/unit/proximity.unit.test.mjs`
- `tests/unit/save-store.unit.test.mjs`
- `tests/unit/session-controller.unit.test.mjs`
- `tests/unit/story-data.unit.test.mjs`

## Self-Review And Concerns

- Rechecked all nine findings against the committed diff and focused/full evidence.
- Production contains one render RAF owner, no mutable/global game-state test hook, and no query bypass.
- No network dependency, timeout relaxation, skip addition for new behavior, test-side style mutation, archive-repair language, or production debug switch was introduced.
- The only remaining tracked worktree modification is the explicitly protected pre-existing `task-2-report.md` change, which is unstaged and outside commit `6f42b3c`.
- This report was generated after the implementation commit so it could contain the exact commit SHA; it is not part of that implementation/test commit.
- No implementation concern remains.

## Final Re-Review Residuals

Date: 2026-07-27
Residual commit subject: `fix: close final review residuals`

### Residual RED Evidence

Focused unit command:

```text
node --test --test-name-pattern="restored active choice|restored choice records|pausing historical echo" tests/unit/story-engine.unit.test.mjs tests/unit/session-controller.unit.test.mjs
```

RED result: 3 tests, 0 passed, 3 failed.

- Echo pause failed because the session controller had no pause API.
- Restoring an active choice already present in `choices` did not throw.
- Restoring a selected choice option absent from the script graph did not throw.

Focused browser command:

```text
npx.cmd playwright test tests/e2e/prototype-flow.spec.mjs tests/e2e/game-canvas.spec.mjs --grep "progressed new journey|restored active choice|pause suspends historical echo"
```

RED result: 6 tests, 0 passed, 6 failed across desktop and mobile landscape.

- `mode=new` remained in the URL.
- The inconsistent selected-active-choice save exposed Continue.
- The echo timer expired behind pause and replaced the menu with dialogue.

### Residual 1: Progressed Reload Under `mode=new`

- After `session.startNew()` creates the valid first checkpoint, `main.mjs` removes only the `mode` query parameter with `history.replaceState`.
- The current path, hash, and every other query parameter remain unchanged.
- The existing full player flow now treats the consumed game URL as the normal route.

GREEN browser coverage:

- Starts at `/game/?campaign=summer&mode=new#checkpoint`.
- Verifies the URL becomes `/game/?campaign=summer#checkpoint`.
- Advances through the prologue choice and records the exact serialized save.
- Reloads the current URL and verifies a save-aware menu without save mutation.
- Clicks Continue and restores `prologue-lin-xia-response`, the selected `hear-gu-yan` choice, and `activity-room`.
- Passed on desktop and mobile landscape.

### Residual 2: Graph-Aware Restored Choice Consistency

- Story restoration now resolves active scripts/nodes against the script graph.
- It requires the active node to be represented in `readNodes`.
- Every recorded choice must resolve to a real choice node and a real option.
- An active choice node already present in `choices` is rejected before mutating engine state.
- Unknown completed script IDs are rejected.
- `main.mjs` uses the story-engine validation boundary before exposing Continue; bad progress is cleared and the safe menu remains available without fallback.

GREEN coverage:

- Two focused story-engine restoration tests passed.
- The browser regression with `prologue-focus` both active and selected passed on desktop and mobile.
- It verifies Continue is hidden, the malformed save is removed, and WebGL fallback is not shown.

### Residual 3: Pause During Historical Echo

- The session controller now owns a coherent `pause()` / `resume()` lifecycle for the historical echo timer.
- Pause records the exact remaining duration and cancels the timer.
- Resume schedules only that remaining duration.
- A timer callback racing with pause defers completion while narrative pause is active.
- Main connects in-page pause/Continue to this lifecycle while preserving its existing menu, dialogue, movement, quality, and audio behavior.

GREEN coverage:

- Unit timing coverage pauses after 1000 ms, waits 5000 ms with no advance or interaction restoration, resumes, and advances only after the remaining 3500 ms.
- The real browser regression seeds a valid convergence checkpoint, enters the actual 4500 ms echo, pauses, waits 4750 ms, and verifies the menu remains exclusive and the saved node stays `reeds-echo`.
- Continue restores the echo, waits the retained duration, then presents `reeds-return`.
- Desktop and mobile coverage verifies low quality, stable coordinates, and one additional audio suspend/resume around pause.

### Residual GREEN And Release Evidence

Focused GREEN:

- Focused unit residual set: 3/3 passed.
- Focused browser residual set: 6/6 passed.
- Echo browser repeat after mobile input synchronization: 2/2 passed.
- Full unit surface: 72/72 passed.

Final release command:

```text
npm.cmd test
```

Final release result:

- Unit: 72 passed, 0 failed, 0 skipped.
- Browser: 39 passed, 0 failed, 9 existing project-specific skips.
- Total passing tests: 111.
- Included visual regression coverage: 5 passed, 1 project-specific skip.

The first full run had one mobile test-harness failure because its synthetic keyboard unlock could occur before mobile initialization installed the listener. The production behavior and all residual assertions had already passed in the focused run. The test now waits for the menu and uses a real touchscreen tap on mobile; the two-project repeat and the complete release rerun passed.

### Residual Files And Constraint Review

Production:

- `game/core/session-controller.mjs`
- `game/core/story-engine.mjs`
- `game/main.mjs`

Tests:

- `tests/e2e/game-canvas.spec.mjs`
- `tests/e2e/prototype-flow.spec.mjs`
- `tests/unit/session-controller.unit.test.mjs`
- `tests/unit/story-engine.unit.test.mjs`

Review:

- Save format, teacher ephemerality, throwing-storage fallback, current-input echo movement, resolved low echo quality, inaccessible diagnostics, completed-hotspot suppression, and approved identities remain covered by the full suite.
- The world remains the only animation-frame owner.
- No production hooks, new skips, timeout relaxation, network dependency, or test-side style mutation were added.
- Visual regression ran inside the final release suite; no production visual files changed.
- Screenshots and traces remain uncommitted test output.
- `.planning/` is absent.
- The protected pre-existing `task-2-report.md` modification remains unstaged and untouched.
