# Task 4 Report: Briefing and Result Narrative Integration

## Scope expansion note

The requested Task 4 production changes intentionally move reed-hotspot completion from the briefing endpoint to the matching result-script endpoint. The pre-existing `tests/unit/session-controller.unit.test.mjs` test `starts each reed hotspot script only before that hotspot is completed` still asserted that advancing the briefing directly completed `camera-spot`. That expectation contradicts Task 4 and caused the otherwise complete `node --test` run to fail.

The test will be updated minimally to assert the new contract: after the briefing, the field task is shown, the hotspot remains incomplete, and it cannot be activated a second time while its task is active. This is a necessary test-only scope expansion; no Task 1-3 production file will be changed.

## TDD record

- RED: `node --test tests/unit/story-data.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs` failed as intended before production integration. The story contract found `reeds-camera-complete` where `start-camera-field-task` was required; the shell contract found no `createFieldTaskView` use in `game/main.mjs`.
- GREEN: the same focused command passed all 11 tests after the minimal story and main integration changes.
- Regression reconciliation: the initial full `node --test` run failed one pre-existing session test because it asserted the former direct briefing-to-completion flow. The updated expectation then passed in `node --test tests/unit/session-controller.unit.test.mjs` (19/19).

## Verification and self-check

- `node --test`: 115 passed, 0 failed.
- `git diff --check`: passed with no whitespace errors.
- The three briefing endpoints now route to `start-camera-field-task`, `start-notes-field-task`, and `start-voice-field-task`.
- Each new result script has one responsible teammate line and one supporting teammate line before its original `reeds-*-complete` outcome. `game/data/scripts.mjs` already registers all reed scripts through its existing spread, so no change was needed there.
- `main.mjs` creates the field-task view, sends submit and cancel events to the session, uses the required show/hide call order, excludes active tasks from gameplay, and destroys the view on `pagehide`.
- `game-shell.mjs` remains the only writer of `root.dataset.fieldTaskActive`; no Task 1-3 production code was changed.
- Chapter completion renders each `FIELD_TASKS` title and star count plus the accessible total out of nine. The two-men/one-woman team data and the original echo flow are unchanged.

## Commit

- Final commit: pending.
