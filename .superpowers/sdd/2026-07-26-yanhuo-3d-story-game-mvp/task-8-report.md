# Task 8 Report: Resilience, Accessibility, Visual QA, and Release

## Status

DONE. Task 8 is implemented and verified on `feature/yanhuo-3d-story-game` from baseline `287b9d437d266910cdcb285f6ca14b4745d175a0`.

## Implementation

- Moved the Three.js world behind WebGL preflight. `game/main.mjs` now imports `game/render/world.mjs` dynamically only after `detectWebGL()` succeeds.
- WebGL failure renders the exact message `当前设备无法启动 3D 场景` and a real relative `返回成果页` link. The failure path does not request or initialize the world module.
- Portrait sprites retain the approved successful rendering. A failed sprite probe now sets `data-portrait-fallback="true"` and shows a reed-green named silhouette in the same fixed portrait column.
- Audio remains optional. Missing `AudioContext` does not block dialogue. Audio unlock listeners now survive early gestures while the dynamic world import is pending.
- Visibility loss explicitly stops the world and quality RAF loop, clears movement, pauses dialogue autoplay, and suspends audio. Visibility restore starts each subsystem once and resumes safely.
- Added a deterministic auto-quality monitor. Only `auto` mode can downgrade, only after average FPS remains below 26 for a continuous 5000 ms window, and only once per session. Recovery, explicit high/low, and visibility reset restart or disable the window. The exact accessible announcement is `已切换为流畅画质`.
- Preserved live explicit quality switching, the 18-degree camera contract, scene disposal, portraits, wetland framing, echo treatment, and summary behavior.
- Fixed the visual defect found during original-resolution inspection: the desktop `E · 互动` prompt could overlap the third convergence choice. It is now hidden whenever dialogue is active.
- Fixed Playwright release concurrency at two Edge workers. Six simultaneous 3D flows exhausted local CPU/GPU time and caused completed journeys to exceed the old 30-second per-test limit; two-worker execution preserves the timeout and passes reliably.
- Replaced README content with the exact Task 8 release, preview, test, publishing, content, and Three.js license information.

## Preflight-Resolution Behavior Tests

No test concatenates or regex-scans runtime source for URLs, replacement characters, or old terminology.

- Rendered homepage and all covered game views assert visible DOM text and accessible names contain no U+FFFD.
- All covered views assert visible copy excludes `证据匹配`, `档案修复`, and `修复档案`.
- Homepage/game traversal records every browser request and asserts the request origin is exactly `http://127.0.0.1:4173`. Remote audio requests are rejected.
- Navigation uses real `开始旅程`, `教师浏览`, chapter, and `返回成果页` links/buttons.
- Forced WebGL failure records requests and proves `game/render/world.mjs` was never requested.
- `release-contract.unit.test.cjs` contains only README content checks and filesystem asset-budget checks.

## RED/GREEN Evidence

1. Release contract RED: README heading expected `# 雁火渡江：夏日回响` but found the old archive-showcase heading. Asset budgets already passed. GREEN after the exact README replacement.
2. WebGL RED: browser received the old three-dimensional-scene wording. GREEN after exact fallback copy and dynamic world import; request log proved no world request and the return link navigated home.
3. Portrait RED: failed local sprites left no `data-portrait-fallback`. GREEN after the named silhouette fallback; dialogue still advanced.
4. Quality-unit RED: `createAutoQualityMonitor` was absent. GREEN: 6/6 quality tests passed, including continuous five-second low FPS, one-shot behavior, explicit high/low exclusion, recovery, and visibility reset.
5. Quality-browser RED: simulated sustained 25 FPS remained high after five seconds. GREEN: switched once to low and announced `已切换为流畅画质`.
6. Visibility/audio RED: dynamic import allowed a `{ once: true }` unlock listener to disappear before the audio manager existed. Browser diagnostics showed `AudioContext` available but zero constructions. GREEN after retaining listeners until a real unlock attempt; frame stop/restart, autoplay pause/resume, one suspend, and safe resume passed.
7. Visual-overlap RED: original desktop choice screenshot showed `E · 互动` over the third option. Added real interaction-prompt/dialogue/choice rectangle assertions; both intersections were `true`. GREEN after the dialogue-active CSS rule; both became `false`.
8. Initial full-suite run: 65 unit tests passed, while two prior full-story tests timed out under six-worker contention after already reaching the completion view. Focused rerun passed both in about 17 seconds. Full E2E with two workers passed, so `workers: 2` was committed to configuration.

## Final Verification

- `npm test`: PASS.
  - Unit: 65 passed, 0 failed.
  - Playwright: 21 passed, 7 intentional project-specific skips, 0 failed, using installed Microsoft Edge.
- `git diff --check`: PASS, no whitespace errors.
- Release budgets:
  - Homepage: 305,296 bytes (0.291 MiB), below 12 MiB.
  - Game assets excluding vendored Three.js: 2,487,792 bytes (2.373 MiB), below 25 MiB.
- Preview server: stopped; no listener on port 4173.
- Runtime requests: same-origin only in all covered traversals; no remote audio.
- Screenshots and JSON evidence remain under `test-results` only and are not committed.

## Screenshot Evidence

All 12 screenshots below were opened and inspected at original resolution after the final `npm test`.

Homepage:

- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-desktop/task-8-homepage-desktop-1440x900.png` - 1440 x 900. First viewport clearly identifies the game, shows exactly two men and one woman, and exposes the next section.
- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-mobile-landscape/task-8-homepage-mobile-390x844.png` - 390 x 844. All three characters remain visible, text/buttons fit, and the next section is visible.

Desktop game (`test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/`):

- `task-8-activity-room-desktop-1440x900.png` - stable full-bleed room framing; player, marker, furniture, and NPCs are coherent.
- `task-8-reeds-scene-desktop-1440x900.png` - nonblank wetland; boardwalk, reeds, player, and hotspot actors are separated.
- `task-8-normal-dialogue-desktop-1440x900.png` - approved Lin Xia portrait preserved; portrait, speaker, line, and controls do not overlap.
- `task-8-choice-dialogue-desktop-1440x900.png` - all choices fit; the repaired interaction prompt no longer appears over choices.
- `task-8-historical-echo-desktop-1440x900.png` - full echo sentence is readable; muted crimson treatment clearly distinguishes the echo from reality.

Mobile landscape game (`test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/`):

- `task-8-activity-room-mobile-landscape-844x390.png` - full-bleed room and touch controls are correctly framed.
- `task-8-reeds-scene-mobile-landscape-844x390.png` - boardwalk/player remain centered; touch controls do not cover scene targets.
- `task-8-normal-dialogue-mobile-landscape-844x390.png` - portrait and wrapped line fit without clipping or control overlap.
- `task-8-choice-dialogue-mobile-landscape-844x390.png` - three choices remain in bounds; no touch/dialogue overlap.
- `task-8-historical-echo-mobile-landscape-844x390.png` - complete echo text wraps cleanly and remains visually distinct.

Canvas pixel evidence for the 10 game screenshots:

| View | Desktop spread | Mobile spread |
| --- | ---: | ---: |
| Activity room | 206 | 214 |
| Reeds scene | 165 | 228 |
| Normal dialogue | 206 | 214 |
| Choice dialogue | 158 | 227 |
| Historical echo | 148 | 222 |

Every spread is greater than 24 and every sampled canvas had opaque ratio 1.000. In all 10 evidence files, dialogue/choices, portrait/speaker, touch/dialogue, interaction/dialogue, and interaction/choices intersections were `false`. Every visible button had nonzero width and height. The longest production option, `用一个长镜头保留现场的水声和距离。`, formed two lines at a constrained 180 px width with `scrollWidth=clientWidth=178` and `white-space: normal`. Every game view satisfied `document.documentElement.scrollWidth <= window.innerWidth`.

## Files Changed

- `README.md`
- `game/index.html`
- `game/main.mjs`
- `game/render/quality.mjs`
- `game/styles.css`
- `game/ui/dialogue-view.mjs`
- `playwright.config.mjs`
- `tests/e2e/game-canvas.spec.mjs`
- `tests/e2e/visual-regression.spec.mjs`
- `tests/unit/quality.unit.test.mjs`
- `tests/unit/release-contract.unit.test.cjs`
- `.superpowers/sdd/2026-07-26-yanhuo-3d-story-game-mvp/task-8-report.md`

## Self-Review

- All Task 8 exact strings and threshold values are present.
- World import occurs only after WebGL detection.
- Auto downgrade cannot override explicit high/low and cannot repeat.
- Visibility restore is idempotent at the public world/audio/dialogue boundaries.
- Audio unavailable and portrait unavailable paths do not block story nodes.
- No source-scan assertions were introduced.
- Runtime remains relative-URL, same-origin, local-only, and GitHub Pages-safe.
- No gradient, decorative orb, nested-card, viewport-font, negative-letter-spacing, or radius-over-8 change was introduced.
- Existing two-men/one-woman composition, portraits, wetland, echo, summary, 18-degree camera, and disposal contracts remain covered and unchanged.
- No screenshot binary is staged or committed.
- The pre-existing modified Task 2 report was not edited, reverted, staged, or included in the Task 8 commit.

## Concerns

No release blocker remains. The seven Playwright skips are intentional mobile-project exclusions for desktop-only resilience checks, not missing coverage. Screenshot paths are ephemeral Playwright output and will be regenerated by the next E2E run.
