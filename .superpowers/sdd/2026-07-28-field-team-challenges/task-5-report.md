# Task 5 report - Desktop and Touch End-to-End Gameplay

## Scope

- Modified only the requested E2E helper/spec files plus this report.
- No production source was changed.
- Screenshot binaries remain ignored under `test-results` and are not staged.

## RED evidence

- Initial `npx playwright test tests/e2e/prototype-flow.spec.mjs --workers=1`:
  14 passed, 2 failed, 73.1s. Both desktop and mobile stopped after a briefing because the legacy vertical slice expected the hotspot to complete immediately while `#field-task-layer` was active.
- New refresh-recovery regression: after a camera briefing, `sessionState.activeHotspotId` is saved as `camera-spot`; after reload and Continue, `#field-task-layer` remains hidden on desktop and mobile.

## GREEN evidence

- Desktop full vertical slice: 1 passed, 26.7s.
- Mobile-landscape full vertical slice: 1 passed, 29.4s.
- Field-task HUD visual sequence: 1 passed, 29.0s.
- Freeze, blur cleanup, and cancel/re-enter coverage: 6 passed across desktop and mobile. The paired reload test remains RED because of the production defect below.

## Verification

- `npm test -- --workers=1`: unit: 115 passed, 0 failed, 15.9s; E2E: 63 passed, 2 failed, 19 skipped, 2.8m.
- npm reported that the outer `--workers=1` option is not forwarded by this package script; the E2E command consequently used its configured two workers.
- The two E2E failures are both `reloading after a briefing reopens the saved field task` (desktop and mobile-landscape).
- The requested three-spec focused command was attempted with one worker but exceeded the 240s execution limit before producing a final aggregate result. Its independently rerun new vertical, lifecycle, and visual scenarios are listed above.
- `git diff --check`: passed.
- No Node/server process remained after test completion.

## Screenshots inspected

- `C:\Users\axezt\Desktop\暑假社会实践\site\.worktrees\field-team-challenges\test-results\task-5-field-tasks\focus-1440x900.png` (1440x900)
- `C:\Users\axezt\Desktop\暑假社会实践\site\.worktrees\field-team-challenges\test-results\task-5-field-tasks\timing-844x390.png` (844x390)
- `C:\Users\axezt\Desktop\暑假社会实践\site\.worktrees\field-team-challenges\test-results\task-5-field-tasks\listening-390x844.png` (390x844)
- `C:\Users\axezt\Desktop\暑假社会实践\site\.worktrees\field-team-challenges\test-results\task-5-field-tasks\result-1440x900.png` (1440x900)
- `C:\Users\axezt\Desktop\暑假社会实践\site\.worktrees\field-team-challenges\test-results\task-5-field-tasks\summary-390x844.png` (390x844)

Visual inspection: task stages stay framed over a nonblank world, task controls remain in bounds, result stars are readable, and the portrait summary has three score rows with no horizontal overflow.

## Self-check

- `completeVisibleFieldTask(page)` and `completeFieldTaskByKind(page, kind)` complete focus, timing, and listening solely through visible pointer/touch/button interactions.
- Helpers never call the task engine, mutate localStorage, or alter task DOM state. Local storage is read only for score assertions.
- Timing reads the live marker/node CSS variables and dispatches a visible action-button press at the current route index. Listening holds only when `data-quiet=true` and releases otherwise.
- The updated vertical slice preserves convergence, historical echo, chapter-summary, and completed-save restoration assertions.
- Visual checks cover canvas evidence, overflow, viewport bounds, hidden world controls/dialogue during tasks, and the forbidden legacy-theme copy.

## Production defect (not bypassed)

Reproduction on both desktop and mobile-landscape:

1. Open the saved wetland and activate `camera-spot`.
2. Advance both briefing lines until the focus task layer is visible.
3. Confirm local storage contains `sessionState.activeHotspotId === 'camera-spot'`.
4. Reload, select Continue, and wait for the restored session.

Expected: the visible layer has `data-task-id="camera-spot"`.

Actual: `#field-task-layer` is hidden after Continue. The new E2E regression remains intentionally failing to expose this production restore-path defect.
